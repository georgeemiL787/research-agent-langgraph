"""FastAPI application entry point."""
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import store, workers
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.init_db()
    task = asyncio.create_task(workers.worker_loop(), name="research-worker")
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Research Agent API",
    version="2.0.0",
    description="Local-first AI research agent powered by LangGraph + Ollama",
    lifespan=lifespan,
)

# LAN-only: open CORS is fine here
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")

# Serve the built Vite frontend (production mode)
_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
