import { useMemo, useState } from "react";

import type { ObjectSummary } from "../types.js";

type VersionSwitcherOverlayProps = {
  items: ObjectSummary[];
  activeId: number;
  busy: boolean;
  onSelect: (id: number) => void;
};

function formatSessionId(sessionUuid: string): string {
  return sessionUuid.slice(0, 8);
}

function getPromptPreview(prompt: string): string {
  const firstLine = prompt
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "Untitled version";
  }

  return firstLine.length > 56 ? `${firstLine.slice(0, 53)}...` : firstLine;
}

export function VersionSwitcherOverlay({ items, activeId, busy, onSelect }: VersionSwitcherOverlayProps) {
  const [open, setOpen] = useState(false);

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) ?? null,
    [activeId, items],
  );

  if (!activeItem) {
    return null;
  }

  return (
    <aside className="version-overlay-card">
      <button
        type="button"
        className={open ? "version-overlay-toggle open" : "version-overlay-toggle"}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="viewer-version-list"
      >
        <span className="version-overlay-copy">
          <span className="eyebrow">Current Version</span>
          <strong>{getPromptPreview(activeItem.prompt)}</strong>
          <small>
            Chat {formatSessionId(activeItem.session_uuid)} · v{activeItem.version} · {new Date(activeItem.created_at).toLocaleString()} · {activeItem.component_count} components
          </small>
        </span>
        <span className="version-overlay-toggle-label">{open ? "Hide" : "Switch"}</span>
      </button>

      {open ? (
        <div className="version-overlay-list" id="viewer-version-list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeId ? "version-item active" : "version-item"}
              onClick={() => {
                setOpen(false);
                onSelect(item.id);
              }}
              disabled={busy || item.id === activeId}
            >
              <span className="version-item-title-row">
                <strong>{item.id === activeId ? "Current version" : "Open version"}</strong>
                {item.has_animation ? <span className="version-item-tag">Animation</span> : null}
              </span>
              <span>{getPromptPreview(item.prompt)}</span>
              <small>
                Chat {formatSessionId(item.session_uuid)} · v{item.version} · {new Date(item.created_at).toLocaleString()} · {item.component_count} components
                {item.used_fallback ? " · fallback" : ""}
              </small>
            </button>
          ))}
        </div>
      ) : null}
    </aside>
  );
}