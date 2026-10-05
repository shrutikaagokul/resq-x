from conftest import medical
from test_simulation import assert_valid


def test_preempt_lower_priority_bed_even_with_free_ambulance(sim):
    sim.world.hospitals['H2'].available = False
    h = sim.world.hospitals['H1']
    h.total_beds = h.occupied_beds + 1
    medical(sim, id='LOW', severity=1, critical=0)
    assert len(sim.world.plan.assignments) == 1
    medical(sim, id='HIGH', severity=5, critical=1)
    assert [a.incident_id for a in sim.world.plan.assignments] == ['HIGH']
    assert 'LOW-P1' in sim.world.plan.unassigned
    assert_valid(sim.world)
