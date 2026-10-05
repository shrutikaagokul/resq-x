"""Atomic SQLite snapshots and queryable entity/event tables."""
import sqlite3
from pathlib import Path
from backend.simulation.models import WorldState


class Database:
    def __init__(self, path):
        if str(path) != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(str(path), check_same_thread=False)
        self.connection.execute('PRAGMA journal_mode=WAL')
        self.connection.execute('CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY, data TEXT NOT NULL)')
        for table in ('incidents', 'resources', 'hospitals', 'assignments', 'decisions', 'events'):
            self.connection.execute(f'CREATE TABLE IF NOT EXISTS {table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
        self.connection.commit()

    def load(self):
        row = self.connection.execute('SELECT data FROM snapshot WHERE id=1').fetchone()
        if not row:
            return None
        world = WorldState.model_validate_json(row[0])
        world.running = False
        return world

    def save(self, world):
        with self.connection:
            self.connection.execute('INSERT OR REPLACE INTO snapshot VALUES (1, ?)', (world.model_dump_json(),))
            for table in ('incidents', 'resources', 'hospitals', 'assignments', 'decisions', 'events'):
                entities = world.plan.assignments if table == 'assignments' else getattr(world, table)
                if isinstance(entities, dict):
                    entities = entities.values()
                self.connection.execute(f'DELETE FROM {table}')
                self.connection.executemany(f'INSERT INTO {table} VALUES (?, ?)', [(e.id, e.model_dump_json()) for e in entities])

    def close(self):
        self.connection.close()
