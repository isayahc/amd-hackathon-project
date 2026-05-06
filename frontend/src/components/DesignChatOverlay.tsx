import { FormEvent, useEffect, useState } from "react";

import type { ChatMessage, ObjectSummary } from "../types.js";

type DesignChatOverlayProps = {
  messages: ChatMessage[];
  historyItems: ObjectSummary[];
  activeConversationId: number | null;
  activePane: "current" | "archive";
  busy: boolean;
  hasDesign: boolean;
  onSubmit: (prompt: string, imageFile: File | null) => Promise<void>;
  onNewSession: () => void;
  onChangePane: (pane: "current" | "archive") => void;
  onOpenConversation: (id: number) => void;
};

export function DesignChatOverlay({
  messages,
  historyItems,
  activeConversationId,
  activePane,
  busy,
  hasDesign,
  onSubmit,
  onNewSession,
  onChangePane,
  onOpenConversation,
}: DesignChatOverlayProps) {
  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt || busy) {
      return;
    }
    const nextImage = imageFile;
    setPrompt("");
    setImageFile(null);
    await onSubmit(nextPrompt, nextImage);
  }

  return (
    <form
      className={activePane === "archive" ? "design-chat design-chat-archive" : "design-chat design-chat-current"}
      onSubmit={handleSubmit}
    >
      <div className="design-chat-header">
        <div>
          <div className="eyebrow">AG2 CAD Chat</div>
          <h2>{hasDesign ? "Modify this session design" : "Start a design session"}</h2>
        </div>
        <div className="design-chat-actions">
          {historyItems.length > 0 ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => onChangePane(activePane === "archive" ? "current" : "archive")}
              disabled={busy}
            >
              {activePane === "archive" ? "Current chat" : "Past chats"}
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={onNewSession} disabled={busy}>
            New Session
          </button>
        </div>
      </div>

      {activePane === "archive" ? (
        <div className="chat-archive-shell">
          <div className="chat-archive-list">
            {historyItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="chat-archive-item"
                onClick={() => onOpenConversation(item.id)}
                disabled={busy}
              >
                <strong>{item.id === activeConversationId ? "Current session" : "Saved conversation"}</strong>
                <span>{new Date(item.created_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
          <p className="empty-state chat-archive-hint">
            Choose a saved conversation to reopen it in the live Studio chat and continue from there.
          </p>
        </div>
      ) : (
        <div className="chat-messages">
          {messages.length === 0 ? (
            <p className="empty-state">
              Describe the first design or attach a reference image. After that, each message modifies the one design in this session.
            </p>
          ) : (
            messages.map((message, index) => (
              <article key={`${message.role}-${index}-${message.content.slice(0, 24)}`} className={`chat-message ${message.role}`}>
                <span>{message.role === "user" ? "You" : "AG2"}</span>
                <p>{message.content}</p>
                {message.image_url ? (
                  <img
                    className="chat-message-image"
                    src={message.image_url}
                    alt={message.role === "user" ? "Attached reference" : "Generated chat attachment"}
                  />
                ) : null}
              </article>
            ))
          )}
        </div>
      )}

      <div className="chat-compose">
        <div className="chat-input-row">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder={
              hasDesign
                ? "Ask for a change to this design..."
                : "Describe the CAD model to create..."
            }
            disabled={busy}
          />
          <button type="submit" disabled={busy || !prompt.trim()}>
            {busy ? "Working..." : hasDesign ? "Modify" : "Create"}
          </button>
        </div>

        <div className="chat-attachment-row">
          <label className="chat-image-picker">
            <span>{imageFile ? "Change image" : "Attach image"}</span>
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {imageFile ? (
            <button type="button" className="ghost-button" onClick={() => setImageFile(null)} disabled={busy}>
              Remove image
            </button>
          ) : null}
        </div>

        {previewUrl ? (
          <div className="chat-image-preview">
            <img src={previewUrl} alt="Selected reference" />
            <small>{imageFile?.name}</small>
          </div>
        ) : null}
      </div>
    </form>
  );
}
