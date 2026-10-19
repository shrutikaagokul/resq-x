from .models import Building, Hospital, Node, Resource, Road, WorldState


def seed_world() -> WorldState:
    world = WorldState()
    for row in range(5):
        for col in range(5):
            key = f'N{row}{col}'
            world.nodes[key] = Node(id=key, x=(col-2)*12, z=(row-2)*12)
    for row in range(5):
        for col in range(5):
            for dr, dc in [(0, 1), (1, 0)]:
                if row+dr > 4 or col+dc > 4:
                    continue
                a, b = f'N{row}{col}', f'N{row+dr}{col+dc}'
                key = f'{a}-{b}'
                world.roads[key] = Road(id=key, a=a, b=b, distance=12,
                                       travel_time=5 + ((row+col) % 3), risk=0)
    world.hospitals = {
        'H1': Hospital(id='H1', name='Central Medical', location='N04', total_beds=8,
                       occupied_beds=5, icu_beds=2, occupied_icu=1),
        'H2': Hospital(id='H2', name='Riverside General', location='N40', total_beds=6,
                       occupied_beds=3, icu_beds=2, occupied_icu=1),
    }
    for id, kind, node, available in [
        ('AMB-01', 'AMBULANCE', 'N02', True), ('AMB-02', 'AMBULANCE', 'N40', True),
        ('AMB-03', 'AMBULANCE', 'N04', False), ('FIRE-01', 'FIRE_TRUCK', 'N00', True),
        ('FIRE-02', 'FIRE_TRUCK', 'N44', False), ('RES-01', 'RESCUE_TEAM', 'N20', True),
        ('RES-02', 'RESCUE_TEAM', 'N42', True),
    ]:
        capabilities = {'AMBULANCE': ['medical', 'transport', 'critical'],
                        'FIRE_TRUCK': ['fire', 'industrial'], 'RESCUE_TEAM': ['rescue', 'evacuation']}[kind]
        world.resources[id] = Resource(id=id, type=kind, location=node, available=available,
                                      status='IDLE' if available else 'MAINTENANCE', capabilities=capabilities)
    sites = [('H1', 'Central Medical', 'hospital', 'N04', 4),
             ('H2', 'Riverside General', 'hospital', 'N40', 4),
             ('F1', 'Eastbank Works', 'factory', 'N23', 4),
             ('S1', 'Northside School', 'school', 'N12', 2.8),
             ('SH1', 'Civic Shelter', 'shelter', 'N42', 2.5),
             ('D1', 'Response HQ', 'station', 'N00', 3)]
    for id, name, kind, node, height in sites:
        n = world.nodes[node]
        world.buildings.append(Building(id=id, name=name, kind=kind, node=node,
                                        x=n.x-4, z=n.z-4, height=height))
    for row in range(4):
        for col in range(4):
            node = world.nodes[f'N{row}{col}']
            world.buildings.append(Building(id=f'B{row}{col}', name='Residential block',
                kind='residential', node=node.id, x=node.x+5.5, z=node.z+5.5,
                height=3 + ((row*3+col) % 5)))
    expand_city(world)
    return world


def expand_city(world: WorldState):
    """Add districts to the original graph without replacing any old node or edge.

    Also upgrades version-one persisted worlds. Existing incidents, patients,
    resource positions, hospital occupancy and blocked-road state are preserved.
    """
    if world.layout_version >= 2:
        return
    xs = [-46, -35, -24, -12, 0, 12, 24, 36, 49]
    zs = [-47, -35, -24, -12, 0, 12, 24, 36, 49]
    def node_id(row, col):
        return f'N{row-2}{col-2}' if 2 <= row <= 6 and 2 <= col <= 6 else f'X{row}{col}'

    for row, z in enumerate(zs):
        for col, x in enumerate(xs):
            id = node_id(row, col)
            world.nodes.setdefault(id, Node(id=id, x=x, z=z))
    # Deliberate T-junctions and longer perimeter blocks. The original 5x5 grid
    # is untouched; every district retains multiple connections to the centre.
    omitted = {(0, 1, 1, 1), (0, 5, 1, 5), (7, 3, 8, 3), (7, 6, 8, 6),
               (1, 0, 1, 1), (5, 0, 5, 1), (3, 7, 3, 8), (6, 7, 6, 8)}
    for row in range(9):
        for col in range(9):
            for dr, dc in [(0, 1), (1, 0)]:
                rr, cc = row+dr, col+dc
                if rr >= 9 or cc >= 9 or (row, col, rr, cc) in omitted:
                    continue
                a, b = node_id(row, col), node_id(rr, cc)
                id = f'{a}-{b}'
                kind = 'arterial' if (dr == 0 and row == 4) or (dc == 0 and col == 4) else (
                    'secondary' if row in (1, 7) or col in (1, 7) else 'local')
                if id in world.roads:
                    world.roads[id].kind = kind
                    continue
                distance = abs(xs[col]-xs[cc]) + abs(zs[row]-zs[rr])
                world.roads[id] = Road(id=id, a=a, b=b, distance=distance,
                    travel_time=round(distance/(2.5 if kind == 'arterial' else 2), 2), kind=kind)
    world.hospitals.setdefault('H3', Hospital(id='H3', name='Civic Medical Centre', location='N22',
        total_beds=10, occupied_beds=8, icu_beds=2, occupied_icu=2))
    world.hospitals.setdefault('H4', Hospital(id='H4', name='Eastgate Hospital', location='X78',
        total_beds=6, occupied_beds=5, icu_beds=1, occupied_icu=1))
    # The central civic parcel replaces one residential lot. Preserve that
    # apartment's identity in the west district rather than deleting it.
    existing = {b.id: b for b in world.buildings}
    if 'B11' in existing:
        existing['B11'].x, existing['B11'].z, existing['B11'].node = -40.5, 30, 'X60'
    additions = [
        Building(id='H3', name='Civic Medical Centre', kind='hospital', node='N22', x=-5.5, z=-5.5, height=5.5),
        Building(id='H4', name='Eastgate Hospital', kind='hospital', node='X78', x=45, z=32, height=4),
    ]
    parks = {(0, 0), (1, 6), (6, 1), (7, 5)}
    for row in range(8):
        for col in range(8):
            if (2 <= row <= 5 and 2 <= col <= 5) or (row, col) in parks | {(6, 0), (6, 7)}:
                continue
            kind = ('office' if row < 2 and col > 3 else 'warehouse' if col > 5 and row < 3
                    else 'shop' if row == 7 else 'commercial' if col == 0 else 'residential')
            height = 7+(col%3) if kind == 'office' else 2.5 if kind in ('shop', 'warehouse') else 3+(row+col)%4
            id = f'DISTRICT-{row}{col}'
            additions.append(Building(id=id, name=f'{kind.title()} {row+1}-{col+1}', kind=kind,
                node=node_id(row, col), x=(xs[col]+xs[col+1])/2, z=(zs[row]+zs[row+1])/2, height=height))
    # Public services are genuine identifiable buildings on their graph access nodes.
    for id, name, kind, row, col in [('DISTRICT-70', 'Westside School', 'school', 7, 0),
                                    ('DISTRICT-77', 'Eastgate Response', 'station', 7, 7),
                                    ('DISTRICT-01', 'North Community Shelter', 'shelter', 0, 1)]:
        site = next(b for b in additions if b.id == id)
        site.name, site.kind = name, kind
    world.buildings.extend(b for b in additions if b.id not in existing)
    world.layout_version = 2
