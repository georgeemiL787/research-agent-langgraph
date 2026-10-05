from pydantic import BaseModel, Field
from typing import Literal

class Strategy(BaseModel):
    strategy: Literal["factual_lookup", "comparison", "in_depth"]
    scope: str
    evidence_requirements: str
    stop_conditions: str

class Plan(BaseModel):
    tasks: list[str]
    queries: list[str] = Field(min_length=1, max_length=3)

class Rating(BaseModel):
    source_id: str
    score: float = Field(ge=0, le=1)
    relevant: bool
    reason: str

class Assessment(BaseModel):
    ratings: list[Rating]
    sufficient: bool
    gaps: list[str]

class ReviewDecision(BaseModel):
    decision: Literal["retry", "research_more", "finish"]
    reasons: list[str]
