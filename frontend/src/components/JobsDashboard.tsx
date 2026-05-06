import type { GeneratedObject, ObjectSummary } from "../types.js";

type JobsDashboardProps = {
  jobs: ObjectSummary[];
  activeId: number | null;
  previewJob: GeneratedObject | null;
  busy: boolean;
  onRefresh: () => void;
  onOpenJob: (id: number) => void;
  onPreviewJob: (id: number) => void;
};

export function JobsDashboard({
  jobs,
  activeId,
  previewJob,
  busy,
  onRefresh,
  onOpenJob,
  onPreviewJob,
}: JobsDashboardProps) {
  const totalComponents = jobs.reduce((sum, job) => sum + job.component_count, 0);
  const animatedJobs = jobs.filter((job) => job.has_animation).length;
  const fallbackJobs = jobs.filter((job) => job.used_fallback).length;
  const latestJob = jobs[0];

  return (
    <section className="dashboard-panel panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Dashboard</div>
          <h2>Past jobs</h2>
        </div>
        <button type="button" className="ghost-button refresh-button" onClick={onRefresh} disabled={busy}>
          {busy ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="dashboard-stats">
        <article>
          <span>Saved Jobs</span>
          <strong>{jobs.length}</strong>
        </article>
        <article>
          <span>Components</span>
          <strong>{totalComponents}</strong>
        </article>
        <article>
          <span>Animated</span>
          <strong>{animatedJobs}</strong>
        </article>
        <article>
          <span>Fallbacks</span>
          <strong>{fallbackJobs}</strong>
        </article>
      </div>

      {latestJob ? (
        <div className="latest-job">
          <span>Latest</span>
          <strong>{latestJob.prompt}</strong>
          <small>{new Date(latestJob.created_at).toLocaleString()}</small>
        </div>
      ) : null}

      <div className="dashboard-content">
        <div className="jobs-table-shell">
          {jobs.length === 0 ? (
            <p className="empty-state">Past jobs will appear here after the first generation.</p>
          ) : (
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>Prompt</th>
                  <th>Created</th>
                  <th>Model</th>
                  <th>STEP</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className={job.id === activeId ? "active" : undefined}>
                    <td>
                      <strong>{job.prompt}</strong>
                      <span>{job.summary ?? "No summary saved."}</span>
                    </td>
                    <td>{new Date(job.created_at).toLocaleString()}</td>
                    <td>{job.model_used}</td>
                    <td>
                      <a href={job.step_file_url} target="_blank" rel="noreferrer">
                        {job.step_file_location}
                      </a>
                    </td>
                    <td>
                      <div className="job-tags">
                        <span>{job.component_count} components</span>
                        {job.has_animation ? <span>Animation</span> : null}
                        {job.used_fallback ? <span>Fallback</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="job-actions">
                        <button type="button" className="ghost-button" onClick={() => onPreviewJob(job.id)} disabled={busy}>
                          Chats
                        </button>
                        <button type="button" onClick={() => onOpenJob(job.id)} disabled={busy}>
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="past-chat-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Past Chats</div>
              <h2>{previewJob ? previewJob.prompt : "Select a saved job"}</h2>
            </div>
            {previewJob ? (
              <button type="button" onClick={() => onOpenJob(previewJob.id)} disabled={busy}>
                Open version
              </button>
            ) : null}
          </div>
          <div className="past-chat-body">
            {previewJob ? (
              <>
                <div className="past-chat-meta">
                  <span>{new Date(previewJob.created_at).toLocaleString()}</span>
                  <span>{previewJob.components.length} components</span>
                </div>
                <div className="past-chat-thread">
                  {previewJob.chat_messages.length === 0 ? (
                    <p className="empty-state">No saved chat messages for this job.</p>
                  ) : (
                    previewJob.chat_messages.map((message, index) => (
                      <article key={`${previewJob.id}-${message.role}-${index}`} className={`chat-message ${message.role}`}>
                        <span>{message.role === "user" ? "You" : "AG2"}</span>
                        <p>{message.content}</p>
                        {message.image_url ? (
                          <img
                            className="chat-message-image"
                            src={message.image_url}
                            alt={message.role === "user" ? "Attached reference" : "Saved attachment"}
                          />
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </>
            ) : (
              <p className="empty-state">Use the Chats action on any saved job to inspect its conversation history here.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
