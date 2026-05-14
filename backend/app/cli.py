from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import traceback
import uuid
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from app.config import BASE_DIR, get_settings
from app.db import engine, init_db, session_scope
from app.llm_config import GEMINI_MODELS, OPENAI_MODELS, list_llm_options
from app.models import CADChatMessage, CADComponent, CADObject, CLIJob, utc_now


UNTRACKED_COMMANDS = {"job", "jobs"}


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return _run_with_job_tracking(args)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agentcad",
        description="Generate and track AgentCAD STEP files from the command line.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    models_parser = subparsers.add_parser("models", help="Show configured LLM providers and models.")
    models_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    models_parser.set_defaults(func=_models_command)

    history_parser = subparsers.add_parser("history", help="Show generated STEP file versions.")
    history_parser.add_argument("--session", help="Only show versions for this session UUID.")
    history_parser.add_argument("--limit", type=int, default=20, help="Maximum rows to show.")
    history_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    history_parser.set_defaults(func=_history_command)

    jobs_parser = subparsers.add_parser("jobs", help="Show recent CLI jobs.")
    jobs_parser.add_argument("--limit", type=int, default=20, help="Maximum jobs to show.")
    jobs_parser.add_argument("--status", choices=("running", "succeeded", "failed"), help="Filter by status.")
    jobs_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    jobs_parser.set_defaults(func=_jobs_command)

    job_parser = subparsers.add_parser("job", help="Show one CLI job and its error/result details.")
    job_parser.add_argument("job_id", type=int, help="CLI job id.")
    job_parser.add_argument("--error", action="store_true", help="Print only the saved error and traceback.")
    job_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    job_parser.set_defaults(func=_job_command)

    video_parser = subparsers.add_parser("render-video", help="Render a saved STEP object to MP4.")
    video_parser.add_argument("object", help="Saved numeric id or object UUID from history.")
    video_parser.add_argument("--width", type=int, default=960, help="Video width in pixels.")
    video_parser.add_argument("--height", type=int, default=720, help="Video height in pixels.")
    video_parser.add_argument("--fps", type=int, default=24, help="Frames per second.")
    video_parser.add_argument("--duration", type=float, default=4.0, help="Video duration in seconds.")
    video_parser.add_argument("--force", action="store_true", help="Regenerate even if a cached video exists.")
    video_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    video_parser.set_defaults(func=_render_video_command)

    generate_parser = subparsers.add_parser("generate", help="Generate a STEP file via the configured agent.")
    generate_parser.add_argument("prompt", nargs="+", help="Prompt describing the CAD object to generate.")
    generate_parser.add_argument(
        "--provider",
        choices=("openai", "gemini"),
        help="LLM provider to use for this run. Overrides LLM_PROVIDER.",
    )
    generate_parser.add_argument(
        "--model",
        help="Model to use for this run, for example gpt-4.1 or gemini-2.5-flash.",
    )
    generate_parser.add_argument(
        "--session",
        help="Existing session UUID to append a new version to. Omit to start a new session.",
    )
    generate_parser.add_argument(
        "--image",
        type=Path,
        help="Optional reference image to send to the agent and store with the run.",
    )
    generate_parser.add_argument(
        "--filename",
        help="Optional STEP filename. Defaults to an object UUID based filename.",
    )
    generate_parser.add_argument("--debug", action="store_true", help="Print provider, job, and fallback diagnostics.")
    generate_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    generate_parser.set_defaults(func=_generate_command)

    return parser


def _run_with_job_tracking(args: argparse.Namespace) -> int:
    command = str(args.command)
    if command in UNTRACKED_COMMANDS:
        return args.func(args)

    init_db()
    job = _create_job(command, _args_payload(args))
    args._job_id = job.id
    if getattr(args, "debug", False):
        print(f"[debug] job_id={job.id} command={command}", file=sys.stderr)
        print(f"[debug] args={json.dumps(_args_payload(args), default=str)}", file=sys.stderr)
    try:
        exit_code = int(args.func(args) or 0)
    except SystemExit as exc:
        exit_code = int(exc.code) if isinstance(exc.code, int) else 1
        if exit_code == 0:
            _succeed_job(job.id)
        else:
            failure = RuntimeError(str(exc) or f"Command exited with status {exit_code}")
            _fail_job(job.id, failure)
            print(f"Job {job.id} failed: {failure}", file=sys.stderr)
            print(f"Run `agentcad job {job.id} --error` to print the saved traceback.", file=sys.stderr)
            if getattr(args, "debug", False):
                traceback.print_exception(type(failure), failure, failure.__traceback__, file=sys.stderr)
        return exit_code
    except Exception as exc:
        _fail_job(job.id, exc)
        print(f"Job {job.id} failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        print(f"Run `agentcad job {job.id} --error` to print the saved traceback.", file=sys.stderr)
        if getattr(args, "debug", False):
            traceback.print_exception(type(exc), exc, exc.__traceback__, file=sys.stderr)
        return 1

    if exit_code == 0:
        _succeed_job(job.id)
    else:
        _fail_job(job.id, RuntimeError(f"Command exited with status {exit_code}"))
    return exit_code


def _models_command(args: argparse.Namespace) -> int:
    settings = get_settings()
    payload = list_llm_options(settings)
    _record_job_result(args, payload)
    if args.json:
        print(json.dumps(payload, indent=2))
        return 0

    print(f"Selected: {payload['selected_provider']} / {payload.get('selected_model') or 'none'}")
    for provider in payload["providers"]:
        configured = "configured" if provider["configured"] else "not configured"
        selected = " selected" if provider["selected"] else ""
        print(f"\n{provider['provider']} ({configured}, auth={provider['authentication']}){selected}")
        for model in provider["models"]:
            marker = "*" if model["selected"] else "-"
            print(f"  {marker} {model['model']}")
    return 0


def _history_command(args: argparse.Namespace) -> int:
    init_db()
    with Session(engine) as session:
        statement = select(CADObject).order_by(CADObject.created_at.desc()).limit(args.limit)
        if args.session:
            statement = (
                select(CADObject)
                .where(CADObject.session_uuid == args.session)
                .order_by(CADObject.version.desc(), CADObject.created_at.desc())
                .limit(args.limit)
            )
        rows = session.exec(statement).all()

    payload = [_history_row(cad_object) for cad_object in rows]
    _record_job_result(args, {"objects": payload, "count": len(payload)})
    if args.json:
        print(json.dumps(payload, indent=2))
        return 0

    if not payload:
        print("No generated STEP files found.")
        return 0

    for row in payload:
        print(
            f"#{row['id']} v{row['version']} {row['session_uuid']} "
            f"{row['model_used']} {row['step_file_location']}"
        )
        print(f"  {row['prompt']}")
    return 0


def _jobs_command(args: argparse.Namespace) -> int:
    init_db()
    with Session(engine) as session:
        statement = select(CLIJob).order_by(CLIJob.created_at.desc()).limit(args.limit)
        if args.status:
            statement = (
                select(CLIJob)
                .where(CLIJob.status == args.status)
                .order_by(CLIJob.created_at.desc())
                .limit(args.limit)
            )
        jobs = session.exec(statement).all()

    payload = [_job_payload(job, include_details=False) for job in jobs]
    if args.json:
        print(json.dumps(payload, indent=2))
        return 0

    if not payload:
        print("No CLI jobs found.")
        return 0

    for job in payload:
        target = job.get("output_path") or job.get("object_uuid") or ""
        print(f"#{job['id']} {job['status']} {job['command']} {job['created_at']} {target}")
        if job.get("error_message"):
            print(f"  {job['error_type']}: {job['error_message']}")
    return 0


def _job_command(args: argparse.Namespace) -> int:
    init_db()
    with Session(engine) as session:
        job = session.get(CLIJob, args.job_id)
        if job is None:
            raise SystemExit(f"Job not found: {args.job_id}")
        payload = _job_payload(job, include_details=True)

    if args.json:
        print(json.dumps(payload, indent=2))
        return 0

    if args.error:
        if not payload.get("error_message"):
            print(f"Job {args.job_id} has no saved error.")
            return 0
        print(f"{payload.get('error_type')}: {payload.get('error_message')}")
        if payload.get("traceback"):
            print()
            print(payload["traceback"])
        return 0

    print(f"Job {payload['id']} [{payload['status']}] {payload['command']}")
    print(f"Created: {payload['created_at']}")
    print(f"Updated: {payload['updated_at']}")
    if payload.get("cad_object_id"):
        print(f"Object: {payload['cad_object_id']} / {payload.get('object_uuid')}")
    if payload.get("session_uuid"):
        print(f"Session: {payload['session_uuid']}")
    if payload.get("output_path"):
        print(f"Output: {payload['output_path']}")
    if payload.get("error_message"):
        print(f"Error: {payload.get('error_type')}: {payload.get('error_message')}")
        print(f"Run `agentcad job {payload['id']} --error` for the traceback.")
    else:
        print("Result:")
        print(json.dumps(payload.get("result", {}), indent=2))
    return 0


def _generate_command(args: argparse.Namespace) -> int:
    _prepare_cadquery_imports()
    from app.services.cadquery_agent import CadQueryAgentService

    init_db()
    settings = get_settings()
    _apply_model_overrides(settings, provider=args.provider, model=args.model)
    if args.debug:
        print(
            "[debug] llm_provider="
            f"{settings.llm_provider} openai_model={settings.openai_model} "
            f"gemini_model={settings.gemini_model}",
            file=sys.stderr,
        )
        print(
            "[debug] auth="
            f"openai:{bool(settings.openai_api_key)} gemini:{bool(settings.gemini_api_key)}",
            file=sys.stderr,
        )
        print(
            "[debug] storage="
            f"metadata:{settings.metadata_backend} video:{settings.video_storage_backend}",
            file=sys.stderr,
        )

    prompt = " ".join(args.prompt).strip()
    image_bytes, image_path = _load_image(args.image, settings.upload_dir)
    agent_service = CadQueryAgentService()
    generated = agent_service.generate(
        prompt=prompt,
        image_bytes=image_bytes,
        image_mime=_guess_mime(args.image) if args.image else None,
    )

    with session_scope() as session:
        session_uuid = args.session or str(uuid.uuid4())
        version = _next_session_version(session, session_uuid)
        response = _persist_cli_generated_object(
            session=session,
            prompt=prompt,
            generated=generated,
            image_path=image_path,
            session_uuid=session_uuid,
            version=version,
            filename=args.filename,
        )

    _record_job_result(args, response)
    if args.debug:
        print(f"[debug] result={json.dumps(response, indent=2)}", file=sys.stderr)
        if response["used_fallback"]:
            print("[debug] generation used fallback geometry", file=sys.stderr)
        print(f"[debug] inspect with: agentcad job {args._job_id} --json", file=sys.stderr)
    if args.json:
        print(json.dumps(response, indent=2))
    else:
        print(f"Generated STEP: {response['step_file_location']}")
        print(f"Session: {response['session_uuid']}")
        print(f"Version: {response['version']}")
        print(f"Object: {response['object_uuid']}")
        print(f"Model: {response['model_used']}")
        if response["used_fallback"]:
            print("Fallback: yes")
            if response.get("fallback_reason"):
                print(f"Fallback reason: {response['fallback_reason']}")
    return 0


def _render_video_command(args: argparse.Namespace) -> int:
    from app.services.step_video_renderer import render_step_video
    from app.services.video_storage import store_video

    init_db()
    settings = get_settings()
    with Session(engine) as session:
        cad_object = _get_cad_object(session, args.object)
        if cad_object is None:
            raise SystemExit(f"Object not found: {args.object}")
        step_path = BASE_DIR / cad_object.step_file_path

    video_path = render_step_video(
        step_path=step_path,
        output_dir=settings.video_dir,
        object_id=int(cad_object.id),
        width=args.width,
        height=args.height,
        fps=args.fps,
        duration=args.duration,
        force=args.force,
    )
    stored_video = store_video(video_path, object_id=int(cad_object.id), settings=settings)
    response = {
        "id": cad_object.id,
        "object_uuid": cad_object.object_uuid,
        "video_storage_backend": stored_video.backend,
        "video_file_location": stored_video.location,
        "video_url": stored_video.url,
        "width": args.width,
        "height": args.height,
        "fps": args.fps,
        "duration": args.duration,
    }
    _record_job_result(args, response)
    if args.json:
        print(json.dumps(response, indent=2))
    else:
        print(f"Rendered video: {response['video_file_location']}")
        print(f"Video URL: {response['video_url']}")
    return 0


def _get_cad_object(session: Session, identifier: str) -> CADObject | None:
    try:
        return session.get(CADObject, int(identifier))
    except ValueError:
        return session.exec(
            select(CADObject).where(CADObject.object_uuid == identifier)
        ).first()


def _create_job(command: str, args_payload: dict[str, Any]) -> CLIJob:
    with Session(engine) as session:
        job = CLIJob(
            command=command,
            status="running",
            args_json=json.dumps(args_payload, default=str),
            updated_at=utc_now(),
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        return job


def _record_job_result(args: argparse.Namespace, result: dict[str, Any]) -> None:
    job_id = getattr(args, "_job_id", None)
    if job_id is None:
        return
    with Session(engine) as session:
        job = session.get(CLIJob, job_id)
        if job is None:
            return
        job.result_json = json.dumps(result, default=str)
        job.cad_object_id = result.get("id")
        job.object_uuid = result.get("object_uuid")
        job.session_uuid = result.get("session_uuid")
        job.output_path = result.get("step_file_location") or result.get("video_file_location")
        job.updated_at = utc_now()
        session.add(job)
        session.commit()


def _succeed_job(job_id: int | None) -> None:
    if job_id is None:
        return
    with Session(engine) as session:
        job = session.get(CLIJob, job_id)
        if job is None:
            return
        job.status = "succeeded"
        job.error_type = None
        job.error_message = None
        job.traceback = None
        job.updated_at = utc_now()
        session.add(job)
        session.commit()


def _fail_job(job_id: int | None, exc: BaseException) -> None:
    if job_id is None:
        return
    with Session(engine) as session:
        job = session.get(CLIJob, job_id)
        if job is None:
            return
        job.status = "failed"
        job.error_type = type(exc).__name__
        job.error_message = str(exc)
        job.traceback = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        job.updated_at = utc_now()
        session.add(job)
        session.commit()


def _args_payload(args: argparse.Namespace) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for key, value in vars(args).items():
        if key.startswith("_") or key == "func":
            continue
        if isinstance(value, Path):
            payload[key] = str(value)
        else:
            payload[key] = value
    return payload


def _job_payload(job: CLIJob, *, include_details: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": job.id,
        "command": job.command,
        "status": job.status,
        "cad_object_id": job.cad_object_id,
        "object_uuid": job.object_uuid,
        "session_uuid": job.session_uuid,
        "output_path": job.output_path,
        "error_type": job.error_type,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }
    if include_details:
        payload["args"] = _loads_json(job.args_json)
        payload["result"] = _loads_json(job.result_json)
        payload["traceback"] = job.traceback
    return payload


def _loads_json(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _apply_model_overrides(settings, provider: str | None, model: str | None) -> None:
    requested_provider = provider.lower() if provider else None
    inferred_provider = _infer_provider_for_model(model) if model else None
    if requested_provider and inferred_provider and requested_provider != inferred_provider:
        raise SystemExit(
            f"Model {model!r} belongs to provider {inferred_provider!r}, "
            f"but --provider {requested_provider!r} was requested."
        )

    if requested_provider:
        settings.llm_provider = requested_provider
    elif inferred_provider:
        settings.llm_provider = inferred_provider

    active_provider = settings.llm_provider.lower()
    if model and active_provider == "openai":
        settings.openai_model = model
    elif model and active_provider == "gemini":
        settings.gemini_model = model
    elif model:
        raise SystemExit(f"Cannot set model for unsupported provider: {active_provider}")


def _infer_provider_for_model(model: str | None) -> str | None:
    if not model:
        return None
    normalized = model.lower()
    if model in OPENAI_MODELS or normalized.startswith(("gpt-", "o1", "o3", "o4")):
        return "openai"
    if model in GEMINI_MODELS or normalized.startswith("gemini-"):
        return "gemini"
    return None


def _load_image(image_path: Path | None, upload_dir: Path) -> tuple[bytes | None, str | None]:
    if image_path is None:
        return None, None
    resolved = image_path.expanduser().resolve()
    if not resolved.exists() or not resolved.is_file():
        raise SystemExit(f"Image file not found: {image_path}")

    image_bytes = resolved.read_bytes()
    suffix = resolved.suffix or ".png"
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = upload_dir / stored_name
    shutil.copyfile(resolved, stored_path)
    return image_bytes, str(stored_path.relative_to(BASE_DIR))


def _guess_mime(image_path: Path | None) -> str | None:
    if image_path is None:
        return None
    suffix = image_path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    return "image/png"


def _persist_cli_generated_object(
    *,
    session: Session,
    prompt: str,
    generated: Any,
    image_path: str | None,
    session_uuid: str,
    version: int,
    filename: str | None,
) -> dict[str, Any]:
    _prepare_cadquery_imports()
    from app.services.cadquery_parser import components_to_tree, generate_arbitrary_step

    object_uuid = str(uuid.uuid4())
    step_filename = filename or f"{object_uuid}.step"
    _, step_path, preview_path, preview = generate_arbitrary_step(
        generated.cadquery_code,
        get_settings().export_dir,
        filename=step_filename,
    )

    created_at = utc_now()
    step_file_location = str(step_path.relative_to(BASE_DIR))
    preview_payload = {
        **preview,
        "tree": components_to_tree(generated.components),
        "summary": generated.summary,
        "usedFallback": generated.used_fallback,
        "job_metadata": {
            "prompt": prompt,
            "datetime": created_at.isoformat(),
            "session_uuid": session_uuid,
            "object_uuid": object_uuid,
            "version": version,
            "model_used": generated.model_used,
            "step_file_location": step_file_location,
            "animation_metadata": None,
            "code": generated.cadquery_code,
        },
        "previewSvgUrl": None,
    }
    cad_object = CADObject(
        session_uuid=session_uuid,
        object_uuid=object_uuid,
        version=version,
        prompt=prompt,
        image_path=image_path,
        cadquery_code=generated.cadquery_code,
        step_file_path=step_file_location,
        created_at=created_at,
        preview_metadata=json.dumps(preview_payload),
    )
    session.add(cad_object)
    session.commit()
    session.refresh(cad_object)

    component_records = [
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
        for component in generated.components
    ]
    session.add_all(component_records)
    session.add_all(
        [
            CADChatMessage(
                cad_object_id=cad_object.id,
                order_index=0,
                role="user",
                content=prompt,
                image_path=image_path,
            ),
            CADChatMessage(
                cad_object_id=cad_object.id,
                order_index=1,
                role="assistant",
                content="Generated the design from the command line.",
            ),
        ]
    )

    preview_payload["previewSvgUrl"] = (
        f"{get_settings().api_prefix}/objects/{cad_object.id}/preview-svg"
        if preview_path is not None
        else None
    )
    cad_object.preview_metadata = json.dumps(preview_payload)
    session.add(cad_object)
    session.commit()

    return {
        "id": cad_object.id,
        "session_uuid": cad_object.session_uuid,
        "object_uuid": cad_object.object_uuid,
        "version": cad_object.version,
        "prompt": cad_object.prompt,
        "model_used": generated.model_used,
        "used_fallback": generated.used_fallback,
        "fallback_reason": _fallback_reason(generated.components),
        "step_file_location": cad_object.step_file_path,
        "created_at": cad_object.created_at.isoformat(),
    }


def _history_row(cad_object: CADObject) -> dict[str, Any]:
    preview = {}
    try:
        preview = json.loads(cad_object.preview_metadata)
    except json.JSONDecodeError:
        pass
    metadata = preview.get("job_metadata") if isinstance(preview.get("job_metadata"), dict) else {}
    return {
        "id": cad_object.id,
        "session_uuid": cad_object.session_uuid,
        "object_uuid": cad_object.object_uuid,
        "version": cad_object.version,
        "prompt": cad_object.prompt,
        "model_used": metadata.get("model_used", "unknown"),
        "used_fallback": bool(preview.get("usedFallback")),
        "step_file_location": cad_object.step_file_path,
        "created_at": cad_object.created_at.isoformat(),
    }


def _fallback_reason(components: list[dict[str, Any]]) -> str | None:
    for component in components:
        metadata = component.get("metadata")
        if isinstance(metadata, dict) and metadata.get("reason"):
            return str(metadata["reason"])
    return None


def _next_session_version(session: Session, session_uuid: str) -> int:
    versions = session.exec(
        select(CADObject.version)
        .where(CADObject.session_uuid == session_uuid)
        .order_by(CADObject.version.desc())
    ).all()
    if not versions:
        return 1
    return int(versions[0]) + 1


def _prepare_cadquery_imports() -> None:
    matplotlib_config_dir = Path("/tmp") / "agentcad-matplotlib"
    matplotlib_config_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("MPLCONFIGDIR", str(matplotlib_config_dir))


if __name__ == "__main__":
    sys.exit(main())
