def test_endpoints_and_explanations(client):
    assert client.get('/health').json()['status'] == 'ok'
    world = client.post('/simulation/demo').json()
    assert len(world['plan']['assignments']) == 4
    for route in ['/world-state', '/resources', '/incidents', '/hospitals', '/plan', '/decisions']:
        assert client.get(route).status_code == 200
    decision = next(d for d in world['decisions'] if d['algorithm'] == 'CSP + A*')
    response = client.get(f"/decisions/{decision['id']}/explanation")
    assert response.json()['evidence']['assignment']['response_route']['reachable']
    assert 'actual_blocked' not in next(iter(world['roads'].values()))
    assert client.post('/simulation/pause').json()['running'] is False
    assert client.post('/simulation/start').json()['running'] is True
    assert client.post('/simulation/reset').json()['incidents'] == {}


def test_input_errors_do_not_break_world(client):
    assert client.post('/events/road-block', json={'road_id': 'bad'}).status_code == 422
    assert client.post('/events/hospital-change', json={'hospital_id': 'H1', 'total_beds': 0}).status_code == 422
    assert client.post('/events/vehicle-failure', json={'resource_id': 'bad'}).status_code == 422
    assert client.post('/incidents', json={'type': 'INVALID'}).status_code == 422
    data = {'id': 'TEST', 'type': 'MEDICAL', 'location': 'N02', 'severity': 3, 'affected_population': 5, 'patients': 1}
    assert client.post('/incidents', json=data).status_code == 200
    assert client.post('/incidents', json=data).status_code == 422
    assert client.get('/decisions/missing/explanation').status_code == 404
    assert client.get('/search?start=N00&goal=N44&algorithm=A*').json()['reachable']
    assert client.get('/search?start=BAD&goal=N44').status_code == 422


def test_api_all_event_types(client):
    client.post('/simulation/demo')
    changes = [('road-block', {'road_id': 'N00-N01'}), ('road-reopen', {'road_id': 'N00-N01'}),
               ('road-unknown', {'road_id': 'N00-N01'}), ('hospital-change', {'hospital_id': 'H1', 'available': False}),
               ('vehicle-failure', {'resource_id': 'AMB-01'}), ('vehicle-restore', {'resource_id': 'AMB-01'}),
               ('incident-change', {'incident_id': 'FACTORY-FIRE', 'severity': 5})]
    for kind, data in changes:
        result = client.post(f'/events/{kind}', json=data)
        assert result.status_code == 200, result.text
    assert client.post('/replan').status_code == 200
