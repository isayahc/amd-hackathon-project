from __future__ import annotations

import json
import textwrap
from dataclasses import dataclass
from typing import Any

import autogen

from app.config import get_settings


SYSTEM_PROMPT = """
You generate transform-based animation plans for existing CAD component hierarchies.

Return JSON with this exact schema:
{
  "title": "short animation title",
  "summary": "single sentence",
  "duration": 6.0,
  "loop": true,
  "tracks": [
    {
      "node_id": "root or a provided component node_id",
      "label": "Readable track label",
      "keyframes": [
        {
          "t": 0.0,
          "position": [0, 0, 0],
          "rotation": [0, 0, 0],
          "scale": [1, 1, 1]
        }
      ]
    }
  ]
}

Rules:
- Only reference `node_id` values that appear in the provided component list, plus `root`.
- Use seconds for `t`, with values between 0 and `duration` inclusive.
- Use radians for `rotation` in XYZ order.
- Use gentle transform values suitable for product showcase animations.
- Always include at least 2 keyframes per track.
- Keep plans deterministic and easy to preview.
- Return JSON only.
""".strip()


@dataclass
class AnimationAgentOutput:
    title: str
    summary: str
    duration: float
    loop: bool
    tracks: list[dict[str, Any]]
    model_used: str
    used_fallback: bool = False


class AnimationAgentService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def generate(
        self,
        object_prompt: str,
        components: list[dict[str, Any]],
        preview: dict[str, Any],
        prompt: str | None = None,
    ) -> AnimationAgentOutput:
        if not self.settings.openai_api_key:
            return self._fallback(components, prompt=prompt, reason="missing OPENAI_API_KEY")

        try:
            message = self._build_prompt(
                object_prompt=object_prompt,
                components=components,
                preview=preview,
                prompt=prompt,
            )
            llm_config = {
                "config_list": [
                    {
                        "model": self.settings.openai_model,
                        "api_key": self.settings.openai_api_key,
                    }
                ],
            }
            agent = autogen.AssistantAgent(
                name="animation_designer",
                system_message=SYSTEM_PROMPT,
                llm_config=llm_config,
            )
            response = agent.generate_reply(messages=[{"role": "user", "content": message}])
            payload = self._parse_response(response)
            return self._normalize_payload(payload, components)
        except Exception as exc:
            return self._fallback(components, prompt=prompt, reason=str(exc))

    def _build_prompt(
        self,
        object_prompt: str,
        components: list[dict[str, Any]],
        preview: dict[str, Any],
        prompt: str | None,
    ) -> str:
        animation_prompt = prompt or "Create a short showcase animation that presents the model clearly."
        return textwrap.dedent(
            f"""
            Object request:
            {object_prompt.strip()}

            Animation request:
            {animation_prompt.strip()}

            Preview metadata:
            {json.dumps(preview, indent=2)}

            Components:
            {json.dumps(components, indent=2)}
            """
        ).strip()

    def _parse_response(self, response: Any) -> dict[str, Any]:
        if isinstance(response, dict):
            return response
        if not isinstance(response, str):
            raise TypeError("Animation agent did not return a string response")
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
        return json.loads(cleaned)

    def _normalize_payload(
        self,
        payload: dict[str, Any],
        components: list[dict[str, Any]],
    ) -> AnimationAgentOutput:
        valid_node_ids = {"root", *(component["node_id"] for component in components)}
        duration = float(payload.get("duration") or 6.0)
        duration = min(max(duration, 1.0), 20.0)

        tracks: list[dict[str, Any]] = []
        for index, track in enumerate(payload.get("tracks", [])):
            node_id = track.get("node_id")
            if node_id not in valid_node_ids:
                continue

            normalized_keyframes: list[dict[str, Any]] = []
            for keyframe in track.get("keyframes", []):
                t = min(max(float(keyframe.get("t") or 0.0), 0.0), duration)
                normalized_keyframes.append(
                    {
                        "t": t,
                        "position": self._normalize_vector(keyframe.get("position"), [0.0, 0.0, 0.0]),
                        "rotation": self._normalize_vector(keyframe.get("rotation"), [0.0, 0.0, 0.0]),
                        "scale": self._normalize_vector(keyframe.get("scale"), [1.0, 1.0, 1.0]),
                    }
                )

            normalized_keyframes.sort(key=lambda item: item["t"])
            if len(normalized_keyframes) < 2:
                continue

            tracks.append(
                {
                    "node_id": node_id,
                    "label": str(track.get("label") or f"Track {index + 1}"),
                    "keyframes": normalized_keyframes,
                }
            )

        if not tracks:
            return self._fallback(components, reason="no valid animation tracks")

        return AnimationAgentOutput(
            title=str(payload.get("title") or "Showcase Animation"),
            summary=str(payload.get("summary") or "Generated animation plan."),
            duration=duration,
            loop=bool(payload.get("loop", True)),
            tracks=tracks,
            model_used=self.settings.openai_model,
        )

    def _normalize_vector(self, value: Any, default: list[float]) -> list[float]:
        if not isinstance(value, (list, tuple)) or len(value) != 3:
            return list(default)
        try:
            return [float(value[0]), float(value[1]), float(value[2])]
        except (TypeError, ValueError):
            return list(default)

    def _fallback(
        self,
        components: list[dict[str, Any]],
        prompt: str | None = None,
        reason: str | None = None,
    ) -> AnimationAgentOutput:
        duration = 6.0
        tracks: list[dict[str, Any]] = [
            {
                "node_id": "root",
                "label": "Camera-friendly reveal",
                "keyframes": [
                    {"t": 0.0, "position": [0.0, -4.0, 0.0], "rotation": [0.0, -0.15, 0.0], "scale": [1.0, 1.0, 1.0]},
                    {"t": duration * 0.5, "position": [0.0, 3.0, 0.0], "rotation": [0.0, 0.18, 0.0], "scale": [1.02, 1.02, 1.02]},
                    {"t": duration, "position": [0.0, -4.0, 0.0], "rotation": [0.0, -0.15, 0.0], "scale": [1.0, 1.0, 1.0]},
                ],
            }
        ]

        non_root_components = [component for component in components if component["node_id"] != "root"]
        for index, component in enumerate(non_root_components[:4]):
            start_time = index * 0.8
            peak_time = min(start_time + 0.45, duration - 0.6)
            end_time = min(start_time + 0.9, duration)
            tracks.append(
                {
                    "node_id": component["node_id"],
                    "label": f"Focus {component['name']}",
                    "keyframes": [
                        {"t": start_time, "position": [0.0, 0.0, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [1.0, 1.0, 1.0]},
                        {"t": peak_time, "position": [0.0, 8.0, 0.0], "rotation": [0.0, 0.22, 0.0], "scale": [1.05, 1.05, 1.05]},
                        {"t": end_time, "position": [0.0, 0.0, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [1.0, 1.0, 1.0]},
                    ],
                }
            )

        summary = "Fallback showcase animation plan generated."
        if prompt:
            summary = f"Fallback animation for: {prompt[:80]}"
        if reason:
            summary = f"{summary} ({reason})"

        return AnimationAgentOutput(
            title="Showcase Animation",
            summary=summary,
            duration=duration,
            loop=True,
            tracks=tracks,
            model_used="fallback",
            used_fallback=True,
        )
