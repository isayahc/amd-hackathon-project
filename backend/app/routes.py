from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from pydantic import BaseModel

from app.config import get_settings
from app.db import get_session
from app.models import CADAnimationPlan, CADChatMessage, CADComponent, CADObject, utc_now
from app.schemas import (
    AnimationPlan,
    ChatMessage,
    ComponentNode,
    GenerateResponse,
    HealthResponse,
    JobMetadata,
    ObjectDetail,
    ObjectSummary,
)
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
    image_bytes, image_path = await _store_uploaded_image(image)

    generated = agent_service.generate(
        prompt=prompt,
        image_bytes=image_bytes,
        image_mime=image.content_type if image else None,
    )

    return _persist_generated_object(
        session=session,
        prompt=prompt,
        generated=generated,
        image_path=image_path,
        chat_messages=[
            {"role": "user", "content": prompt, "image_path": image_path},
            {
                "role": "assistant",
                "content": "Created the session design. Keep chatting to modify this same design.",
            },
        ],
    )


@router.post("/objects/{object_id}/modify", response_model=GenerateResponse)
async def modify_object(
    object_id: int,
    prompt: str = Form(...),
    image: UploadFile | None = File(default=None),
    session: Session = Depends(get_session),
) -> GenerateResponse:
    cad_object = session.get(CADObject, object_id)
    if not cad_object:
        raise HTTPException(status_code=404, detail="Object not found")

    image_bytes, uploaded_image_path = await _store_uploaded_image(image)
    next_image_path = uploaded_image_path or cad_object.image_path

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
    modification_prompt = (
        "Modify the existing CadQuery design below. Return one complete replacement design, "
        "not a patch. Preserve useful existing structure unless the user asks to change it.\n\n"
        f"Original request:\n{cad_object.prompt}\n\n"
        f"Current CadQuery code:\n{cad_object.cadquery_code}\n\n"
        f"Current preview metadata:\n{json.dumps(preview, indent=2)}\n\n"
        f"Current components:\n{json.dumps(component_payload, indent=2)}\n\n"
        f"User modification request:\n{prompt.strip()}"
    )
    generated = agent_service.generate(
        prompt=modification_prompt,
        image_bytes=image_bytes,
        image_mime=image.content_type if image else None,
    )
    next_version = _next_session_version(session, cad_object.session_uuid)
    prior_chat_messages = _chat_messages_payload(
        session.exec(
            select(CADChatMessage)
            .where(CADChatMessage.cad_object_id == object_id)
            .order_by(CADChatMessage.order_index.asc(), CADChatMessage.id.asc())
        ).all()
    )
    return _persist_generated_object(
        session=session,
        prompt=f"{cad_object.prompt}\n\nModification: {prompt.strip()}",
        generated=generated,
        image_path=next_image_path,
        session_uuid=cad_object.session_uuid,
        version=next_version,
        chat_messages=[
            *prior_chat_messages,
            {"role": "user", "content": prompt, "image_path": uploaded_image_path},
            {
                "role": "assistant",
                "content": "Updated the session design. The STEP preview now shows the modified version.",
            },
        ],
    )


def _persist_generated_object(
    session: Session,
    prompt: str,
    generated,
    image_path: str | None = None,
    session_uuid: str | None = None,
    version: int = 1,
    chat_messages: list[dict[str, str | None]] | None = None,
) -> GenerateResponse:
    file_stem = uuid.uuid4().hex
    resolved_session_uuid = session_uuid or str(uuid.uuid4())
    object_uuid = str(uuid.uuid4())
    try:
        _, step_path, preview_path, preview = generate_arbitrary_step(
            generated.cadquery_code,
            settings.export_dir,
            filename=f"{file_stem}.step",
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    created_at = utc_now()
    step_file_location = str(step_path.relative_to(Path(__file__).resolve().parent.parent))
    cad_object = CADObject(
        session_uuid=resolved_session_uuid,
        object_uuid=object_uuid,
        version=version,
        prompt=prompt,
        image_path=image_path,
        cadquery_code=generated.cadquery_code,
        step_file_path=step_file_location,
        created_at=created_at,
        preview_metadata=json.dumps(
            {
                **preview,
                "tree": components_to_tree(generated.components),
                "summary": generated.summary,
                "usedFallback": generated.used_fallback,
                "job_metadata": {
                    "prompt": prompt,
                    "datetime": created_at.isoformat(),
                    "session_uuid": resolved_session_uuid,
                    "object_uuid": object_uuid,
                    "version": version,
                    "model_used": generated.model_used,
                    "step_file_location": step_file_location,
                    "animation_metadata": None,
                    "code": generated.cadquery_code,
                },
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

    if chat_messages:
        session.add_all(
            [
                CADChatMessage(
                    cad_object_id=cad_object.id,
                    order_index=index,
                    role=str(message["role"]),
                    content=str(message["content"]),
                    image_path=(
                        str(message["image_path"])
                        if message.get("image_path") is not None
                        else None
                    ),
                )
                for index, message in enumerate(chat_messages)
            ]
        )
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

    return _build_response(session, cad_object, component_records)


@router.get("/objects", response_model=list[ObjectSummary])
def list_objects(session: Session = Depends(get_session)) -> list[ObjectSummary]:
    objects = session.exec(select(CADObject).order_by(CADObject.created_at.desc())).all()
    summaries: list[ObjectSummary] = []
    for cad_object in objects:
        component_count = session.exec(
            select(CADComponent).where(CADComponent.cad_object_id == cad_object.id)
        ).all()
        preview = json.loads(cad_object.preview_metadata)
        stored_plan = session.exec(
            select(CADAnimationPlan).where(CADAnimationPlan.cad_object_id == cad_object.id)
        ).first()
        metadata = _job_metadata_payload(
            cad_object=cad_object,
            stored_plan=stored_plan,
            preview=preview,
        )
        summaries.append(
            ObjectSummary(
                id=cad_object.id,
                session_uuid=cad_object.session_uuid,
                object_uuid=cad_object.object_uuid,
                version=cad_object.version,
                prompt=cad_object.prompt,
                created_at=cad_object.created_at,
                step_file_url=f"{settings.api_prefix}/objects/{cad_object.id}/step",
                step_file_location=metadata["step_file_location"],
                model_used=metadata["model_used"],
                has_animation=stored_plan is not None,
                used_fallback=bool(preview.get("usedFallback")),
                summary=preview.get("summary"),
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
    return _build_response(session, cad_object, components)


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
    animation_plan = AnimationPlan(
        title=animation.title,
        summary=animation.summary,
        duration=animation.duration,
        loop=animation.loop,
        tracks=animation.tracks,
        used_fallback=animation.used_fallback,
    )
    stored_plan = session.exec(
        select(CADAnimationPlan).where(CADAnimationPlan.cad_object_id == object_id)
    ).first()
    if stored_plan is None:
        stored_plan = CADAnimationPlan(
            cad_object_id=object_id,
            prompt=request.prompt,
            plan_json=animation_plan.model_dump_json(),
            updated_at=utc_now(),
        )
        session.add(stored_plan)
    else:
        stored_plan.prompt = request.prompt
        stored_plan.plan_json = animation_plan.model_dump_json()
        stored_plan.updated_at = utc_now()
        session.add(stored_plan)
    preview["job_metadata"] = _job_metadata_payload(
        cad_object=cad_object,
        stored_plan=stored_plan,
        preview=preview,
        animation_model_used=animation.model_used,
    )
    cad_object.preview_metadata = json.dumps(preview)
    session.add(cad_object)
    session.commit()

    return animation_plan


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


@router.get("/uploads/{upload_name}")
def download_uploaded_image(upload_name: str) -> FileResponse:
    upload_path = (settings.upload_dir / upload_name).resolve()
    upload_root = settings.upload_dir.resolve()
    if upload_root not in upload_path.parents:
        raise HTTPException(status_code=404, detail="Image not found")
    if not upload_path.exists() or not upload_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path=upload_path, media_type=None, filename=upload_path.name)


def _build_response(session: Session, cad_object: CADObject, components: list[CADComponent]) -> GenerateResponse:
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
    chat_messages = session.exec(
        select(CADChatMessage)
        .where(CADChatMessage.cad_object_id == cad_object.id)
        .order_by(CADChatMessage.order_index.asc(), CADChatMessage.id.asc())
    ).all()
    stored_plan = session.exec(
        select(CADAnimationPlan).where(CADAnimationPlan.cad_object_id == cad_object.id)
    ).first()
    return GenerateResponse(
        id=cad_object.id,
        session_uuid=cad_object.session_uuid,
        object_uuid=cad_object.object_uuid,
        version=cad_object.version,
        prompt=cad_object.prompt,
        metadata=JobMetadata(
            **_job_metadata_payload(
                cad_object=cad_object,
                stored_plan=stored_plan,
                preview=preview,
            )
        ),
        cadquery_code=cad_object.cadquery_code,
        step_file_url=f"{settings.api_prefix}/objects/{cad_object.id}/step",
        preview=preview,
        components=payload_components,
        chat_messages=(
            _serialize_chat_messages(_chat_messages_payload(chat_messages))
            if chat_messages
            else _legacy_chat_messages(cad_object)
        ),
        animation_plan=(AnimationPlan.model_validate_json(stored_plan.plan_json) if stored_plan else None),
        created_at=cad_object.created_at,
    )


async def _store_uploaded_image(image: UploadFile | None) -> tuple[bytes | None, str | None]:
    if image is None:
        return None, None
    image_bytes = await image.read()
    if not image_bytes:
        return None, None
    suffix = Path(image.filename or "upload.png").suffix or ".png"
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    upload_path = settings.upload_dir / stored_name
    upload_path.write_bytes(image_bytes)
    return image_bytes, str(upload_path.relative_to(Path(__file__).resolve().parent.parent))


def _chat_messages_payload(messages: list[CADChatMessage]) -> list[dict[str, str | None]]:
    return [
        {
            "role": message.role,
            "content": message.content,
            "image_path": message.image_path,
        }
        for message in messages
    ]


def _legacy_chat_messages(cad_object: CADObject) -> list[ChatMessage]:
    return [
        ChatMessage(
            role="assistant",
            content="This saved design predates persisted chat history. Showing the stored prompt below.",
        ),
        ChatMessage(
            role="user",
            content=cad_object.prompt,
            image_url=_image_url(cad_object.image_path),
        ),
    ]


def _serialize_chat_messages(messages: list[dict[str, str | None]]) -> list[ChatMessage]:
    return [
        ChatMessage(
            role=str(message["role"]),
            content=str(message["content"]),
            image_url=_image_url(message.get("image_path")),
        )
        for message in messages
    ]


def _image_url(image_path: str | None) -> str | None:
    if not image_path:
        return None
    image_name = Path(image_path).name
    return f"{settings.api_prefix}/uploads/{image_name}"


def _job_metadata_payload(
    cad_object: CADObject,
    stored_plan: CADAnimationPlan | None,
    preview: dict[str, Any],
    animation_model_used: str | None = None,
) -> dict[str, Any]:
    stored_metadata = preview.get("job_metadata") if isinstance(preview.get("job_metadata"), dict) else {}
    stored_animation_metadata = (
        stored_metadata.get("animation_metadata")
        if isinstance(stored_metadata.get("animation_metadata"), dict)
        else {}
    )
    animation_model = animation_model_used or stored_animation_metadata.get("model_used")
    return {
        "prompt": cad_object.prompt,
        "datetime": cad_object.created_at.isoformat(),
        "session_uuid": cad_object.session_uuid,
        "object_uuid": cad_object.object_uuid,
        "version": cad_object.version,
        "model_used": str(stored_metadata.get("model_used") or settings.openai_model),
        "step_file_location": cad_object.step_file_path,
        "animation_metadata": _animation_metadata_payload(stored_plan, animation_model),
        "code": cad_object.cadquery_code,
    }


def _next_session_version(session: Session, session_uuid: str) -> int:
    session_objects = session.exec(
        select(CADObject.version)
        .where(CADObject.session_uuid == session_uuid)
        .order_by(CADObject.version.desc())
    ).all()
    if not session_objects:
        return 1
    return int(session_objects[0]) + 1


def _animation_metadata_payload(
    stored_plan: CADAnimationPlan | None,
    model_used: str | None = None,
) -> dict[str, Any] | None:
    if stored_plan is None:
        return None
    existing_metadata = None
    try:
        existing_metadata = json.loads(stored_plan.plan_json)
    except json.JSONDecodeError:
        existing_metadata = {"raw_plan": stored_plan.plan_json}
    return {
        "prompt": stored_plan.prompt,
        "datetime": stored_plan.updated_at.isoformat(),
        "model_used": model_used,
        "plan": existing_metadata,
    }
