import pytest
from backend.database.database import Database
from backend.simulation.engine import Simulation
from backend.main import create_app
from fastapi.testclient import TestClient


@pytest.fixture
def sim():
    db = Database(':memory:')
    simulation = Simulation(db)
    yield simulation
    db.close()


@pytest.fixture
def client():
    with TestClient(create_app(':memory:', auto_tick=False)) as c:
        yield c


def medical(sim, id='MED', severity=4, critical=1, patients=1, location='N22'):
    return sim.incident(dict(id=id, type='MEDICAL', location=location, severity=severity,
                             affected_population=10, patients=patients, critical_patients=critical))
