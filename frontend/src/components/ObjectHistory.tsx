import type { ObjectSummary } from "../types.js";

type ObjectHistoryProps = {
  items: ObjectSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
};

export function ObjectHistory({ items, activeId, onSelect }: ObjectHistoryProps) {
  return (
    <section className="panel history-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Stored Objects</div>
          <h2>Database history</h2>
        </div>
      </div>
      <div className="history-list">
        {items.length === 0 ? (
          <p className="empty-state">Generated models will appear here once saved.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeId ? "history-item active" : "history-item"}
              onClick={() => onSelect(item.id)}
            >
              <span>{item.prompt}</span>
              <small>
                {new Date(item.created_at).toLocaleString()} · {item.component_count} components
              </small>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
