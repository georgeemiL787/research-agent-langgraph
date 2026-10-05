"""FastAPI route handlers."""
import json
import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from research_agent.config import Settings
from . import store, workers

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ResearchRequest(BaseModel):
    question: str
    demo: bool = False
    model: Optional[str] = None
    max_rounds: Optional[int] = None
    max_revisions: Optional[int] = None

    @field_validator("question")
    @classmethod
    def check_question(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 2000:
            raise ValueError("Question must be 1–2000 characters")
        return v


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/research", status_code=202)
async def submit_research(req: ResearchRequest):
    """Submit a new research job. Returns immediately with a job_id."""
    settings = Settings()
    if req.model:
        settings.model = req.model.strip()
    if req.max_rounds is not None:
        settings.max_rounds = max(1, min(5, req.max_rounds))
    if req.max_revisions is not None:
        settings.max_revisions = max(0, min(3, req.max_revisions))

    settings_dict = {
        "model": settings.model,
        "max_rounds": settings.max_rounds,
        "max_revisions": settings.max_revisions,
    }
    job_id = await store.create_job(req.question, req.demo, settings_dict)
    await workers.enqueue(job_id, req.question, req.demo, settings)

    q = workers.get_queue()
    pending = q.qsize() if q else 0
    return {"job_id": job_id, "queue_position": pending}


@router.get("/jobs")
async def list_jobs():
    """List all jobs, newest first."""
    return await store.list_jobs()


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Full job detail including result when complete."""
    job = await store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/jobs/{job_id}/stream")
async def stream_job(job_id: str):
    """
    Server-Sent Events stream for a job.

    - If the job is already finished, replays stored events then closes.
    - If the job is running or queued, replays history then streams live events.
    """
    job = await store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }

    # --- Already finished: fast replay ---
    if job["status"] in ("complete", "failed"):
        async def replay():
            events = await store.get_events(job_id)
            for e in events:
                yield f"data: {json.dumps(e['payload'])}\n\n"
            yield f"data: {json.dumps({'type': '__done__'})}\n\n"

        return StreamingResponse(replay(), media_type="text/event-stream", headers=headers)

    # --- Live stream ---
    q = workers.subscribe(job_id)

    async def generate():
        try:
            # Replay already-persisted events (catch up any missed before subscribing)
            past = await store.get_events(job_id)
            for e in past:
                yield f"data: {json.dumps(e['payload'])}\n\n"

            # Stream live events
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=25.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue

                if event.get("type") == "__done__":
                    break

                yield f"data: {json.dumps(event)}\n\n"

                if event.get("type") in ("complete", "error"):
                    break
        finally:
            workers.unsubscribe(job_id, q)

    return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)


@router.get("/health")
async def health():
    """Check Ollama connectivity and installed models."""
    try:
        from research_agent.runner import components
        cfg, llm, _ = components(demo=False)
        names = llm.health()
        return {"status": "ok", "model": cfg.model, "installed": names}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


@router.get("/settings")
async def get_settings():
    """Return effective settings from .env / defaults."""
    cfg = Settings()
    return {
        "model": cfg.model,
        "base_url": cfg.base_url,
        "max_rounds": cfg.max_rounds,
        "max_revisions": cfg.max_revisions,
        "results_per_query": cfg.results,
        "max_sources": cfg.max_sources,
        "min_credible": cfg.min_credible,
        "output_dir": cfg.output_dir,
        "timeout": cfg.timeout,
    }


@router.get("/queue")
async def queue_info():
    """Return number of jobs waiting to start."""
    q = workers.get_queue()
    return {"pending": q.qsize() if q else 0}
