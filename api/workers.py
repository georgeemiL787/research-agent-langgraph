"""
Background job worker.

Single-consumer asyncio.Queue ensures jobs run strictly one at a time.
Agent runs in a ThreadPoolExecutor so the event loop stays free.
Stage events are forwarded to SSE subscriber queues in real-time.
"""
import asyncio
import itertools
import time
from concurrent.futures import ThreadPoolExecutor

from research_agent.config import Settings
from research_agent.runner import run as agent_run
from . import store

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="research")
_queue: asyncio.Queue | None = None

# job_id → list of per-subscriber asyncio.Queues
_subscribers: dict[str, list[asyncio.Queue]] = {}


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_queue() -> asyncio.Queue | None:
    return _queue


def subscribe(job_id: str) -> asyncio.Queue:
    """Return a new queue that will receive live events for *job_id*."""
    q: asyncio.Queue = asyncio.Queue(maxsize=2000)
    _subscribers.setdefault(job_id, []).append(q)
    return q


def unsubscribe(job_id: str, q: asyncio.Queue) -> None:
    try:
        _subscribers.get(job_id, []).remove(q)
    except ValueError:
        pass


async def enqueue(job_id: str, question: str, demo: bool, settings: Settings) -> None:
    assert _queue is not None, "Worker loop not started"
    await _queue.put((job_id, question, demo, settings))


# ---------------------------------------------------------------------------
# Internal helpers (event loop thread only)
# ---------------------------------------------------------------------------

def _push(job_id: str, payload: dict) -> None:
    """Push payload to all active SSE subscribers (called from event loop)."""
    for q in list(_subscribers.get(job_id, [])):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            pass


async def _save_and_push(job_id: str, seq: int, payload: dict) -> None:
    await store.append_event(job_id, seq, payload)
    _push(job_id, payload)


# ---------------------------------------------------------------------------
# Job execution
# ---------------------------------------------------------------------------

async def _run_job(job_id: str, question: str, demo: bool, settings: Settings) -> None:
    loop = asyncio.get_running_loop()
    await store.update_status(job_id, "running")
    _push(job_id, {"type": "status", "status": "running"})

    counter = itertools.count(1)
    started = time.perf_counter()

    def on_stage_event(event: dict, _state: dict) -> None:
        seq = next(counter)
        payload = {"type": "stage_event", **event}
        # Schedule DB write + push on the event loop (thread-safe).
        asyncio.run_coroutine_threadsafe(_save_and_push(job_id, seq, payload), loop)

    def on_thinking(text: str) -> None:
        seq = next(counter)
        payload = {"type": "thinking", "text": text}
        asyncio.run_coroutine_threadsafe(_save_and_push(job_id, seq, payload), loop)

    try:
        result, _folder = await loop.run_in_executor(
            _executor,
            lambda: agent_run(
                question,
                demo,
                settings=settings,
                on_stage_event=on_stage_event,
                on_thinking=on_thinking,
            ),
        )
        # Yield once so any in-flight _save_and_push coroutines can process.
        await asyncio.sleep(0)
        elapsed = time.perf_counter() - started
        await store.complete_job(job_id, result, elapsed)
        _push(job_id, {"type": "complete", "elapsed": elapsed})
    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        await store.fail_job(job_id, msg)
        _push(job_id, {"type": "error", "message": msg})
    finally:
        # Signal SSE generators that the stream is finished.
        for q in list(_subscribers.get(job_id, [])):
            try:
                q.put_nowait({"type": "__done__"})
            except asyncio.QueueFull:
                pass


# ---------------------------------------------------------------------------
# Worker loop (started once at app startup)
# ---------------------------------------------------------------------------

async def worker_loop() -> None:
    global _queue
    _queue = asyncio.Queue()
    while True:
        job_id, question, demo, settings = await _queue.get()
        try:
            await _run_job(job_id, question, demo, settings)
        finally:
            _queue.task_done()
