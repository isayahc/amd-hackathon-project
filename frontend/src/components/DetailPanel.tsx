import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { generateAnimation } from "../api.js";
import type { AnimationPlan, ComponentNode, GeneratedObject } from "../types.js";
import { StepViewer } from "./StepViewer.js";

type DetailPanelProps = {
  objectData: GeneratedObject | null;
  selectedComponent: ComponentNode | null;
  activeNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  chatOverlay?: ReactNode;
  versionOverlay?: ReactNode;
};

export function DetailPanel({
  objectData,
  selectedComponent,
  activeNodeId,
  onSelectNode,
  chatOverlay,
  versionOverlay,
}: DetailPanelProps) {
  const [animationPrompt, setAnimationPrompt] = useState(
    "Create a short showcase animation that highlights the most important components.",
  );
  const [animationPlan, setAnimationPlan] = useState<AnimationPlan | null>(null);
  const [animationBusy, setAnimationBusy] = useState(false);
  const [animationError, setAnimationError] = useState<string | null>(null);

  useEffect(() => {
    setAnimationPlan(objectData?.animation_plan ?? null);
    setAnimationBusy(false);
    setAnimationError(null);
  }, [objectData]);

  if (!objectData) {
    return (
      <section className="panel viewer-panel empty-preview-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">STEP Preview</div>
            <h2>No active design</h2>
          </div>
        </div>
        <div className="viewer-shell empty-viewer-shell">
          <div className="empty-preview-copy">
            <strong>Start a session from the chat.</strong>
            <span>The first message creates the design. Later messages modify that same session design.</span>
          </div>
          {chatOverlay ? <div className="viewer-overlay viewer-overlay-chat">{chatOverlay}</div> : null}
        </div>
      </section>
    );
  }

  const bbox = objectData.preview.bbox;
  const jobMetadata = objectData.metadata ?? {
    prompt: objectData.prompt,
    datetime: objectData.created_at,
    model_used: "Unknown",
    step_file_location: objectData.step_file_url,
    animation_metadata: null,
    code: objectData.cadquery_code,
  };
  const animationMetadata =
    jobMetadata.animation_metadata ??
    (animationPlan
      ? {
          prompt: animationPrompt,
          plan: animationPlan,
        }
      : null);

  async function handleGenerateAnimation() {
    if (!objectData) {
      return;
    }

    setAnimationBusy(true);
    setAnimationError(null);
    try {
      const plan = await generateAnimation(objectData.id, animationPrompt);
      setAnimationPlan(plan);
    } catch (error) {
      setAnimationError(error instanceof Error ? error.message : "Animation generation failed.");
    } finally {
      setAnimationBusy(false);
    }
  }

  return (
    <section className="detail-grid">
      <StepViewer
        stepFileUrl={objectData.step_file_url}
        selectedComponent={selectedComponent}
        components={objectData.components}
        animationPlan={animationPlan}
        activeNodeId={activeNodeId}
        onSelectNode={onSelectNode}
        chatOverlay={chatOverlay}
        versionOverlay={versionOverlay}
      />

      <section className="panel metrics-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Model Snapshot</div>
            <h2>{objectData.prompt}</h2>
          </div>
          <a className="download-link" href={objectData.step_file_url} target="_blank" rel="noreferrer">
            Download STEP
          </a>
        </div>
        <div className="metric-cards">
          <article>
            <span>Bounding Box</span>
            <strong>{bbox ? `${bbox.x} × ${bbox.y} × ${bbox.z}` : "Unknown"}</strong>
          </article>
          <article>
            <span>Volume</span>
            <strong>{objectData.preview.volume ?? "Unknown"}</strong>
          </article>
          <article>
            <span>Area</span>
            <strong>{objectData.preview.area ?? "Unknown"}</strong>
          </article>
          <article>
            <span>Solids</span>
            <strong>{objectData.preview.solidCount ?? 0}</strong>
          </article>
        </div>
        <div className="summary-box">
          <p>{objectData.preview.summary ?? "No summary available."}</p>
          {objectData.preview.usedFallback ? <span>Fallback geometry was used.</span> : null}
        </div>
      </section>

      <section className="panel animation-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Animation Agent</div>
            <h2>{animationPlan?.title ?? "Generate a motion plan"}</h2>
          </div>
        </div>
        <div className="animation-controls">
          <label className="animation-prompt-field">
            <span>Animation prompt</span>
            <textarea
              value={animationPrompt}
              onChange={(event) => setAnimationPrompt(event.target.value)}
              placeholder="Describe the motion you want to see"
            />
          </label>
          <div className="animation-actions">
            <button type="button" onClick={handleGenerateAnimation} disabled={animationBusy}>
              {animationBusy ? "Generating..." : "Generate animation"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setAnimationPlan(null)}
              disabled={!animationPlan || animationBusy}
            >
              Clear
            </button>
          </div>
          {animationPlan ? (
            <div className="animation-summary-box">
              <p>{animationPlan.summary}</p>
              <span>
                {animationPlan.duration.toFixed(1)}s · {animationPlan.tracks.length} tracks
                {animationPlan.used_fallback ? " · fallback plan" : ""}
              </span>
            </div>
          ) : (
            <p className="empty-state">Generate an animation to preview motion directly in the STEP viewer.</p>
          )}
          {animationError ? <p className="animation-error">{animationError}</p> : null}
        </div>
      </section>

      <section className="panel selection-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Selection</div>
            <h2>{selectedComponent?.name ?? "No component selected"}</h2>
          </div>
        </div>
        {selectedComponent ? (
          <div className="selection-details">
            <p>
              <strong>Type:</strong> {selectedComponent.kind}
            </p>
            <p>
              <strong>Node:</strong> {selectedComponent.node_id}
            </p>
            <p>
              <strong>Parent:</strong> {selectedComponent.parent_node_id ?? "root"}
            </p>
            <pre>{JSON.stringify(selectedComponent.metadata, null, 2)}</pre>
          </div>
        ) : (
          <p className="empty-state">Click a component in the graph to highlight and inspect it.</p>
        )}
      </section>

      <section className="panel metadata-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Job Metadata</div>
            <h2>Saved job record</h2>
          </div>
        </div>
        <div className="metadata-grid">
          <p>
            <strong>Prompt:</strong> {jobMetadata.prompt}
          </p>
          <p>
            <strong>Datetime:</strong> {new Date(jobMetadata.datetime).toLocaleString()}
          </p>
          <p>
            <strong>Model:</strong> {jobMetadata.model_used}
          </p>
          <p>
            <strong>STEP file:</strong> {jobMetadata.step_file_location}
          </p>
        </div>
        <pre className="metadata-json">
          {JSON.stringify({ animation_metadata: animationMetadata }, null, 2)}
        </pre>
      </section>

      <section className="panel code-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">CadQuery</div>
            <h2>Generated code</h2>
          </div>
        </div>
        <pre>{jobMetadata.code}</pre>
      </section>
    </section>
  );
}
