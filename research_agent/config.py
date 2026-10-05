import os
from dataclasses import dataclass
from dotenv import load_dotenv
load_dotenv()
@dataclass
class Settings:
    base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model: str = os.getenv("OLLAMA_MODEL", "qwen3:8b")
    timeout: float = float(os.getenv("OLLAMA_TIMEOUT", "180"))
    num_ctx: int = int(os.getenv("NUM_CTX", "16384"))
    max_rounds: int = int(os.getenv("MAX_SEARCH_ROUNDS", "3"))
    max_revisions: int = int(os.getenv("MAX_REVISIONS", "1"))
    results: int = int(os.getenv("RESULTS_PER_QUERY", "3"))
    max_sources: int = int(os.getenv("MAX_SOURCES", "12"))
    min_credible: int = int(os.getenv("MIN_CREDIBLE_SOURCES", "2"))
    output_dir: str = os.getenv("OUTPUT_DIR", "outputs")
    def __post_init__(self):
        for name in ("num_ctx", "max_rounds", "results", "max_sources", "min_credible"):
            if getattr(self, name) < 1: raise ValueError(f"{name} must be positive")
        if self.max_revisions < 0: raise ValueError("max_revisions cannot be negative")
