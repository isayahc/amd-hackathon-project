from __future__ import annotations

import argparse
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render a STEP file to an orbiting MP4.")
    parser.add_argument("--step", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--width", required=True, type=int)
    parser.add_argument("--height", required=True, type=int)
    parser.add_argument("--fps", required=True, type=int)
    parser.add_argument("--duration", required=True, type=float)
    args = parser.parse_args(argv)
    render_video(
        step_path=args.step,
        output_path=args.output,
        width=args.width,
        height=args.height,
        fps=args.fps,
        duration=args.duration,
    )
    return 0


def render_video(
    *,
    step_path: Path,
    output_path: Path,
    width: int,
    height: int,
    fps: int,
    duration: float,
) -> None:
    os.environ.setdefault("MPLCONFIGDIR", "/tmp/agentcad-matplotlib")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="agentcad-video-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        _render_frames(step_path, temp_dir, width=width, height=height, fps=fps, duration=duration)
        _encode_video(temp_dir, output_path, fps=fps)


def _render_frames(step_path: Path, frame_dir: Path, *, width: int, height: int, fps: int, duration: float) -> None:
    import cadquery as cq
    import matplotlib
    import numpy as np

    matplotlib.use("Agg")
    from matplotlib import pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    model = cq.importers.importStep(str(step_path))
    shape = model.val()
    vertices, triangles = shape.tessellate(0.4)
    points = np.array([[vertex.x, vertex.y, vertex.z] for vertex in vertices], dtype=float)
    faces = np.array(triangles, dtype=int)
    triangle_points = points[faces]

    mins = points.min(axis=0)
    maxs = points.max(axis=0)
    center = (mins + maxs) / 2
    radius = max(float((maxs - mins).max()) / 2, 1.0)

    total_frames = max(2, int(math.ceil(fps * duration)))
    dpi = 100
    figure_size = (width / dpi, height / dpi)
    for index in range(total_frames):
        figure = plt.figure(figsize=figure_size, dpi=dpi)
        figure.patch.set_facecolor("#f6f7f8")
        axis = figure.add_subplot(111, projection="3d")
        axis.set_facecolor("#f6f7f8")
        axis.set_axis_off()
        axis.set_proj_type("persp")
        axis.view_init(elev=24, azim=45 + (360 * index / total_frames))
        axis.set_xlim(center[0] - radius, center[0] + radius)
        axis.set_ylim(center[1] - radius, center[1] + radius)
        axis.set_zlim(center[2] - radius, center[2] + radius)
        try:
            axis.set_box_aspect((1, 1, 0.7))
        except AttributeError:
            pass

        collection = Poly3DCollection(
            triangle_points,
            facecolor=(0.22, 0.47, 0.78, 1.0),
            edgecolor=(0.08, 0.16, 0.24, 0.18),
            linewidths=0.15,
            antialiased=True,
        )
        try:
            collection.set_shade(True)
        except AttributeError:
            pass
        axis.add_collection3d(collection)
        figure.subplots_adjust(left=0, right=1, bottom=0, top=1)
        figure.savefig(frame_dir / f"frame_{index:04d}.png", facecolor=figure.get_facecolor())
        plt.close(figure)


def _encode_video(frame_dir: Path, output_path: Path, *, fps: int) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-framerate",
        str(fps),
        "-i",
        str(frame_dir / "frame_%04d.png"),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "ffmpeg failed")


if __name__ == "__main__":
    sys.exit(main())
