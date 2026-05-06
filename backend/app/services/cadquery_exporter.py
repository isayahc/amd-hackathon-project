from __future__ import annotations

from pathlib import Path

import cadquery as cq


def export_step(shape: cq.Shape, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    exporters = cq.exporters
    exporters.export(shape, str(destination), exportType="STEP")
    return destination
