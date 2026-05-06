from __future__ import annotations

from contextlib import contextmanager

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.sqlite_url.startswith("sqlite") else {}
engine = create_engine(settings.sqlite_url, echo=False, connect_args=connect_args)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


@contextmanager
def session_scope() -> Session:
    with Session(engine) as session:
        yield session
