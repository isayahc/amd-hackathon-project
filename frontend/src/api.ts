import type { AnimationPlan, GeneratedObject, ObjectSummary } from "./types.js";

const JSON_HEADERS = {
  Accept: "application/json",
};

export async function listObjects(): Promise<ObjectSummary[]> {
  const response = await fetch("/api/objects", { headers: JSON_HEADERS });
  if (!response.ok) {
    throw new Error("Failed to fetch object history.");
  }
  return response.json();
}

export async function getObject(id: number): Promise<GeneratedObject> {
  const response = await fetch(`/api/objects/${id}`, { headers: JSON_HEADERS });
  if (!response.ok) {
    throw new Error("Failed to fetch object details.");
  }
  return response.json();
}

export async function generateObject(prompt: string, imageFile: File | null): Promise<GeneratedObject> {
  const formData = new FormData();
  formData.append("prompt", prompt);
  if (imageFile) {
    formData.append("image", imageFile);
  }

  const response = await fetch("/api/generate", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Generation failed.");
  }
  return response.json();
}

export async function generateAnimation(id: number, prompt: string): Promise<AnimationPlan> {
  const response = await fetch(`/api/objects/${id}/animation`, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Animation generation failed.");
  }
  return response.json();
}
