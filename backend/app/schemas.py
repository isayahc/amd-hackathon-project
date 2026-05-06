from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ComponentNode(BaseModel):
    node_id: str
    name: str
    kind: str
    parent_node_id: Optional[str] = None
    depth: int = 0
    order_index: int = 0
    color_hint: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GenerateResponse(BaseModel):
    id: int
    prompt: str
    cadquery_code: str
    step_file_url: str
    preview: dict[str, Any]
    components: list[ComponentNode]
    created_at: datetime


class ObjectSummary(BaseModel):
    id: int
    prompt: str
    created_at: datetime
    step_file_url: str
    component_count: int


class ObjectDetail(GenerateResponse):
    pass


class AnimationKeyframe(BaseModel):
    t: float
    position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    rotation: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    scale: list[float] = Field(default_factory=lambda: [1.0, 1.0, 1.0])


class AnimationTrack(BaseModel):
    node_id: str
    label: str
    keyframes: list[AnimationKeyframe]


class AnimationPlan(BaseModel):
    title: str
    summary: str
    duration: float
    loop: bool = True
    tracks: list[AnimationTrack]
    used_fallback: bool = False


class HealthResponse(BaseModel):
    status: str
