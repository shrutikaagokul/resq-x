"""
Dynamic traffic simulation for ResQ-X.

Design principles
-----------------
* Deterministic: uses only world.time and road identity — reproducible for tests.
* Non-invasive: updates road.travel_time in-place so that every existing search
  algorithm (A*, UCS, BFS, DFS, Greedy) automatically receives updated costs
  through their unchanged road.cost property without any modification.
* No ML / no random module: congestion patterns are time-based sinusoidal cycles
  combined with a lightweight hash of road identity for staggered variation.
* Emergency priority: reduces congestion penalty for active emergency vehicles,
  applied to road.travel_time only on the resource's current edge; the effect
  is computed per-tick and never persisted in the Road model.
"""
from typing import Literal

# ── Traffic level constants ────────────────────────────────────────────────
TrafficLevel = Literal['FREE', 'LOW', 'MODERATE', 'HEAVY', 'GRIDLOCK']

# Congestion factors by traffic level (simulation parameters).
CONGESTION_FACTORS: dict[str, float] = {
    'FREE':     1.0,
    'LOW':      1.2,
    'MODERATE': 1.5,
    'HEAVY':    2.5,
    'GRIDLOCK': 5.0,
}

# Ordered list for numeric comparison.
LEVELS = ['FREE', 'LOW', 'MODERATE', 'HEAVY', 'GRIDLOCK']

# Emergency priority multipliers per resource type.
# These reduce the effective congestion factor for active emergency vehicles.
EMERGENCY_PRIORITY: dict[str, float] = {
    'AMBULANCE':   0.35,   # Ambulances have highest priority (lights + siren)
    'FIRE_TRUCK':  0.45,   # Fire trucks get good clearance
    'RESCUE_TEAM': 0.55,   # Rescue teams get moderate clearance
}

# Replanning threshold: trigger a replan when route travel-time cost has grown
# by this fraction since the route was last computed.
REPLAN_COST_THRESHOLD = 0.30   # 30 %

# Traffic evolution parameters (all deterministic, time-based).
_CYCLE_PERIOD     = 60.0   # seconds — full congestion wave period
_INCIDENT_DECAY   = 0.08   # congestion factor removed per tick-second during recovery
_TICK_SECONDS     = 0.5    # must match engine tick rate

# Per-road deterministic offset seed (0–1 range) derived from road id string.
def _road_seed(road_id: str) -> float:
    """Deterministic 0-1 value unique to each road identifier."""
    h = 0
    for ch in road_id:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return (h & 0xFFFF) / 0xFFFF


def _level_from_factor(factor: float) -> str:
    """Map a raw congestion factor to the closest named traffic level."""
    if factor <= 1.0:
        return 'FREE'
    if factor <= 1.35:
        return 'LOW'
    if factor <= 1.75:
        return 'MODERATE'
    if factor <= 3.0:
        return 'HEAVY'
    return 'GRIDLOCK'


# ── Initialisation ─────────────────────────────────────────────────────────

def init_road_traffic(road) -> None:
    """Set base_travel_time and initial traffic fields on a Road model.

    Safe to call multiple times: if base_travel_time is already set we leave it
    unchanged so that saved snapshots are not overwritten.
    """
    if road.base_travel_time <= 0:
        road.base_travel_time = road.travel_time
    if road.congestion_factor <= 0:
        road.congestion_factor = 1.0
    road.traffic_level = _level_from_factor(road.congestion_factor)


def init_all_traffic(world) -> None:
    """Initialise traffic state for every road in the world."""
    for road in world.roads.values():
        init_road_traffic(road)


# ── Travel-time application ────────────────────────────────────────────────

def apply_traffic_to_roads(world) -> None:
    """Write effective travel_time back to each Road model.

    Called once per tick BEFORE Graph() is constructed so that all search
    algorithms receive updated costs through their unchanged road.cost property.

    Blocked roads are unchanged (travel_time is irrelevant; they are filtered
    by Graph.neighbors via road.blocked).
    """
    for road in world.roads.values():
        if road.base_travel_time <= 0:
            init_road_traffic(road)
        if road.blocked:
            continue
        effective = round(road.base_travel_time * road.congestion_factor, 3)
        road.travel_time = effective
        road.traffic_level = _level_from_factor(road.congestion_factor)


# ── Emergency vehicle priority ─────────────────────────────────────────────

def apply_emergency_priority(world) -> None:
    """Reduce effective congestion for roads on active emergency vehicle routes.

    This does NOT bypass physically blocked roads.  It only reduces the travel_time
    of roads currently being traversed by an active emergency vehicle.

    The reduction is proportional to the vehicle's EMERGENCY_PRIORITY factor and
    the excess congestion above FREE (factor 1.0).
    """
    for assignment in world.plan.assignments:
        if len(assignment.route.path) < 2:
            continue
        resource = world.resources.get(assignment.resource_id)
        if not resource or not resource.available:
            continue
        priority_mult = EMERGENCY_PRIORITY.get(resource.type, 0.5)
        # Only the current edge (first two nodes in path) benefits.
        a_id, b_id = assignment.route.path[0], assignment.route.path[1]
        road = _find_road(world, a_id, b_id)
        if road and not road.blocked:
            excess = road.congestion_factor - 1.0
            if excess > 0:
                reduced_factor = 1.0 + excess * priority_mult
                road.travel_time = round(road.base_travel_time * reduced_factor, 3)


def _find_road(world, a: str, b: str):
    key_ab = f'{a}-{b}'
    key_ba = f'{b}-{a}'
    return world.roads.get(key_ab) or world.roads.get(key_ba)


# ── Traffic evolution (deterministic, time-based) ─────────────────────────

def _congestion_wave(road, t: float) -> float:
    """Return a baseline congestion factor from a deterministic time-based wave.

    Uses a simple cosine cycle with per-road phase offset so that roads do not
    all peak simultaneously.  Result is in [1.0, 1.6] — ambient background level.
    """
    import math
    phase = _road_seed(road.id) * _CYCLE_PERIOD
    # Cosine oscillates between -1 and 1; map to [0, 1].
    cycle = (1 + math.cos(2 * math.pi * (t + phase) / _CYCLE_PERIOD)) / 2
    # Background traffic goes from FREE (1.0) to LOW/MODERATE (1.6) naturally.
    return 1.0 + cycle * 0.6


def evolve_traffic(world, seconds: float) -> list[dict]:
    """Advance traffic state by one simulation tick.

    Returns a list of condition-change event payloads (may be empty).

    Rules:
    * Background congestion oscillates deterministically with world.time.
    * Manual traffic incidents (road.traffic_incident) add +2.5 to congestion
      and decay at _INCIDENT_DECAY per second toward the background level.
    * Congestion is always clamped to [1.0, 5.0].
    * Blocked roads are skipped (their traversal is already forbidden).
    """
    changes = []
    t = world.time
    for road in world.roads.values():
        if road.blocked:
            continue
        if road.base_travel_time <= 0:
            init_road_traffic(road)

        prev_level = road.traffic_level
        background = _congestion_wave(road, t)

        if road.traffic_incident:
            # Incident: start high, decay toward background.
            target = background + 2.5
            step = _INCIDENT_DECAY * seconds
            new_factor = road.congestion_factor - step
            new_factor = max(background, min(5.0, new_factor))
            # Clear the incident flag once we are back near background.
            if new_factor <= background + 0.05:
                road.traffic_incident = False
                new_factor = background
        else:
            # Smooth transition toward the background wave value.
            gap = background - road.congestion_factor
            new_factor = road.congestion_factor + gap * min(1.0, 0.15 * seconds)

        new_factor = max(1.0, min(5.0, new_factor))
        road.congestion_factor = round(new_factor, 4)
        new_level = _level_from_factor(road.congestion_factor)
        road.traffic_level = new_level

        if new_level != prev_level:
            changes.append({
                'road_id': road.id,
                'previous_level': prev_level,
                'new_level': new_level,
                'congestion_factor': road.congestion_factor,
            })
    return changes


# ── Manual traffic controls ────────────────────────────────────────────────

def increase_congestion(world, road_id: str, levels: int = 1) -> dict:
    """Manually increase congestion on a road by one or more levels."""
    road = world.roads.get(road_id)
    if not road:
        raise ValueError(f'Unknown road: {road_id}')
    if road.blocked:
        raise ValueError('Road is physically blocked; cannot modify traffic level')
    current_idx = LEVELS.index(road.traffic_level)
    new_idx = min(len(LEVELS) - 1, current_idx + levels)
    new_level = LEVELS[new_idx]
    prev_level = road.traffic_level
    road.congestion_factor = CONGESTION_FACTORS[new_level]
    road.traffic_level = new_level
    road.travel_time = round(road.base_travel_time * road.congestion_factor, 3)
    return {'road_id': road_id, 'previous_level': prev_level, 'new_level': new_level,
            'congestion_factor': road.congestion_factor}


def decrease_congestion(world, road_id: str, levels: int = 1) -> dict:
    """Manually decrease congestion on a road by one or more levels."""
    road = world.roads.get(road_id)
    if not road:
        raise ValueError(f'Unknown road: {road_id}')
    current_idx = LEVELS.index(road.traffic_level)
    new_idx = max(0, current_idx - levels)
    new_level = LEVELS[new_idx]
    prev_level = road.traffic_level
    road.congestion_factor = CONGESTION_FACTORS[new_level]
    road.traffic_level = new_level
    road.traffic_incident = False
    road.travel_time = round(road.base_travel_time * road.congestion_factor, 3)
    return {'road_id': road_id, 'previous_level': prev_level, 'new_level': new_level,
            'congestion_factor': road.congestion_factor}


def create_traffic_incident(world, road_id: str) -> dict:
    """Create a temporary traffic incident on a road, spiking congestion to HEAVY."""
    road = world.roads.get(road_id)
    if not road:
        raise ValueError(f'Unknown road: {road_id}')
    if road.blocked:
        raise ValueError('Road is physically blocked')
    prev_level = road.traffic_level
    road.traffic_incident = True
    road.congestion_factor = CONGESTION_FACTORS['HEAVY'] + 1.0   # => GRIDLOCK
    road.traffic_level = _level_from_factor(road.congestion_factor)
    road.travel_time = round(road.base_travel_time * road.congestion_factor, 3)
    return {'road_id': road_id, 'previous_level': prev_level,
            'new_level': road.traffic_level, 'congestion_factor': road.congestion_factor,
            'incident': True}


def clear_traffic_incident(world, road_id: str) -> dict:
    """Clear a temporary traffic incident and begin congestion recovery."""
    road = world.roads.get(road_id)
    if not road:
        raise ValueError(f'Unknown road: {road_id}')
    prev_level = road.traffic_level
    road.traffic_incident = False
    return decrease_congestion(world, road_id, levels=2)


# ── Replanning detection ───────────────────────────────────────────────────

def routes_need_replan(world, threshold: float = REPLAN_COST_THRESHOLD) -> bool:
    """Return True if any active assignment's remaining route is significantly slower.

    Compares the stored route.travel_time (set when the route was computed) against
    the current sum of road.travel_time for each remaining edge.  If the increase
    exceeds `threshold` (fraction), a replan is recommended.

    Does NOT modify any state.
    """
    for assignment in world.plan.assignments:
        path = assignment.route.path
        if len(path) < 2:
            continue
        current_tt = sum(
            r.travel_time
            for a, b in zip(path, path[1:])
            for r in [_find_road(world, a, b)]
            if r and not r.blocked
        )
        stored_tt = assignment.route.travel_time
        if stored_tt > 0 and current_tt > stored_tt * (1 + threshold):
            return True
    return False
