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
    return world
