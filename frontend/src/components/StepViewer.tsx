import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import occtimportjs from "occt-import-js";
import occtWasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";
import { ComponentTree } from "./ComponentTree.js";
import type { AnimationPlan, AnimationTrack, ComponentNode } from "../types.js";

type StepViewerProps = {
  stepFileUrl: string;
  selectedComponent: ComponentNode | null;
  components: ComponentNode[];
  animationPlan: AnimationPlan | null;
  activeNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  chatOverlay?: ReactNode;
  versionOverlay?: ReactNode;
};

type OcctNode = {
  name: string;
  meshes: number[];
  children: OcctNode[];
};

type OcctMesh = {
  name?: string;
  color?: [number, number, number];
  attributes: {
    position: { array: number[] };
    normal?: { array: number[] };
  };
  index: { array: number[] };
};

type OcctResult = {
  success: boolean;
  root: OcctNode;
  meshes: OcctMesh[];
};

type OcctModule = {
  ReadStepFile: (content: Uint8Array, params: Record<string, unknown> | null) => OcctResult;
};

type MeshRecord = {
  mesh: THREE.Mesh;
  baseColor: THREE.Color;
  searchText: string;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  baseScale: THREE.Vector3;
};

type TransformSnapshot = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
};

let occtModulePromise: Promise<OcctModule> | null = null;

async function getOcctModule(): Promise<OcctModule> {
  if (!occtModulePromise) {
    occtModulePromise = occtimportjs({
      locateFile(path: string) {
        if (path.endsWith(".wasm")) {
          return occtWasmUrl;
        }
        return path;
      },
    }) as Promise<OcctModule>;
  }
  return occtModulePromise;
}

export function StepViewer({
  stepFileUrl,
  selectedComponent,
  components,
  animationPlan,
  activeNodeId,
  onSelectNode,
  chatOverlay,
  versionOverlay,
}: StepViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const meshRecordsRef = useRef<MeshRecord[]>([]);
  const contentGroupRef = useRef<THREE.Group | null>(null);
  const baseGroupTransformRef = useRef<TransformSnapshot | null>(null);
  const componentsRef = useRef<ComponentNode[]>(components);
  const animationPlanRef = useRef<AnimationPlan | null>(animationPlan);
  const animationStartedAtRef = useRef<number | null>(animationPlan ? performance.now() / 1000 : null);
  const clickStartRef = useRef<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState("Loading STEP preview...");

  useEffect(() => {
    componentsRef.current = components;
  }, [components]);

  useEffect(() => {
    animationPlanRef.current = animationPlan;
    animationStartedAtRef.current = animationPlan ? performance.now() / 1000 : null;
  }, [animationPlan]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let animationFrame = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#08111f");
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(140, 120, 140);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x0f172a, 1.4);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(140, 160, 120);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.4);
    fillLight.position.set(-90, 40, -80);
    scene.add(fillLight);

    const contentGroup = new THREE.Group();
    scene.add(contentGroup);
    contentGroupRef.current = contentGroup;

    const grid = new THREE.GridHelper(220, 12, 0x1d4ed8, 0x334155);
    grid.position.y = -40;
    scene.add(grid);

    function resizeRenderer() {
      if (!host) {
        return;
      }
      const width = host.clientWidth || 640;
      const height = host.clientHeight || 360;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    async function loadStep() {
      try {
        setStatus("Loading STEP preview...");
        resizeRenderer();

        const [occt, response] = await Promise.all([getOcctModule(), fetch(stepFileUrl)]);
        if (!response.ok) {
          throw new Error(`Failed to load STEP file (${response.status})`);
        }

        const fileBuffer = new Uint8Array(await response.arrayBuffer());
        const result = occt.ReadStepFile(fileBuffer, {
          linearUnit: "millimeter",
          linearDeflectionType: "bounding_box_ratio",
          linearDeflection: 0.002,
          angularDeflection: 0.3,
        });

        if (!result.success || result.meshes.length === 0) {
          throw new Error("STEP importer returned no meshes.");
        }

        meshRecordsRef.current = addMeshesToGroup(result, contentGroup);
        applySelectionHighlight(meshRecordsRef.current, selectedComponent, components);
        frameModel(contentGroup, camera, controls, grid);
        baseGroupTransformRef.current = snapshotTransform(contentGroup);
        setStatus("");
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Failed to render STEP file.");
        }
      }
    }

    function animate() {
      if (cancelled) {
        return;
      }
      applyAnimationFrame(
        animationPlanRef.current,
        meshRecordsRef.current,
        contentGroupRef.current,
        baseGroupTransformRef.current,
        componentsRef.current,
        animationStartedAtRef.current,
      );
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    }

    function handlePointerDown(event: PointerEvent) {
      clickStartRef.current = { x: event.clientX, y: event.clientY };
    }

    function handlePointerUp(event: PointerEvent) {
      if (!host || meshRecordsRef.current.length === 0) {
        return;
      }

      const clickStart = clickStartRef.current;
      clickStartRef.current = null;
      if (!clickStart) {
        return;
      }

      const travel = Math.hypot(event.clientX - clickStart.x, event.clientY - clickStart.y);
      if (travel > 6) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);

      const intersections = raycaster.intersectObjects(contentGroup.children, false);
      const intersection = intersections.find((item) => item.object instanceof THREE.Mesh);
      if (!intersection || !(intersection.object instanceof THREE.Mesh)) {
        return;
      }

      const meshIndex = meshRecordsRef.current.findIndex((record) => record.mesh === intersection.object);
      if (meshIndex < 0) {
        return;
      }

      const component = getComponentForMeshIndex(meshIndex, meshRecordsRef.current, componentsRef.current);
      if (component) {
        onSelectNode(component.node_id);
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      resizeRenderer();
    });
    resizeObserver.observe(host);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    void loadStep();
    animate();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.dispose();
      scene.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material: THREE.Material) => material.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      });
      renderer.dispose();
      meshRecordsRef.current = [];
      contentGroupRef.current = null;
      baseGroupTransformRef.current = null;
      host.innerHTML = "";
    };
  }, [stepFileUrl, onSelectNode]);

  useEffect(() => {
    applySelectionHighlight(meshRecordsRef.current, selectedComponent, components);
  }, [selectedComponent, components]);

  return (
    <section className="panel viewer-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">STEP Preview</div>
          <h2>Interactive renderer</h2>
        </div>
      </div>
      <div className="viewer-shell">
        <div ref={hostRef} className="step-viewer-canvas" />
        <div className="viewer-overlay viewer-overlay-tree">
          <ComponentTree
            components={components}
            activeNodeId={activeNodeId}
            onSelect={onSelectNode}
            overlay
          />
        </div>
        {versionOverlay || chatOverlay ? (
          <div className="viewer-overlay viewer-overlay-right-rail">
            {versionOverlay ? <div className="viewer-overlay-versions">{versionOverlay}</div> : null}
            {chatOverlay ? <div className="viewer-overlay-chat">{chatOverlay}</div> : null}
          </div>
        ) : null}
        {status ? <div className="viewer-status">{status}</div> : null}
      </div>
    </section>
  );
}

function addMeshesToGroup(result: OcctResult, group: THREE.Group): MeshRecord[] {
  for (const child of [...group.children]) {
    group.remove(child);
  }

  const records: MeshRecord[] = [];

  result.meshes.forEach((meshData) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3),
    );

    if (meshData.attributes.normal?.array?.length) {
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3),
      );
    } else {
      geometry.computeVertexNormals();
    }

    geometry.setIndex(meshData.index.array);

    const color = meshData.color
      ? new THREE.Color(meshData.color[0], meshData.color[1], meshData.color[2])
      : new THREE.Color("#cbd5e1");

    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.12,
      roughness: 0.58,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = meshData.name || "STEP Mesh";
    group.add(mesh);

    records.push({
      mesh,
      baseColor: color.clone(),
      searchText: normalizeSearchText([
        meshData.name,
        mesh.name,
      ]),
      basePosition: mesh.position.clone(),
      baseRotation: mesh.rotation.clone(),
      baseScale: mesh.scale.clone(),
    });
  });

  return records;
}

function applySelectionHighlight(
  meshRecords: MeshRecord[],
  selectedComponent: ComponentNode | null,
  components: ComponentNode[],
) {
  const highlightIndices = getComponentMeshIndices(meshRecords, selectedComponent, components);

  meshRecords.forEach((record, index) => {
    const material = record.mesh.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) {
      return;
    }

    if (highlightIndices.has(index)) {
      material.color.set(selectedComponent?.color_hint ?? "#fbbf24");
      material.emissive.set("#f59e0b");
      material.emissiveIntensity = 0.28;
      material.opacity = 1;
      material.transparent = false;
    } else if (selectedComponent) {
      material.color.copy(record.baseColor);
      material.emissive.set("#000000");
      material.emissiveIntensity = 0;
      material.opacity = 0.28;
      material.transparent = true;
    } else {
      material.color.copy(record.baseColor);
      material.emissive.set("#000000");
      material.emissiveIntensity = 0;
      material.opacity = 1;
      material.transparent = false;
    }

    material.needsUpdate = true;
  });
}

function getComponentMeshIndices(
  meshRecords: MeshRecord[],
  selectedComponent: ComponentNode | null,
  components: ComponentNode[],
): Set<number> {
  if (!selectedComponent) {
    return new Set();
  }

  if (selectedComponent.node_id === "root") {
    return new Set(meshRecords.map((_, index) => index));
  }

  const selectedTerms = [
    selectedComponent.name,
    selectedComponent.node_id,
    selectedComponent.kind,
    typeof selectedComponent.metadata.operation === "string"
      ? selectedComponent.metadata.operation
      : undefined,
  ]
    .map((value) => normalizeToken(value))
    .filter((value): value is string => Boolean(value));

  const exactMatches = new Set<number>();
  meshRecords.forEach((record, index) => {
    if (selectedTerms.some((term) => term && record.searchText.includes(term))) {
      exactMatches.add(index);
    }
  });

  if (exactMatches.size > 0) {
    return exactMatches;
  }

  const nonRootComponents = components.filter((component) => component.node_id !== "root");
  const selectedComponentIndex = nonRootComponents.findIndex(
    (component) => component.node_id === selectedComponent.node_id,
  );
  if (selectedComponentIndex >= 0 && selectedComponentIndex < meshRecords.length) {
    return new Set([selectedComponentIndex]);
  }

  return new Set();
}

function getComponentForMeshIndex(
  meshIndex: number,
  meshRecords: MeshRecord[],
  components: ComponentNode[],
): ComponentNode | null {
  const record = meshRecords[meshIndex];
  if (!record) {
    return null;
  }

  const nonRootComponents = components.filter((component) => component.node_id !== "root");
  let bestMatch: ComponentNode | null = null;
  let bestScore = 0;

  nonRootComponents.forEach((component) => {
    const score = getComponentMatchScore(record, component);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = component;
    }
  });

  if (bestMatch) {
    return bestMatch;
  }

  if (meshIndex >= 0 && meshIndex < nonRootComponents.length) {
    return nonRootComponents[meshIndex];
  }

  return null;
}

function getComponentMatchScore(record: MeshRecord, component: ComponentNode): number {
  const searchTerms = [
    component.name,
    component.node_id,
    component.kind,
    typeof component.metadata.operation === "string" ? component.metadata.operation : undefined,
  ]
    .map((value) => normalizeToken(value))
    .filter((value): value is string => Boolean(value));

  let score = 0;
  searchTerms.forEach((term) => {
    if (record.searchText.includes(term)) {
      score += term.length;
    }
  });

  return score;
}

function applyAnimationFrame(
  animationPlan: AnimationPlan | null,
  meshRecords: MeshRecord[],
  contentGroup: THREE.Group | null,
  baseGroupTransform: TransformSnapshot | null,
  components: ComponentNode[],
  animationStartedAt: number | null,
) {
  resetAnimationTargets(meshRecords, contentGroup, baseGroupTransform);

  if (!animationPlan || !contentGroup || !baseGroupTransform || animationStartedAt === null) {
    return;
  }

  const now = performance.now() / 1000;
  const duration = Math.max(animationPlan.duration, 0.001);
  const elapsed = Math.max(now - animationStartedAt, 0);
  const time = animationPlan.loop ? elapsed % duration : Math.min(elapsed, duration);

  for (const track of animationPlan.tracks) {
    const transform = sampleTrack(track, time);
    if (!transform) {
      continue;
    }

    if (track.node_id === "root") {
      contentGroup.position.set(
        baseGroupTransform.position.x + transform.position[0],
        baseGroupTransform.position.y + transform.position[1],
        baseGroupTransform.position.z + transform.position[2],
      );
      contentGroup.rotation.set(
        baseGroupTransform.rotation.x + transform.rotation[0],
        baseGroupTransform.rotation.y + transform.rotation[1],
        baseGroupTransform.rotation.z + transform.rotation[2],
      );
      contentGroup.scale.set(
        baseGroupTransform.scale.x * transform.scale[0],
        baseGroupTransform.scale.y * transform.scale[1],
        baseGroupTransform.scale.z * transform.scale[2],
      );
      continue;
    }

    const component = components.find((item) => item.node_id === track.node_id) ?? null;
    const meshIndices = getComponentMeshIndices(meshRecords, component, components);
    meshIndices.forEach((index) => {
      const record = meshRecords[index];
      record.mesh.position.set(
        record.basePosition.x + transform.position[0],
        record.basePosition.y + transform.position[1],
        record.basePosition.z + transform.position[2],
      );
      record.mesh.rotation.set(
        record.baseRotation.x + transform.rotation[0],
        record.baseRotation.y + transform.rotation[1],
        record.baseRotation.z + transform.rotation[2],
      );
      record.mesh.scale.set(
        record.baseScale.x * transform.scale[0],
        record.baseScale.y * transform.scale[1],
        record.baseScale.z * transform.scale[2],
      );
    });
  }
}

function resetAnimationTargets(
  meshRecords: MeshRecord[],
  contentGroup: THREE.Group | null,
  baseGroupTransform: TransformSnapshot | null,
) {
  if (contentGroup && baseGroupTransform) {
    contentGroup.position.copy(baseGroupTransform.position);
    contentGroup.rotation.copy(baseGroupTransform.rotation);
    contentGroup.scale.copy(baseGroupTransform.scale);
  }

  meshRecords.forEach((record) => {
    record.mesh.position.copy(record.basePosition);
    record.mesh.rotation.copy(record.baseRotation);
    record.mesh.scale.copy(record.baseScale);
  });
}

function sampleTrack(track: AnimationTrack, time: number) {
  const keyframes = track.keyframes;
  if (keyframes.length === 0) {
    return null;
  }

  if (time <= keyframes[0].t) {
    return keyframes[0];
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const start = keyframes[index];
    const end = keyframes[index + 1];
    if (time <= end.t) {
      const span = Math.max(end.t - start.t, 0.0001);
      const alpha = (time - start.t) / span;
      return {
        position: lerpVector(start.position, end.position, alpha),
        rotation: lerpVector(start.rotation, end.rotation, alpha),
        scale: lerpVector(start.scale, end.scale, alpha),
      };
    }
  }

  return keyframes[keyframes.length - 1];
}

function lerpVector(
  start: [number, number, number],
  end: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    THREE.MathUtils.lerp(start[0], end[0], alpha),
    THREE.MathUtils.lerp(start[1], end[1], alpha),
    THREE.MathUtils.lerp(start[2], end[2], alpha),
  ];
}

function normalizeSearchText(values: Array<string | undefined>) {
  return values.map((value) => normalizeToken(value)).filter(Boolean).join(" ");
}

function normalizeToken(value: string | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function frameModel(
  group: THREE.Group,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  grid: THREE.GridHelper,
) {
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);

  group.position.sub(center);
  grid.position.y = -size.y * 0.5 - Math.max(size.y * 0.08, 4);

  const distance = maxDimension * 1.8;
  camera.position.set(distance, distance * 0.9, distance);
  camera.near = Math.max(maxDimension / 1000, 0.1);
  camera.far = Math.max(maxDimension * 20, 1000);
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  controls.update();
}

function snapshotTransform(object: THREE.Object3D): TransformSnapshot {
  return {
    position: object.position.clone(),
    rotation: object.rotation.clone(),
    scale: object.scale.clone(),
  };
}
