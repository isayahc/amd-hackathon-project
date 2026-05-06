import { FormEvent, useState } from "react";

type PromptComposerProps = {
  busy: boolean;
  onSubmit: (prompt: string, imageFile: File | null) => Promise<void>;
};

export function PromptComposer({ busy, onSubmit }: PromptComposerProps) {
  const [prompt, setPrompt] = useState(
    "Create a compact mounting bracket with a rectangular base, a raised boss, and a center hole.",
  );
  const [imageFile, setImageFile] = useState<File | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }
    await onSubmit(prompt.trim(), imageFile);
  }

  return (
    <form className="panel composer" onSubmit={handleSubmit}>
      <div className="eyebrow">AG2 CAD Generator</div>
      <h1>Prompt or upload a reference image to generate a STEP-ready CadQuery model.</h1>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={6}
        placeholder="Describe the part, dimensions, and main features."
      />
      <label className="upload-field">
        <span>Reference image</span>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
        />
        <strong>{imageFile ? imageFile.name : "No file selected"}</strong>
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Generating..." : "Generate Object"}
      </button>
    </form>
  );
}
