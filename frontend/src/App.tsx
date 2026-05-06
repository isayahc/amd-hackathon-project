import { useEffect, useMemo, useState } from "react";

import { generateObject, getObject, listObjects, modifyObject } from "./api.js";
import { DesignChatOverlay } from "./components/DesignChatOverlay.js";
import { DetailPanel } from "./components/DetailPanel.js";
import { JobsDashboard } from "./components/JobsDashboard.js";
import { VersionSwitcherOverlay } from "./components/VersionSwitcherOverlay.js";
import type { ChatMessage, ComponentNode, GeneratedObject, ObjectSummary } from "./types.js";

type ActiveView = "studio" | "dashboard";
type ChatPane = "current" | "archive";

export default function App() {
  const [history, setHistory] = useState<ObjectSummary[]>([]);
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

  useEffect(() => {
    void refreshHistory();
  }, []);

  async function refreshHistory(selectedId?: number) {
    setBusy(true);
    try {
      const items = await listObjects();
      setHistory(items);
      if (selectedId) {
        const targetId = selectedId;
        const nextObject = await getObject(targetId);
        setCurrentObject(nextObject);
        setPreviewObject(nextObject);
        setChatPane("current");
        setChatMessages(nextObject.chat_messages);
        setSelectedNodeId(nextObject.components[0]?.node_id ?? null);
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
      setCurrentObject(nextObject);
      setPreviewObject(nextObject);
      setChatPane("current");
      setChatMessages(nextObject.chat_messages);
      setSelectedNodeId(nextObject.components[0]?.node_id ?? null);
      setActiveView("studio");
      const items = await listObjects();
      setHistory(items);
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
      setCurrentObject(nextObject);
      setPreviewObject(nextObject);
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

  const chatOverlay = (
    <DesignChatOverlay
      messages={chatMessages}
      historyItems={history}
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
      items={history}
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
          className={activeView === "dashboard" ? "active" : undefined}
          onClick={() => setActiveView("dashboard")}
        >
          Dashboard
        </button>
      </nav>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="workspace-shell">
        {activeView === "dashboard" ? (
          <JobsDashboard
            jobs={history}
            activeId={currentObject?.id ?? null}
            previewJob={previewObject}
            busy={busy}
            onRefresh={() => void refreshHistory(currentObject?.id ?? undefined)}
            onOpenJob={handleSelectHistory}
            onPreviewJob={handlePreviewHistory}
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
