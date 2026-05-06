from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CADObject(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
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

