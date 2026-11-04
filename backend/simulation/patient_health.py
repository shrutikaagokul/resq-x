"""Deterministic patient health deterioration simulation and condition transition monitoring.

This is an abstract simulation model for educational demonstration of dynamic crisis response.
It does not represent an actual clinical diagnostic or medical scoring system.
"""
from backend.simulation.models import Patient, PatientCondition, WorldState

# Demonstration thresholds (abstract simulation parameters, not clinical standards)
INITIAL_HEALTH_SCORE: float = 100.0
SERIOUS_THRESHOLD: float = 75.0
CRITICAL_THRESHOLD: float = 50.0
DEFAULT_DETERIORATION_RATE: float = 1.0


def determine_condition(
    health_score: float,
    serious_threshold: float = SERIOUS_THRESHOLD,
    critical_threshold: float = CRITICAL_THRESHOLD,
) -> PatientCondition:
    """Determine patient condition based on simulation health score thresholds."""
    if health_score <= critical_threshold:
        return 'CRITICAL'
    if health_score <= serious_threshold:
        return 'SERIOUS'
    return 'STABLE'


def init_patient_health(
    patient: Patient,
    initial_health: float = INITIAL_HEALTH_SCORE,
    deterioration_rate: float = DEFAULT_DETERIORATION_RATE,
    serious_threshold: float = SERIOUS_THRESHOLD,
    critical_threshold: float = CRITICAL_THRESHOLD,
) -> Patient:
    """Initialize a patient's simulated health profile."""
    patient.waiting_time = 0.0
    patient.deterioration_rate = max(0.0, deterioration_rate)
    if patient.critical or patient.condition == 'CRITICAL':
        patient.condition = 'CRITICAL'
        patient.critical = True
        patient.health_score = min(patient.health_score, critical_threshold)
    else:
        patient.health_score = initial_health
        patient.condition = determine_condition(patient.health_score, serious_threshold, critical_threshold)
        patient.critical = (patient.condition == 'CRITICAL')
    return patient


def update_patient_waiting_time(patient: Patient, delta_time: float) -> float:
    """Update patient waiting time monotonically."""
    patient.waiting_time = round(patient.waiting_time + max(0.0, delta_time), 3)
    return patient.waiting_time


def apply_health_deterioration(patient: Patient, delta_time: float) -> float:
    """Apply health deterioration based on simulation time and deterioration rate."""
    delta_health = patient.deterioration_rate * max(0.0, delta_time)
    patient.health_score = max(0.0, round(patient.health_score - delta_health, 3))
    return patient.health_score


apply_deterioration = apply_health_deterioration


def update_critical_flag(patient: Patient, critical_threshold: float = CRITICAL_THRESHOLD) -> bool:
    """Update existing critical boolean when critical threshold is crossed."""
    if patient.health_score <= critical_threshold or patient.condition == 'CRITICAL':
        patient.critical = True
        patient.condition = 'CRITICAL'
        return True
    return False


def is_eligible_for_deterioration(patient: Patient) -> bool:
    """
    Patients deteriorate while WAITING or ASSIGNED (en route / on scene).
    Deterioration stops once IN_TRANSIT (in ambulance) or ADMITTED (hospitalized).
    """
    return patient.status in ('WAITING', 'ASSIGNED')


def step_patient_health(
    patient: Patient,
    delta_time: float,
    serious_threshold: float = SERIOUS_THRESHOLD,
    critical_threshold: float = CRITICAL_THRESHOLD,
) -> dict | None:
    """
    Step health simulation for a single patient over delta_time simulation seconds.
    Returns transition details dictionary if condition changed, or None if unchanged.
    """
    if not is_eligible_for_deterioration(patient):
        return None

    prev_health = patient.health_score
    prev_condition = patient.condition
    prev_critical = patient.critical

    update_patient_waiting_time(patient, delta_time)
    apply_health_deterioration(patient, delta_time)

    new_condition = determine_condition(patient.health_score, serious_threshold, critical_threshold)
    patient.condition = new_condition
    if new_condition == 'CRITICAL':
        update_critical_flag(patient, critical_threshold)

    if new_condition != prev_condition:
        return {
            'patient_id': patient.id,
            'previous_condition': prev_condition,
            'new_condition': new_condition,
            'previous_health': prev_health,
            'previous_health_score': prev_health,
            'updated_health': patient.health_score,
            'updated_health_score': patient.health_score,
            'waiting_time': patient.waiting_time,
            'critical_changed': patient.critical != prev_critical,
            'entities': [patient.id],
        }
    return None


def update_all_patients_health(
    world: WorldState,
    delta_time: float,
    serious_threshold: float = SERIOUS_THRESHOLD,
    critical_threshold: float = CRITICAL_THRESHOLD,
) -> list[dict]:
    """Update health for all eligible patients in the world, returning all condition transitions."""
    transitions = []
    for patient in world.patients.values():
        transition = step_patient_health(
            patient, delta_time, serious_threshold=serious_threshold, critical_threshold=critical_threshold
        )
        if transition:
            transitions.append(transition)
    return transitions
