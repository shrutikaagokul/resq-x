"""Tests for type-specific incident creations, resource requirements, and lifecycle updates."""
import pytest


@pytest.mark.parametrize('incident_type,expected_resources,patients', [
    ('MEDICAL', ['AMBULANCE'], 1),
    ('FIRE', ['FIRE_TRUCK'], 0),
    ('ACCIDENT', ['RESCUE_TEAM', 'AMBULANCE'], 1),
    ('FLOOD', ['RESCUE_TEAM'], 0),
    ('INDUSTRIAL', ['FIRE_TRUCK', 'RESCUE_TEAM'], 0),
    ('EVACUATION', ['RESCUE_TEAM'], 0),
])
def test_all_incident_types_resource_allocation(client, incident_type, expected_resources, patients):
    client.post('/simulation/reset')
    payload = {
        'type': incident_type,
        'location': 'N12',
        'severity': 4,
        'affected_population': 45 if incident_type == 'EVACUATION' else 20,
        'patients': patients,
        'critical_patients': 0,
    }
    res = client.post('/incidents', json=payload)
    assert res.status_code == 200, res.text
    world = res.json()
    inc = list(world['incidents'].values())[0]
    assert inc['type'] == incident_type
    assert inc['location'] == 'N12'
    for res_type in expected_resources:
        assert res_type in inc['required_resources']

    assignments = world['plan']['assignments']
    assigned_kinds = [world['resources'][a['resource_id']]['type'] for a in assignments]
    for res_type in expected_resources:
        assert res_type in assigned_kinds


def test_multiple_simultaneous_incidents_different_types(client):
    client.post('/simulation/reset')
    # 1. Create FIRE at N00
    r1 = client.post('/incidents', json={
        'id': 'INC-FIRE',
        'type': 'FIRE',
        'location': 'N00',
        'severity': 3,
        'affected_population': 10,
        'patients': 0,
    })
    assert r1.status_code == 200

    # 2. Create MEDICAL at N22
    r2 = client.post('/incidents', json={
        'id': 'INC-MED',
        'type': 'MEDICAL',
        'location': 'N22',
        'severity': 4,
        'affected_population': 15,
        'patients': 2,
    })
    assert r2.status_code == 200

    # 3. Create FLOOD at N44
    r3 = client.post('/incidents', json={
        'id': 'INC-FLOOD',
        'type': 'FLOOD',
        'location': 'N44',
        'severity': 4,
        'affected_population': 30,
        'patients': 0,
    })
    assert r3.status_code == 200

    state = client.get('/world-state').json()
    assert len(state['incidents']) == 3
    active = [i for i in state['incidents'].values() if i['status'] != 'RESOLVED']
    assert len(active) == 3
    types = {i['type'] for i in active}
    assert types == {'FIRE', 'MEDICAL', 'FLOOD'}

