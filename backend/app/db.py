from __future__ import annotations

from contextlib import contextmanager
import uuid

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.sqlite_url.startswith("sqlite") else {}
engine = create_engine(settings.sqlite_url, echo=False, connect_args=connect_args)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate_cadobject_tracking_fields()


def get_session():
    with Session(engine) as session:
        yield session


@contextmanager
def session_scope() -> Session:
    with Session(engine) as session:
        yield session


def _migrate_cadobject_tracking_fields() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("cadobject"):
        return

    existing_columns = {column["name"] for column in inspector.get_columns("cadobject")}
    statements: list[str] = []
    if "session_uuid" not in existing_columns:
        statements.append("ALTER TABLE cadobject ADD COLUMN session_uuid TEXT")
    if "object_uuid" not in existing_columns:
        statements.append("ALTER TABLE cadobject ADD COLUMN object_uuid TEXT")
    if "version" not in existing_columns:
        statements.append("ALTER TABLE cadobject ADD COLUMN version INTEGER")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

        rows = connection.execute(
            text("SELECT id, session_uuid, object_uuid, version FROM cadobject")
        ).mappings().all()
        for row in rows:
            connection.execute(
                text(
                    """
                    UPDATE cadobject
                    SET session_uuid = :session_uuid,
                        object_uuid = :object_uuid,
                        version = :version
                    WHERE id = :id
                    """
                ),
                {
                    "id": row["id"],
                    "session_uuid": row["session_uuid"] or str(uuid.uuid4()),
                    "object_uuid": row["object_uuid"] or str(uuid.uuid4()),
                    "version": row["version"] or 1,
                },
            )

        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_cadobject_session_uuid ON cadobject (session_uuid)")
        )
        connection.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ux_cadobject_object_uuid ON cadobject (object_uuid)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_cadobject_session_version ON cadobject (session_uuid, version)")
        )
