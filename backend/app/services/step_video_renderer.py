from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from app.config import BASE_DIR


def render_step_video(
    *,
    step_path: Path,
    output_dir: Path,
    object_id: int,
    width: int = 960,
    height: int = 720,
    fps: int = 24,
    duration: float = 4.0,
    force: bool = False,
) -> Path:
    """Render a rotating MP4 preview for a STEP file using a software renderer."""
    if not step_path.exists() or not step_path.is_file():
        raise FileNotFoundError(f"STEP file not found: {step_path}")
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is required to encode preview videos")

    resolved_width = _clamp_int(width, minimum=240, maximum=1920)
    resolved_height = _clamp_int(height, minimum=180, maximum=1080)
    resolved_fps = _clamp_int(fps, minimum=8, maximum=60)
    resolved_duration = _clamp_float(duration, minimum=1.0, maximum=12.0)

    output_dir.mkdir(parents=True, exist_ok=True)
    duration_tag = str(int(resolved_duration * 1000))
    output_path = output_dir / (
        f"object-{object_id}-software-{resolved_width}x{resolved_height}-"
        f"{resolved_fps}fps-{duration_tag}ms.mp4"
    )
    if output_path.exists() and not force:
        return output_path

    command = [
        sys.executable,
        "-m",
        "app.services.step_video_worker",
        "--step",
        str(step_path),
        "--output",
        str(output_path),
        "--width",
        str(resolved_width),
        "--height",
        str(resolved_height),
        "--fps",
        str(resolved_fps),
        "--duration",
        str(resolved_duration),
    ]
    completed = subprocess.run(
        command,
        cwd=BASE_DIR,
        check=False,
        capture_output=True,
        text=True,
        timeout=max(60, int(resolved_duration * 20)),
    )
    if completed.returncode != 0:
        details = "\n".join(
            part for part in [completed.stdout.strip(), completed.stderr.strip()] if part
        )
        raise RuntimeError(f"Video render failed: {details or 'unknown error'}")
    if not output_path.exists():
        raise RuntimeError("Video render completed without creating an output file")
    return output_path


def _clamp_int(value: int, *, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, int(value)))


def _clamp_float(value: float, *, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, float(value)))
