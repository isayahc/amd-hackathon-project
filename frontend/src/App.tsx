import { useEffect, useMemo, useState } from "react";

import {
  generateObject,
  getObject,
  listLatestObjects,
  listObjectsBySession,
  modifyObject,
} from "./api.js";
import { DesignChatOverlay } from "./components/DesignChatOverlay.js";
import { DetailPanel } from "./components/DetailPanel.js";
import { JobsDashboard } from "./components/JobsDashboard.js";
import { ShowroomPanel } from "./components/ShowroomPanel.js";
import { VersionSwitcherOverlay } from "./components/VersionSwitcherOverlay.js";
import type {
  ChatMessage,
  ComponentNode,
  GeneratedObject,
  ObjectSummary,
  ShowroomPlacement,
} from "./types.js";

type ActiveView = "studio" | "showroom" | "versions";
type ChatPane = "current" | "archive";

function toObjectSummary(object: GeneratedObject): ObjectSummary {
  return {
    id: object.id,
    session_uuid: object.session_uuid,
    object_uuid: object.object_uuid,
    version: object.version,
    prompt: object.prompt,
    created_at: object.created_at,
    step_file_url: object.step_file_url,
    step_file_location: object.metadata.step_file_location,
    model_used: object.metadata.model_used,
    has_animation: Boolean(object.animation_plan),
    used_fallback: Boolean(object.preview.usedFallback),
    summary: object.preview.summary ?? null,
    component_count: object.components.length,
  };
}

export default function App() {
  const [latestObjects, setLatestObjects] = useState<ObjectSummary[]>([]);
  const [sessionObjects, setSessionObjects] = useState<ObjectSummary[]>([]);
  const [showroomPlacements, setShowroomPlacements] = useState<ShowroomPlacement[]>([]);
  const [currentObject, setCurrentObject] = useState<GeneratedObject | null>(null);
  const [previewObject, setPreviewObject] = useState<GeneratedObject | null>(null);
  const [chatPane, setChatPane] = useState<ChatPane>("current");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>("studio");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayedObject = chatPane === "archive" ? previewObject ?? currentObject : currentObject;
  const submissionTarget = chatPane === "archive" ? previewObject ?? currentObject : currentObject;
  const studioHistory = currentObject ? sessionObjects : latestObjects;
  const showroomObjects = useMemo(() => {
    if (!displayedObject) {
      return latestObjects;
    }

    if (latestObjects.some((object) => object.id === displayedObject.id)) {
      return latestObjects;
    }

    return [toObjectSummary(displayedObject), ...latestObjects];
  }, [displayedObject, latestObjects]);

  useEffect(() => {
    void refreshData();
  }, []);

  async function refreshData(selectedId?: number) {
    setBusy(true);
    try {
      const latest = await listLatestObjects();
      setLatestObjects(latest);
      if (selectedId) {
        const targetId = selectedId;
        const nextObject = await getObject(targetId);
        const sessionItems = await listObjectsBySession(nextObject.session_uuid);
        setCurrentObject(nextObject);
        setPreviewObject(nextObject);
        setSessionObjects(sessionItems);
        setChatPane("current");
        setChatMessages(nextObject.chat_messages);
        setSelectedNodeId(nextObject.components[0]?.node_id ?? null);
      } else if (!currentObject) {
        setSessionObjects([]);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error.");
    } finally {
      setBusy(false);
    }
  }

  async function handleChatSubmit(prompt: string, imageFile: File | null) {
    setBusy(true);
    setError(null);
    try {
      const nextObject = submissionTarget
        ? await modifyObject(submissionTarget.id, prompt, imageFile)
        : await generateObject(prompt, imageFile);
      const [latest, sessionItems] = await Promise.all([
        listLatestObjects(),
        listObjectsBySession(nextObject.session_uuid),
      ]);
      setCurrentObject(nextObject);
      setPreviewObject(nextObject);
      setLatestObjects(latest);
      setSessionObjects(sessionItems);
      setChatPane("current");
      setChatMessages(nextObject.chat_messages);
      setSelectedNodeId(nextObject.components[0]?.node_id ?? null);
      setActiveView("studio");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error.");
      setChatMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          content: "I could not apply that CAD request. Try a smaller or more specific change.",
          image_url: null,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectHistory(id: number) {
    setBusy(true);
    setError(null);
    try {
      const nextObject = await getObject(id);
      const sessionItems = await listObjectsBySession(nextObject.session_uuid);
      setCurrentObject(nextObject);
      setPreviewObject(nextObject);
      setSessionObjects(sessionItems);
      setChatPane("current");
      setSelectedNodeId(nextObject.components[0]?.node_id ?? null);
      setChatMessages(nextObject.chat_messages);
      setActiveView("studio");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error.");
    } finally {
      setBusy(false);
    }
  }

  const selectedComponent = useMemo<ComponentNode | null>(() => {
    if (!displayedObject || !selectedNodeId) {
      return null;
    }
    return (
      displayedObject.components.find(
        (component: ComponentNode) => component.node_id === selectedNodeId,
      ) ?? null
    );
  }, [displayedObject, selectedNodeId]);

  useEffect(() => {
    if (!displayedObject) {
      if (selectedNodeId !== null) {
        setSelectedNodeId(null);
      }
      return;
    }

    const hasSelectedNode = displayedObject.components.some(
      (component: ComponentNode) => component.node_id === selectedNodeId,
    );
    if (!hasSelectedNode) {
      setSelectedNodeId(displayedObject.components[0]?.node_id ?? null);
    }
  }, [displayedObject, selectedNodeId]);

  function handleNewSession() {
    setCurrentObject(null);
    setPreviewObject(null);
    setSessionObjects([]);
    setChatPane("current");
    setSelectedNodeId(null);
    setChatMessages([]);
    setError(null);
    setActiveView("studio");
  }

  async function handlePreviewHistory(id: number) {
    if (previewObject?.id === id) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const nextObject = await getObject(id);
      setPreviewObject(nextObject);
      setSelectedNodeId(nextObject.components[0]?.node_id ?? null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error.");
    } finally {
      setBusy(false);
    }
  }

  function handlePlaceShowroomObject(
    object: ObjectSummary,
    position?: { x: number; z: number },
    placementId?: string,
  ) {
    setShowroomPlacements((placements) => {
      const fallbackPosition = {
        x: (placements.length % 3) * 42 - 42,
        z: 14 + Math.floor(placements.length / 3) * 34,
      };
      const nextPlacement: ShowroomPlacement = {
        placement_id: placementId ?? crypto.randomUUID(),
        object,
        x: position?.x ?? fallbackPosition.x,
        y: 0,
        z: position?.z ?? fallbackPosition.z,
      };

      if (placementId) {
        return placements.map((placement) =>
          placement.placement_id === placementId
            ? {
                ...placement,
                object,
                x: position?.x ?? placement.x,
                y: placement.y,
                z: position?.z ?? placement.z,
              }
            : placement,
        );
      }

      return [...placements, nextPlacement];
    });
  }

  function handleMoveShowroomObject(placementId: string, position: { x: number; z: number }) {
    setShowroomPlacements((placements) => {
      return placements.map((placement) =>
        placement.placement_id === placementId
          ? { ...placement, x: position.x, z: position.z }
          : placement,
      );
    });
  }

  function handleUpdateShowroomPlacementY(placementId: string, y: number) {
    setShowroomPlacements((placements) => {
      return placements.map((placement) =>
        placement.placement_id === placementId ? { ...placement, y } : placement,
      );
    });
  }

  function handleUpdateShowroomPlacementVersion(placementId: string, object: ObjectSummary) {
    setShowroomPlacements((placements) => {
      return placements.map((placement) =>
        placement.placement_id === placementId ? { ...placement, object } : placement,
      );
    });
  }

  function handleRemoveShowroomObject(placementId: string) {
    setShowroomPlacements((placements) => {
      return placements.filter((placement) => placement.placement_id !== placementId);
    });
  }

  const chatOverlay = (
    <DesignChatOverlay
      messages={chatMessages}
      historyItems={studioHistory}
      activeConversationId={currentObject?.id ?? null}
      activePane={chatPane}
      busy={busy}
      hasDesign={currentObject !== null}
      onSubmit={handleChatSubmit}
      onNewSession={handleNewSession}
      onChangePane={setChatPane}
      onOpenConversation={(id) => void handleSelectHistory(id)}
    />
  );

  const versionOverlay = displayedObject ? (
    <VersionSwitcherOverlay
      items={sessionObjects}
      activeId={displayedObject.id}
      busy={busy}
      onSelect={(id) => void handleSelectHistory(id)}
    />
  ) : null;

  return (
    <main className="app-shell">
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />

      <nav className="app-tabs" aria-label="Primary views">
        <button
          type="button"
          className={activeView === "studio" ? "active" : undefined}
          onClick={() => setActiveView("studio")}
        >
          Studio
        </button>
        <button
          type="button"
          className={activeView === "showroom" ? "active" : undefined}
          onClick={() => setActiveView("showroom")}
        >
          Showroom
        </button>
        <button
          type="button"
          className={activeView === "versions" ? "active" : undefined}
          onClick={() => setActiveView("versions")}
        >
          All Versions
        </button>
      </nav>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="workspace-shell">
        {activeView === "versions" ? (
          <JobsDashboard
            jobs={latestObjects}
            activeId={currentObject?.id ?? null}
            previewJob={previewObject}
            busy={busy}
            onRefresh={() => void refreshData(currentObject?.id ?? undefined)}
            onOpenJob={handleSelectHistory}
            onPreviewJob={handlePreviewHistory}
          />
        ) : activeView === "showroom" ? (
          <ShowroomPanel
            objects={showroomObjects}
            activeId={currentObject?.id ?? null}
            busy={busy}
            placements={showroomPlacements}
            onOpenObject={handleSelectHistory}
            onPlaceObject={handlePlaceShowroomObject}
            onMoveObject={handleMoveShowroomObject}
            onUpdatePlacementY={handleUpdateShowroomPlacementY}
            onUpdatePlacementVersion={handleUpdateShowroomPlacementVersion}
            onRemoveObject={handleRemoveShowroomObject}
          />
        ) : (
          <DetailPanel
            objectData={displayedObject}
            selectedComponent={selectedComponent}
            activeNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            chatOverlay={chatOverlay}
            versionOverlay={versionOverlay}
          />
        )}
      </section>
    </main>
  );
}
