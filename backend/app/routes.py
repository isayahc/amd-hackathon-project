from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from pydantic import BaseModel

from app.config import get_settings
from app.db import get_session
from app.models import CADComponent, CADObject
from app.schemas import AnimationPlan, ComponentNode, GenerateResponse, HealthResponse, ObjectDetail, ObjectSummary
from app.services.animation_agent import AnimationAgentService
from app.services.cadquery_agent import CadQueryAgentService
from app.services.cadquery_parser import components_to_tree, generate_arbitrary_step


router = APIRouter()
settings = get_settings()
agent_service = CadQueryAgentService()
animation_agent_service = AnimationAgentService()


class AnimationRequest(BaseModel):
    prompt: str | None = None


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post("/generate", response_model=GenerateResponse)
async def generate_object(
    prompt: str = Form(...),
    image: UploadFile | None = File(default=None),
    session: Session = Depends(get_session),
) -> GenerateResponse:
    image_bytes: bytes | None = None
    image_path: str | None = None
    if image:
        image_bytes = await image.read()
        suffix = Path(image.filename or "upload.png").suffix or ".png"
        stored_name = f"{uuid.uuid4().hex}{suffix}"
        upload_path = settings.upload_dir / stored_name
        upload_path.write_bytes(image_bytes)
        image_path = str(upload_path.relative_to(Path(__file__).resolve().parent.parent))

    generated = agent_service.generate(
        prompt=prompt,
        image_bytes=image_bytes,
        image_mime=image.content_type if image else None,
    )

    file_stem = uuid.uuid4().hex
    try:
        _, step_path, preview_path, preview = generate_arbitrary_step(
            generated.cadquery_code,
            settings.export_dir,
            filename=f"{file_stem}.step",
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    cad_object = CADObject(
        prompt=prompt,
        image_path=image_path,
        cadquery_code=generated.cadquery_code,
        step_file_path=str(step_path.relative_to(Path(__file__).resolve().parent.parent)),
        preview_metadata=json.dumps(
            {
                **preview,
                "tree": components_to_tree(generated.components),
                "summary": generated.summary,
                "usedFallback": generated.used_fallback,
                "previewSvgUrl": (
                    None
                    if preview_path is not None
                    else None
                ),
            }
        ),
    )
    session.add(cad_object)
    session.commit()
    session.refresh(cad_object)

    component_records: list[CADComponent] = []
    for component in generated.components:
        component_records.append(
            CADComponent(
                cad_object_id=cad_object.id,
                node_id=component["node_id"],
                name=component["name"],
                kind=component["kind"],
                parent_node_id=component.get("parent_node_id"),
                depth=int(component.get("depth") or 0),
                order_index=int(component.get("order_index") or 0),
                color_hint=component.get("color_hint"),
                metadata_json=json.dumps(component.get("metadata") or {}),
            )
        )
    session.add_all(component_records)
    session.commit()

    preview = json.loads(cad_object.preview_metadata)
    preview["previewSvgUrl"] = (
        f"{settings.api_prefix}/objects/{cad_object.id}/preview-svg"
        if preview_path is not None
        else None
    )
    cad_object.preview_metadata = json.dumps(preview)
    session.add(cad_object)
    session.commit()

    return _build_response(cad_object, component_records)


@router.get("/objects", response_model=list[ObjectSummary])
def list_objects(session: Session = Depends(get_session)) -> list[ObjectSummary]:
    objects = session.exec(select(CADObject).order_by(CADObject.created_at.desc())).all()
    summaries: list[ObjectSummary] = []
    for cad_object in objects:
        component_count = session.exec(
            select(CADComponent).where(CADComponent.cad_object_id == cad_object.id)
        ).all()
        summaries.append(
            ObjectSummary(
                id=cad_object.id,
                prompt=cad_object.prompt,
                created_at=cad_object.created_at,
                step_file_url=f"{settings.api_prefix}/objects/{cad_object.id}/step",
                component_count=len(component_count),
            )
        )
    return summaries


@router.get("/objects/{object_id}", response_model=ObjectDetail)
def get_object(object_id: int, session: Session = Depends(get_session)) -> ObjectDetail:
    cad_object = session.get(CADObject, object_id)
    if not cad_object:
        raise HTTPException(status_code=404, detail="Object not found")
    components = session.exec(
        select(CADComponent)
        .where(CADComponent.cad_object_id == object_id)
        .order_by(CADComponent.order_index.asc())
    ).all()
    return _build_response(cad_object, components)


@router.post("/objects/{object_id}/animation", response_model=AnimationPlan)
def generate_animation(
    object_id: int,
    request: AnimationRequest,
    session: Session = Depends(get_session),
) -> AnimationPlan:
    cad_object = session.get(CADObject, object_id)
    if not cad_object:
        raise HTTPException(status_code=404, detail="Object not found")

    components = session.exec(
        select(CADComponent)
        .where(CADComponent.cad_object_id == object_id)
        .order_by(CADComponent.order_index.asc())
    ).all()
    preview = json.loads(cad_object.preview_metadata)
    component_payload = [
        {
            "node_id": component.node_id,
            "name": component.name,
            "kind": component.kind,
            "parent_node_id": component.parent_node_id,
            "depth": component.depth,
            "order_index": component.order_index,
            "color_hint": component.color_hint,
            "metadata": json.loads(component.metadata_json or "{}"),
        }
        for component in components
    ]

    animation = animation_agent_service.generate(
        object_prompt=cad_object.prompt,
        components=component_payload,
        preview=preview,
        prompt=request.prompt,
    )
    return AnimationPlan(
        title=animation.title,
        summary=animation.summary,
        duration=animation.duration,
        loop=animation.loop,
        tracks=animation.tracks,
        used_fallback=animation.used_fallback,
    )


@router.get("/objects/{object_id}/step")
def download_step(object_id: int, session: Session = Depends(get_session)) -> FileResponse:
    cad_object = session.get(CADObject, object_id)
    if not cad_object:
        raise HTTPException(status_code=404, detail="Object not found")
    step_path = Path(__file__).resolve().parent.parent / cad_object.step_file_path
    if not step_path.exists():
        raise HTTPException(status_code=404, detail="STEP file not found")
    return FileResponse(path=step_path, media_type="application/step", filename=step_path.name)


@router.get("/objects/{object_id}/preview-svg")
def download_preview_svg(object_id: int, session: Session = Depends(get_session)) -> FileResponse:
    cad_object = session.get(CADObject, object_id)
    if not cad_object:
        raise HTTPException(status_code=404, detail="Object not found")

    step_path = Path(__file__).resolve().parent.parent / cad_object.step_file_path
    preview_path = step_path.with_suffix(".svg")
    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="Preview SVG not found")
    return FileResponse(path=preview_path, media_type="image/svg+xml", filename=preview_path.name)


def _build_response(cad_object: CADObject, components: list[CADComponent]) -> GenerateResponse:
    preview = json.loads(cad_object.preview_metadata)
    payload_components = [
        ComponentNode(
            node_id=component.node_id,
            name=component.name,
            kind=component.kind,
            parent_node_id=component.parent_node_id,
            depth=component.depth,
            order_index=component.order_index,
            color_hint=component.color_hint,
            metadata=json.loads(component.metadata_json),
        )
        for component in components
    ]
    return GenerateResponse(
        id=cad_object.id,
        prompt=cad_object.prompt,
        cadquery_code=cad_object.cadquery_code,
        step_file_url=f"{settings.api_prefix}/objects/{cad_object.id}/step",
        preview=preview,
        components=payload_components,
        created_at=cad_object.created_at,
    )
