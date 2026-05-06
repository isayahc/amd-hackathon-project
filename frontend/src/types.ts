export type ComponentNode = {
  node_id: string;
  name: string;
  kind: string;
  parent_node_id: string | null;
  depth: number;
  order_index: number;
  color_hint: string | null;
  metadata: Record<string, unknown>;
};

export type ObjectSummary = {
  id: number;
  prompt: string;
  created_at: string;
  step_file_url: string;
  component_count: number;
};

export type PreviewPayload = {
  bbox?: { x: number; y: number; z: number };
  volume?: number | null;
  area?: number | null;
  solidCount?: number;
  summary?: string;
  usedFallback?: boolean;
  tree?: Record<string, unknown>;
};

export type GeneratedObject = {
  id: number;
  prompt: string;
  cadquery_code: string;
  step_file_url: string;
  preview: PreviewPayload;
  components: ComponentNode[];
  created_at: string;
};

export type AnimationKeyframe = {
  t: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type AnimationTrack = {
  node_id: string;
  label: string;
  keyframes: AnimationKeyframe[];
};

export type AnimationPlan = {
  title: string;
  summary: string;
  duration: number;
  loop: boolean;
  tracks: AnimationTrack[];
  used_fallback: boolean;
};
