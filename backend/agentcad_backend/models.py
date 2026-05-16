from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CADObject(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_uuid: str = Field(default_factory=lambda: str(uuid4()), index=True)
    object_uuid: str = Field(default_factory=lambda: str(uuid4()), index=True, unique=True)
    version: int = Field(default=1, nullable=False, index=True)
    prompt: str = Field(sa_column=Column(Text, nullable=False))
    image_path: Optional[str] = None
    cadquery_code: str = Field(sa_column=Column(Text, nullable=False))
    step_file_path: str
    preview_metadata: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, nullable=False)


class CADComponent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    cad_object_id: int = Field(foreign_key="cadobject.id", nullable=False, index=True)
    node_id: str = Field(index=True)
    name: str
    kind: str
    parent_node_id: Optional[str] = Field(default=None, index=True)
    depth: int = 0
    order_index: int = 0
    color_hint: Optional[str] = None
    metadata_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))


class CADAnimationPlan(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    cad_object_id: int = Field(foreign_key="cadobject.id", nullable=False, index=True, unique=True)
    prompt: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    plan_json: str = Field(sa_column=Column(Text, nullable=False))
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)


class CADChatMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    cad_object_id: int = Field(foreign_key="cadobject.id", nullable=False, index=True)
    order_index: int = Field(default=0, nullable=False, index=True)
    role: str = Field(sa_column=Column(Text, nullable=False))
    content: str = Field(sa_column=Column(Text, nullable=False))
    image_path: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now, nullable=False)

