import { useEffect, useMemo, useState } from "react";
import { listObjectsBySession } from "../api.js";
import type { ObjectSummary, ShowroomPlacement } from "../types.js";
import { ShowroomScene } from "./ShowroomScene.js";

type ShowroomPanelProps = {
  objects: ObjectSummary[];
  activeId: number | null;
  busy: boolean;
  placements: ShowroomPlacement[];
  onOpenObject: (id: number) => void;
  onPlaceObject: (
    object: ObjectSummary,
    position?: { x: number; z: number },
    placementId?: string,
  ) => void;
  onMoveObject: (placementId: string, position: { x: number; z: number }) => void;
  onUpdatePlacementY: (placementId: string, y: number) => void;
  onUpdatePlacementVersion: (placementId: string, object: ObjectSummary) => void;
  onRemoveObject: (placementId: string) => void;
};

function getObjectLabel(prompt: string): string {
  const firstLine = prompt
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine || "Untitled object";
}

function formatSessionId(sessionUuid: string): string {
  return sessionUuid.slice(0, 8);
}

export function ShowroomPanel({
  objects,
  activeId,
  busy,
  placements,
  onOpenObject,
  onPlaceObject,
  onMoveObject,
  onUpdatePlacementY,
  onUpdatePlacementVersion,
  onRemoveObject,
}: ShowroomPanelProps) {
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [draggedObjectId, setDraggedObjectId] = useState<number | null>(null);
  const [versionItems, setVersionItems] = useState<ObjectSummary[]>([]);
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const selectedPlacement =
    placements.find((placement) => placement.placement_id === selectedPlacementId) ?? placements[0] ?? null;
  const loadedIds = useMemo(
    () => new Set(placements.map((placement) => placement.object.id)),
    [placements],
  );

  useEffect(() => {
    if (
      selectedPlacementId !== null &&
      placements.some((placement) => placement.placement_id === selectedPlacementId)
    ) {
      return;
    }

    setSelectedPlacementId(placements[0]?.placement_id ?? null);
  }, [placements, selectedPlacementId]);

  useEffect(() => {
    if (!selectedPlacement) {
      setVersionItems([]);
      setVersionBusy(false);
      setVersionError(null);
      return;
    }

    let cancelled = false;
    setVersionBusy(true);
    setVersionError(null);

    void listObjectsBySession(selectedPlacement.object.session_uuid)
      .then((items) => {
        if (!cancelled) {
          setVersionItems(items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setVersionItems([]);
          setVersionError(error instanceof Error ? error.message : "Failed to load versions.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVersionBusy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPlacement]);

  function handleDrop(objectId: number, position: { x: number; z: number }) {
    const object = objects.find((entry) => entry.id === objectId);
    if (!object) {
      return;
    }

    setSelectedPlacementId(null);
    onPlaceObject(object, position);
  }

  return (
    <section className="showroom-panel panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Showroom</div>
          <h2>Room plan</h2>
        </div>
      </div>

      <div className="showroom-hero">
        <div>
          <strong>Load saved objects into an empty showroom room</strong>
          <p>
            Start with an empty room, then drag saved models from the library directly onto the floor.
            Dropped models become part of the room scene, not floating UI cards.
          </p>
        </div>
      </div>

      <div className="showroom-layout">
        <section className="showroom-room-shell">
          <div className="showroom-room-copy">
            <div>
              <div className="eyebrow">Empty Room</div>
              <h3>Drop models into the scene</h3>
            </div>
            <p>The room starts empty. Drag from the library and drop anywhere on the floor.</p>
          </div>
          <ShowroomScene
            placements={placements}
            draggedObjectId={draggedObjectId}
            selectedPlacementId={selectedPlacement?.placement_id ?? null}
            busy={busy}
            onDropObject={handleDrop}
            onMoveObject={onMoveObject}
            onSelectObject={setSelectedPlacementId}
          />
        </section>

        <aside className="showroom-library">
          <div className="showroom-selected-panel">
            <div>
              <div className="eyebrow">Selected Model</div>
              <h3>{selectedPlacement ? getObjectLabel(selectedPlacement.object.prompt) : "Nothing selected"}</h3>
            </div>
            {selectedPlacement ? (
              <>
                <p>
                  Chat {formatSessionId(selectedPlacement.object.session_uuid)} · v{selectedPlacement.object.version}
                </p>
                <p>
                  Position x {selectedPlacement.x.toFixed(1)} · z {selectedPlacement.z.toFixed(1)}
                </p>
                <div className="showroom-axis-control">
                  <label htmlFor="showroom-y-offset">Y offset</label>
                  <div className="showroom-axis-inputs">
                    <input
                      id="showroom-y-offset"
                      type="range"
                      min={-40}
                      max={120}
                      step={1}
                      value={selectedPlacement.y}
                      onChange={(event) =>
                        onUpdatePlacementY(
                          selectedPlacement.placement_id,
                          Number(event.currentTarget.value),
                        )
                      }
                      disabled={busy}
                    />
                    <input
                      type="number"
                      min={-40}
                      max={120}
                      step={1}
                      value={selectedPlacement.y}
                      onChange={(event) => {
                        const nextValue = Number(event.currentTarget.value);
                        if (!Number.isNaN(nextValue)) {
                          onUpdatePlacementY(selectedPlacement.placement_id, nextValue);
                        }
                      }}
                      disabled={busy}
                    />
                  </div>
                </div>
                <p>Drag this model inside the room to reposition it.</p>
                {versionItems.length > 1 ? (
                  <div className="showroom-version-switcher">
                    <span className="eyebrow">Versions</span>
                    <div className="showroom-version-list">
                      {versionItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={
                            item.id === selectedPlacement.object.id
                              ? "showroom-version-chip active"
                              : "showroom-version-chip"
                          }
                          onClick={() =>
                            onUpdatePlacementVersion(selectedPlacement.placement_id, item)
                          }
                          disabled={busy || versionBusy}
                        >
                          v{item.version}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {versionBusy ? <p>Loading versions...</p> : null}
                {versionError ? <p>{versionError}</p> : null}
                <div className="showroom-library-actions">
                  <button
                    type="button"
                    onClick={() => onOpenObject(selectedPlacement.object.id)}
                    disabled={busy}
                  >
                    Open in Studio
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onRemoveObject(selectedPlacement.placement_id)}
                    disabled={busy}
                  >
                    Remove from Room
                  </button>
                </div>
              </>
            ) : (
              <p>Click a placed model in the room to inspect it here.</p>
            )}
          </div>

          <div className="showroom-library-header">
            <div>
              <div className="eyebrow">Room Library</div>
              <h3>Saved models</h3>
            </div>
            <p>Drag a saved model into the room or place it in the center as a starting point.</p>
          </div>

          <div className="showroom-library-list">
            {objects.length === 0 ? (
              <p className="empty-state">Saved objects will appear here after the first generation.</p>
            ) : (
              objects.map((object) => (
                <article
                  key={object.id}
                  className={[
                    "showroom-library-item",
                    object.id === activeId ? "active" : "",
                    draggedObjectId === object.id ? "dragging" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  draggable={!busy}
                  onDragStart={(event) => {
                    setDraggedObjectId(object.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(object.id));
                  }}
                  onDragEnd={() => {
                    setDraggedObjectId(null);
                  }}
                >
                  <div className="showroom-library-copy">
                    <span className="eyebrow">Chat {formatSessionId(object.session_uuid)}</span>
                    <strong>{getObjectLabel(object.prompt)}</strong>
                    <small>
                      v{object.version} · {object.component_count} components · {new Date(object.created_at).toLocaleString()}
                    </small>
                  </div>
                  <div className="showroom-library-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPlacementId(null);
                        onPlaceObject(object);
                      }}
                      disabled={busy}
                    >
                      Place in Room
                    </button>
                    <button type="button" className="ghost-button" onClick={() => onOpenObject(object.id)} disabled={busy}>
                      Open
                    </button>
                  </div>
                  {loadedIds.has(object.id) ? <span className="showroom-loaded-tag">Loaded</span> : null}
                </article>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}