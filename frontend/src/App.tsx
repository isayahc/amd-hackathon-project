import { useEffect, useMemo, useState } from "react";

import { generateObject, getObject, listObjects } from "./api.js";
import { DetailPanel } from "./components/DetailPanel.js";
import { ObjectHistory } from "./components/ObjectHistory.js";
import { PromptComposer } from "./components/PromptComposer.js";
import type { ComponentNode, GeneratedObject, ObjectSummary } from "./types.js";

export default function App() {
  const [history, setHistory] = useState<ObjectSummary[]>([]);
  const [currentObject, setCurrentObject] = useState<GeneratedObject | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshHistory();
  }, []);

  async function refreshHistory(selectedId?: number) {
    try {
      const items = await listObjects();
      setHistory(items);
      const targetId = selectedId ?? items[0]?.id;
      if (targetId) {
        const nextObject = await getObject(targetId);
        setCurrentObject(nextObject);
        setSelectedNodeId(nextObject.components[0]?.node_id ?? null);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error.");
    }
  }

  async function handleGenerate(prompt: string, imageFile: File | null) {
    setBusy(true);
    setError(null);
    try {
      const generated = await generateObject(prompt, imageFile);
      setCurrentObject(generated);
      setSelectedNodeId(generated.components[0]?.node_id ?? null);
      const items = await listObjects();
      setHistory(items);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error.");
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
      setSelectedNodeId(nextObject.components[0]?.node_id ?? null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error.");
    } finally {
      setBusy(false);
    }
  }

  const selectedComponent = useMemo<ComponentNode | null>(() => {
    if (!currentObject || !selectedNodeId) {
      return null;
    }
    return (
      currentObject.components.find(
        (component: ComponentNode) => component.node_id === selectedNodeId,
      ) ?? null
    );
  }, [currentObject, selectedNodeId]);

  return (
    <main className="app-shell">
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />

      <section className="hero-grid">
        <PromptComposer busy={busy} onSubmit={handleGenerate} />
        <ObjectHistory
          items={history}
          activeId={currentObject?.id ?? null}
          onSelect={handleSelectHistory}
        />
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="workspace-shell">
        <DetailPanel
          objectData={currentObject}
          selectedComponent={selectedComponent}
          activeNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />
      </section>
    </main>
  );
}
