from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.config import BASE_DIR, Settings, get_settings


@dataclass(slots=True)
class StoredVideo:
    backend: str
    location: str
    url: str
    local_path: Path | None = None


def store_video(video_path: Path, *, object_id: int, settings: Settings | None = None) -> StoredVideo:
    resolved_settings = settings or get_settings()
    backend = resolved_settings.video_storage_backend
    if backend == "local":
        return _store_local(video_path, settings=resolved_settings)
    if backend == "minio":
        return _store_minio(video_path, object_id=object_id, settings=resolved_settings)
    raise RuntimeError("VIDEO_STORAGE_BACKEND must be one of: local, minio")


def _store_local(video_path: Path, *, settings: Settings) -> StoredVideo:
    location = str(video_path.relative_to(BASE_DIR))
    video_name = video_path.name
    base_url = settings.video_public_base_url
    url = (
        f"{base_url.rstrip('/')}/{video_name}"
        if base_url
        else f"{settings.api_prefix}/videos/{video_name}"
    )
    return StoredVideo(
        backend="local",
        location=location,
        url=url,
        local_path=video_path,
    )


def _store_minio(video_path: Path, *, object_id: int, settings: Settings) -> StoredVideo:
    try:
        from minio import Minio
        from minio.error import S3Error
    except ImportError as exc:
        raise RuntimeError("Install minio to use VIDEO_STORAGE_BACKEND=minio") from exc

    if not settings.minio_endpoint:
        raise RuntimeError("MINIO_ENDPOINT is required when VIDEO_STORAGE_BACKEND=minio")
    if not settings.minio_access_key or not settings.minio_secret_key:
        raise RuntimeError("MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required for MinIO storage")

    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    try:
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
        object_name = f"objects/{object_id}/videos/{video_path.name}"
        client.fput_object(
            settings.minio_bucket,
            object_name,
            str(video_path),
            content_type="video/mp4",
        )
    except S3Error as exc:
        raise RuntimeError(f"MinIO upload failed: {exc}") from exc

    location = f"minio://{settings.minio_bucket}/{object_name}"
    if settings.video_public_base_url:
        url = f"{settings.video_public_base_url.rstrip('/')}/{object_name}"
    else:
        url = client.presigned_get_object(settings.minio_bucket, object_name)
    return StoredVideo(
        backend="minio",
        location=location,
        url=url,
        local_path=None,
    )
