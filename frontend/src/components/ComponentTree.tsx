import type { ComponentNode } from "../types.js";

type ComponentTreeProps = {
  components: ComponentNode[];
  activeNodeId: string | null;
  onSelect: (nodeId: string) => void;
};

export function ComponentTree({ components, activeNodeId, onSelect }: ComponentTreeProps) {
  return (
    <section className="panel tree-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Hierarchy</div>
          <h2>Component graph</h2>
        </div>
      </div>
      <div className="tree-list">
        {components.length === 0 ? (
          <p className="empty-state">No component graph available.</p>
        ) : (
          components
            .slice()
            .sort((left, right) => left.order_index - right.order_index)
            .map((component) => (
              <button
                key={component.node_id}
                type="button"
                className={component.node_id === activeNodeId ? "tree-node active" : "tree-node"}
                style={{ marginLeft: `${component.depth * 18}px` }}
                onClick={() => onSelect(component.node_id)}
              >
                <span className="tree-chip" style={{ background: component.color_hint ?? "#0f172a" }} />
                <span className="tree-copy">
                  <strong>{component.name}</strong>
                  <small>{component.kind}</small>
                </span>
              </button>
            ))
        )}
      </div>
    </section>
  );
}
