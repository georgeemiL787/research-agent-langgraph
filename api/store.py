"""Async SQLite persistence for jobs and stage events."""
import json
import uuid
import aiosqlite
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path("research.db")


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id           TEXT PRIMARY KEY,
                status       TEXT NOT NULL DEFAULT 'queued',
                question     TEXT NOT NULL,
                demo         INTEGER NOT NULL DEFAULT 0,
                model        TEXT,
                max_rounds   INTEGER,
                max_revisions INTEGER,
                created_at   TEXT NOT NULL,
                completed_at TEXT,
                elapsed      REAL,
                result_json  TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id       TEXT NOT NULL,
                sequence     INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                FOREIGN KEY (job_id) REFERENCES jobs(id)
            )
        """)
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_job ON events(job_id, sequence)"
        )
        await db.commit()


async def create_job(question: str, demo: bool, settings_dict: dict) -> str:
    job_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO jobs
               (id, status, question, demo, model, max_rounds, max_revisions, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                job_id, "queued", question, int(demo),
                settings_dict.get("model"),
                settings_dict.get("max_rounds"),
                settings_dict.get("max_revisions"),
                now,
            ),
        )
        await db.commit()
    return job_id


async def update_status(job_id: str, status: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE jobs SET status=? WHERE id=?", (status, job_id)
        )
        await db.commit()


async def complete_job(job_id: str, result: dict, elapsed: float) -> None:
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE jobs
               SET status='complete', completed_at=?, elapsed=?, result_json=?
               WHERE id=?""",
            (now, elapsed, json.dumps(result, ensure_ascii=False), job_id),
        )
        await db.commit()


async def fail_job(job_id: str, error: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE jobs
               SET status='failed', completed_at=?, result_json=?
               WHERE id=?""",
            (now, json.dumps({"error": error}), job_id),
        )
        await db.commit()


async def append_event(job_id: str, seq: int, payload: dict) -> None:
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO events (job_id, sequence, payload_json, created_at) VALUES (?,?,?,?)",
            (job_id, seq, json.dumps(payload, ensure_ascii=False), now),
        )
        await db.commit()


async def get_job(job_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM jobs WHERE id=?", (job_id,))
        row = await cur.fetchone()
    if row is None:
        return None
    job = dict(row)
    job["result"] = (
        json.loads(job.pop("result_json")) if job.get("result_json") else None
    )
    job["demo"] = bool(job["demo"])
    return job


async def list_jobs(limit: int = 100) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """SELECT id, status, question, demo, model, max_rounds,
                      created_at, completed_at, elapsed
               FROM jobs ORDER BY created_at DESC LIMIT ?""",
            (limit,),
        )
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_events(job_id: str, after_seq: int = 0) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """SELECT sequence, payload_json FROM events
               WHERE job_id=? AND sequence>? ORDER BY sequence""",
            (job_id, after_seq),
        )
        rows = await cur.fetchall()
    return [
        {"sequence": r["sequence"], "payload": json.loads(r["payload_json"])}
        for r in rows
    ]
