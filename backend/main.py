import asyncio
import os
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator
from backend.database.database import Database
from backend.simulation.engine import Simulation
from backend.simulation.models import IncidentType
from backend.simulation.graph import Graph
from backend.ai.search.algorithms import search
from backend.ai.planning.planner import plan


class IncidentInput(BaseModel):
    id: str | None = Field(default=None, min_length=1, max_length=60, pattern=r'^[A-Za-z0-9_-]+$')
    type: IncidentType
    location: str
    severity: int = Field(ge=1, le=5)
    affected_population: int = Field(ge=1, le=10000)
    patients: int = Field(default=0, ge=0, le=12)
    critical_patients: int = Field(default=0, ge=0, le=12)

    @model_validator(mode='after')
    def valid_patients(self):
        if self.critical_patients > self.patients or self.patients > self.affected_population:
            raise ValueError('Patient counts must fit affected population and critical must fit patients')
        if self.type == 'MEDICAL' and self.patients == 0:
            raise ValueError('A medical incident requires at least one patient')
        return self


class RoadInput(BaseModel):
    road_id: str


class HospitalInput(BaseModel):
    hospital_id: str
    available: bool | None = None
    total_beds: int | None = Field(default=None, ge=0)
    occupied_beds: int | None = Field(default=None, ge=0)
    icu_beds: int | None = Field(default=None, ge=0)
    occupied_icu: int | None = Field(default=None, ge=0)


class ResourceInput(BaseModel):
    resource_id: str


class IncidentChange(BaseModel):
    incident_id: str
    severity: int | None = Field(default=None, ge=1, le=5)
    affected_population: int | None = Field(default=None, ge=1, le=10000)


def create_app(db_path=None, auto_tick=True):
    @asynccontextmanager
    async def lifespan(app):
        database = Database(db_path or os.environ.get('RESQ_DB', str(Path(__file__).parent / 'data' / 'resqx.sqlite3')))
        app.state.simulation = Simulation(database)
        async def clock():
            while True:
                await asyncio.sleep(0.5)
                app.state.simulation.tick()
        task = asyncio.create_task(clock()) if auto_tick else None
        try:
            yield
        finally:
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            database.close()

    app = FastAPI(title='RESQ-X Classical AI Simulation', version='1.0.0', lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
                       allow_methods=['*'], allow_headers=['*'])

    @app.exception_handler(ValueError)
    async def value_error(request: Request, exc: ValueError):
        return JSONResponse(status_code=422, content={'detail': str(exc)})

    def sim():
        return app.state.simulation

    def public_state():
        state = sim().world.model_dump()
        # The client sees agent knowledge, never hidden road ground truth.
        for road in state['roads'].values():
            road.pop('actual_blocked', None)
        state['decisions'] = state['decisions'][-100:]
        state['events'] = state['events'][-100:]
        return state

    @app.get('/health')
    async def health():
        return {'status': 'ok', 'engine': 'classical-ai'}

    @app.get('/world-state')
    async def world():
        return public_state()

    @app.get('/resources')
    async def resources():
        return sim().world.resources

    @app.get('/incidents')
    async def incidents():
        return sim().world.incidents

    @app.get('/hospitals')
    async def hospitals():
        return sim().world.hospitals

    @app.get('/plan')
    async def current_plan():
        return sim().world.plan

    @app.get('/decisions')
    async def decisions():
        return sim().world.decisions

    @app.get('/decisions/{id}/explanation')
    async def explanation(id: str):
        decision = next((d for d in sim().world.decisions if d.id == id), None)
        if not decision:
            raise HTTPException(404, 'Unknown decision')
        return decision

    @app.post('/incidents')
    @app.post('/events/new-emergency')
    async def add_incident(data: IncidentInput):
        sim().incident(data.model_dump())
        return public_state()

    @app.post('/events/{kind}')
    async def event(kind: str, request: Request):
        models = {'road-block': RoadInput, 'road-reopen': RoadInput, 'road-unknown': RoadInput,
                  'hospital-change': HospitalInput, 'vehicle-failure': ResourceInput,
                  'vehicle-restore': ResourceInput, 'incident-change': IncidentChange}
        if kind not in models:
            raise HTTPException(404, 'Unknown event type')
        data = models[kind].model_validate(await request.json())
        sim().change(kind, data.model_dump(exclude_none=True))
        return public_state()

    @app.post('/replan')
    async def replan():
        plan(sim().world)
        sim().save()
        return public_state()

    @app.post('/simulation/{action}')
    async def control(action: Literal['reset', 'start', 'pause', 'demo', 'step']):
        if action == 'reset':
            sim().reset()
        elif action == 'demo':
            sim().demo()
        elif action == 'step':
            running = sim().world.running
            sim().world.running = True
            sim().tick()
            sim().world.running = running
        else:
            sim().world.running = action == 'start'
        sim().save()
        return public_state()

    @app.get('/search')
    async def compare(start: str, goal: str, algorithm: Literal['BFS', 'DFS', 'UCS', 'Greedy', 'A*'] = 'A*'):
        return search(Graph(sim().world), start, goal, algorithm)

    return app


app = create_app()
