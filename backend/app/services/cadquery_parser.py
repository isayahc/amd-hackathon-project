from __future__ import annotations

import traceback
import json
from collections import defaultdict
from typing import Any
from pathlib import Path

import cadquery as cq


def execute_cadquery(code: str) -> tuple[cq.Shape, dict[str, Any]]:
    scope: dict[str, Any] = {"cq": cq, "cadquery": cq, "__builtins__": __builtins__}
    exec(code, scope, scope)

    result_key = None
    if "result_model" in scope:
        result_key = "result_model"
    elif "result" in scope:
        result_key = "result"

    if result_key is None:
        raise ValueError("CadQuery code must define a `result_model` variable")

    result = scope[result_key]
    if isinstance(result, cq.Workplane):
        shape = result.val()
    elif hasattr(result, "wrapped"):
        shape = result
    else:
        raise TypeError(f"`{result_key}` must be a CadQuery Workplane or Shape")

    bounding_box = shape.BoundingBox()
    preview = {
        "bbox": {
            "x": round(float(bounding_box.xlen), 3),
            "y": round(float(bounding_box.ylen), 3),
            "z": round(float(bounding_box.zlen), 3),
        },
        "volume": round(float(shape.Volume()), 3) if hasattr(shape, "Volume") else None,
        "area": round(float(shape.Area()), 3) if hasattr(shape, "Area") else None,
        "solidCount": len(shape.Solids()) if hasattr(shape, "Solids") else 1,
    }
    return shape, preview


def generate_arbitrary_step(
    cadquery_code: str,
    data_dir: Path,
    filename: str = "agent_part.step",
) -> tuple[cq.Shape, Path, Path | None, dict[str, Any]]:
    """Execute CadQuery code, export STEP, and try to export a lightweight SVG preview."""
    data_dir.mkdir(parents=True, exist_ok=True)

    try:
        shape, preview = execute_cadquery(cadquery_code)

        safe_name = Path(filename).name
        if not safe_name.lower().endswith((".step", ".stp")):
            safe_name += ".step"

        output_path = (data_dir / safe_name).resolve()
        if not str(output_path).startswith(str(data_dir.resolve())):
            raise ValueError("Invalid output filename")

        cq.exporters.export(shape, str(output_path))

        preview_path: Path | None = None
        preview_safe_name = f"{Path(safe_name).stem}.svg"
        candidate_preview_path = (data_dir / preview_safe_name).resolve()
        if str(candidate_preview_path).startswith(str(data_dir.resolve())):
            try:
                cq.exporters.export(shape, str(candidate_preview_path))
                preview_path = candidate_preview_path
            except Exception as preview_exc:
                preview["previewExportError"] = (
                    f"{type(preview_exc).__name__}: {preview_exc}"
                )

        preview["executionStatus"] = "success"
        preview["stepFilename"] = output_path.name
        preview["previewFilename"] = preview_path.name if preview_path else None
        return shape, output_path, preview_path, preview
    except Exception as exc:
        raise RuntimeError(
            "Code execution failed with error: "
            f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
        ) from exc


def components_to_tree(components: list[dict[str, Any]]) -> dict[str, Any]:
    by_parent: dict[str | None, list[dict[str, Any]]] = defaultdict(list)
    by_id = {component["node_id"]: component for component in components}
    for component in components:
        by_parent[component.get("parent_node_id")].append(component)

    def build(node_id: str) -> dict[str, Any]:
        node = dict(by_id[node_id])
        node["children"] = [build(child["node_id"]) for child in by_parent.get(node_id, [])]
        return node

    root_id = "root" if "root" in by_id else components[0]["node_id"]
    return build(root_id)


def serialize_components(components: list[dict[str, Any]]) -> str:
    return json.dumps(components)
