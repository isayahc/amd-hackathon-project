import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import occtimportjs from "occt-import-js";
import occtWasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";
import type { ShowroomPlacement } from "../types.js";

type ShowroomSceneProps = {
  placements: ShowroomPlacement[];
  draggedObjectId: number | null;
  selectedPlacementId: string | null;
  busy: boolean;
  onDropObject: (objectId: number, position: { x: number; z: number }) => void;
  onMoveObject: (placementId: string, position: { x: number; z: number }) => void;
  onSelectObject: (placementId: string | null) => void;
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

type PlacementRecord = {
  placementId: string;
  objectId: number;
  root: THREE.Group;
  meshes: THREE.Mesh[];
  materials: THREE.MeshStandardMaterial[];
  heightOffset: number;
  yOffset: number;
};

type DragState = {
  placementId: string;
  offsetX: number;
  offsetZ: number;
  moved: boolean;
};

const ROOM_LIMITS = {
  minX: -92,
  maxX: 92,
  minZ: -78,
  maxZ: 76,
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ShowroomScene({
  placements,
  draggedObjectId,
  selectedPlacementId,
  busy,
  onDropObject,
  onMoveObject,
  onSelectObject,
}: ShowroomSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const placementRecordsRef = useRef<PlacementRecord[]>([]);
  const floorPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragStateRef = useRef<DragState | null>(null);
  const busyRef = useRef(busy);
  const onMoveObjectRef = useRef(onMoveObject);
  const onSelectObjectRef = useRef(onSelectObject);
  const [status, setStatus] = useState("Drop a saved object into the room.");
  const [dropActive, setDropActive] = useState(false);

  const sceneMessage = useMemo(() => {
    if (busy) {
      return "Loading object data...";
    }
    if (draggedObjectId !== null) {
      return "Drop the model onto the floor to place it in the room.";
    }
    if (placements.length === 0) {
      return "The room is empty. Drag a model from the library into the scene.";
    }
    return status;
  }, [busy, draggedObjectId, placements.length, status]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    onMoveObjectRef.current = onMoveObject;
  }, [onMoveObject]);

  useEffect(() => {
    onSelectObjectRef.current = onSelectObject;
  }, [onSelectObject]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let animationFrame = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d8d2c9");
    scene.fog = new THREE.Fog("#d8d2c9", 380, 640);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
    camera.position.set(220, 190, 220);
    camera.lookAt(0, 38, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 36, 0);
    controls.minDistance = 150;
    controls.maxDistance = 420;
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 1.25));

    const hemiLight = new THREE.HemisphereLight(0xfffbeb, 0xbfa58a, 0.95);
    hemiLight.position.set(0, 180, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.15);
    sunLight.position.set(120, 220, 100);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 600;
    sunLight.shadow.camera.left = -220;
    sunLight.shadow.camera.right = 220;
    sunLight.shadow.camera.top = 220;
    sunLight.shadow.camera.bottom = -220;
    scene.add(sunLight);

    const roomGroup = new THREE.Group();
    scene.add(roomGroup);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 260, 8, 8),
      new THREE.MeshStandardMaterial({ color: "#d3c0a7", roughness: 0.95, metalness: 0.02 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    roomGroup.add(floor);

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 170),
      new THREE.MeshStandardMaterial({ color: "#efefec", roughness: 0.94, metalness: 0.02 }),
    );
    backWall.position.set(0, 85, -130);
    roomGroup.add(backWall);

    const leftWall = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 170),
      new THREE.MeshStandardMaterial({ color: "#f4f5f2", roughness: 0.94, metalness: 0.02 }),
    );
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-150, 85, 0);
    roomGroup.add(leftWall);

    const upperBandMaterial = new THREE.MeshStandardMaterial({
      color: "#c9c89c",
      roughness: 0.86,
      metalness: 0.01,
    });

    const backBand = new THREE.Mesh(new THREE.PlaneGeometry(300, 32), upperBandMaterial);
    backBand.position.set(0, 136, -129.7);
    roomGroup.add(backBand);

    const leftBand = new THREE.Mesh(new THREE.PlaneGeometry(260, 32), upperBandMaterial);
    leftBand.rotation.y = Math.PI / 2;
    leftBand.position.set(-149.7, 136, 0);
    roomGroup.add(leftBand);

    const trimMaterial = new THREE.MeshStandardMaterial({ color: "#dadde2", roughness: 0.85 });
    const backTrim = new THREE.Mesh(new THREE.BoxGeometry(302, 3, 3), trimMaterial);
    backTrim.position.set(0, 21, -128.5);
    roomGroup.add(backTrim);

    const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 262), trimMaterial);
    leftTrim.position.set(-148.5, 21, 0);
    roomGroup.add(leftTrim);

    const pedestal = new THREE.Mesh(
      new THREE.BoxGeometry(86, 32, 58),
      new THREE.MeshStandardMaterial({ color: "#d9dde4", roughness: 0.84, metalness: 0.04 }),
    );
    pedestal.position.set(0, 16, 18);
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    roomGroup.add(pedestal);

    function resizeRenderer() {
      if (!host) {
        return;
      }
      const width = host.clientWidth || 640;
      const height = host.clientHeight || 480;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function animate() {
      if (cancelled) {
        return;
      }
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    }

    function createRaycaster(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1),
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      return raycaster;
    }

    function handlePointerDown(event: PointerEvent) {
      if (busyRef.current) {
        return;
      }

      const raycaster = createRaycaster(event.clientX, event.clientY);
      if (!raycaster) {
        return;
      }

      const intersections = raycaster.intersectObjects(
        placementRecordsRef.current.flatMap((record) => record.meshes),
        false,
      );
      const hit = intersections.find((entry) => entry.object instanceof THREE.Mesh);
      if (!hit || !(hit.object instanceof THREE.Mesh)) {
        dragStateRef.current = null;
        return;
      }

      const record = placementRecordsRef.current.find((entry) => entry.meshes.includes(hit.object as THREE.Mesh));
      if (!record) {
        return;
      }

      const floorHit = new THREE.Vector3();
      const intersectsFloor = raycaster.ray.intersectPlane(floorPlaneRef.current, floorHit);
      dragStateRef.current = {
        placementId: record.placementId,
        offsetX: intersectsFloor ? record.root.position.x - floorHit.x : 0,
        offsetZ: intersectsFloor ? record.root.position.z - floorHit.z : 0,
        moved: false,
      };
      controls.enabled = false;
      onSelectObjectRef.current(record.placementId);
    }

    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current;
      if (!dragState || busyRef.current) {
        return;
      }

      const raycaster = createRaycaster(event.clientX, event.clientY);
      if (!raycaster) {
        return;
      }

      const floorHit = new THREE.Vector3();
      const intersectsFloor = raycaster.ray.intersectPlane(floorPlaneRef.current, floorHit);
      if (!intersectsFloor) {
        return;
      }

      const record = placementRecordsRef.current.find((entry) => entry.placementId === dragState.placementId);
      if (!record) {
        return;
      }

      record.root.position.x = clamp(floorHit.x + dragState.offsetX, ROOM_LIMITS.minX, ROOM_LIMITS.maxX);
      record.root.position.z = clamp(floorHit.z + dragState.offsetZ, ROOM_LIMITS.minZ, ROOM_LIMITS.maxZ);
      record.root.position.y = record.heightOffset + record.yOffset;
      dragState.moved = true;
      setStatus("Dragging selected model...");
    }

    function handlePointerUp(event: PointerEvent) {
      const dragState = dragStateRef.current;
      if (dragState) {
        const record = placementRecordsRef.current.find((entry) => entry.placementId === dragState.placementId);
        dragStateRef.current = null;
        controls.enabled = true;
        if (record) {
          onSelectObjectRef.current(record.placementId);
          if (dragState.moved) {
            onMoveObjectRef.current(record.placementId, {
              x: record.root.position.x,
              z: record.root.position.z,
            });
            setStatus("Model moved. Drag another model or switch versions from the side panel.");
            return;
          }
        }
      }

      const raycaster = createRaycaster(event.clientX, event.clientY);
      if (!raycaster) {
        return;
      }

      const intersections = raycaster.intersectObjects(
        placementRecordsRef.current.flatMap((record) => record.meshes),
        false,
      );
      const hit = intersections.find((entry) => entry.object instanceof THREE.Mesh);
      if (!hit || !(hit.object instanceof THREE.Mesh)) {
        onSelectObjectRef.current(null);
        return;
      }

      const record = placementRecordsRef.current.find((entry) => entry.meshes.includes(hit.object as THREE.Mesh));
      onSelectObjectRef.current(record?.placementId ?? null);
    }

    const resizeObserver = new ResizeObserver(() => {
      resizeRenderer();
    });
    resizeObserver.observe(host);

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    resizeRenderer();
    animate();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.dispose();
      placementRecordsRef.current.forEach((record) => disposePlacementRecord(record));
      placementRecordsRef.current = [];
      roomGroup.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      });
      renderer.dispose();
      host.innerHTML = "";
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncPlacements() {
      const scene = sceneRef.current;
      if (!scene) {
        return;
      }

      placementRecordsRef.current.forEach((record) => {
        scene.remove(record.root);
        disposePlacementRecord(record);
      });
      placementRecordsRef.current = [];

      if (placements.length === 0) {
        setStatus("The room is empty. Drag a model into the scene.");
        return;
      }

      setStatus("Loading dropped models...");

      try {
        const occt = await getOcctModule();
        const nextRecords: PlacementRecord[] = [];

        for (const placement of placements) {
          const record = await loadPlacementRecord(occt, placement);
          if (cancelled) {
            disposePlacementRecord(record);
            return;
          }
          nextRecords.push(record);
          scene.add(record.root);
        }

        placementRecordsRef.current = nextRecords;
        setStatus("Drag models to move them or click one to manage its version.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load dropped model.");
      }
    }

    void syncPlacements();

    return () => {
      cancelled = true;
    };
  }, [placements]);

  useEffect(() => {
    placementRecordsRef.current.forEach((record) => {
      const selected = record.placementId === selectedPlacementId;
      record.materials.forEach((material) => {
        material.emissive.set(selected ? "#f59e0b" : "#000000");
        material.emissiveIntensity = selected ? 0.16 : 0;
      });
    });
  }, [selectedPlacementId]);

  function getFloorDropPosition(clientX: number, clientY: number) {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) {
      return null;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const intersection = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(floorPlaneRef.current, intersection);
    if (!hit) {
      return null;
    }

    return {
      x: clamp(intersection.x, ROOM_LIMITS.minX, ROOM_LIMITS.maxX),
      z: clamp(intersection.z, ROOM_LIMITS.minZ, ROOM_LIMITS.maxZ),
    };
  }

  return (
    <div
      ref={hostRef}
      className={["showroom-scene-viewer", dropActive ? "drop-active" : ""].filter(Boolean).join(" ")}
      onDragOver={(event) => {
        event.preventDefault();
        if (busy) {
          return;
        }
        event.dataTransfer.dropEffect = "move";
        setDropActive(true);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        setDropActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        if (busy) {
          return;
        }

        const payload = event.dataTransfer.getData("text/plain");
        const objectId = Number(payload);
        const position = getFloorDropPosition(event.clientX, event.clientY);
        if (!Number.isNaN(objectId) && position) {
          onDropObject(objectId, position);
        }
      }}
    >
      <div className="showroom-scene-hud">
        <span className="eyebrow">Empty Room</span>
        <strong>Drag models onto the floor</strong>
        <p>{sceneMessage}</p>
      </div>
    </div>
  );
}

async function loadPlacementRecord(
  occt: OcctModule,
  placement: ShowroomPlacement,
): Promise<PlacementRecord> {
  const response = await fetch(placement.object.step_file_url);
  if (!response.ok) {
    throw new Error(`Failed to load STEP file (${response.status}).`);
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

  const contentGroup = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];

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
      metalness: 0.14,
      roughness: 0.62,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    contentGroup.add(mesh);
    meshes.push(mesh);
    materials.push(material);
  });

  const box = new THREE.Box3().setFromObject(contentGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  contentGroup.position.sub(center);
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const scale = 56 / maxDimension;
  contentGroup.scale.setScalar(scale);

  const heightOffset = size.y * scale * 0.5;
  const root = new THREE.Group();
  root.add(contentGroup);
  root.position.set(
    clamp(placement.x, ROOM_LIMITS.minX, ROOM_LIMITS.maxX),
    heightOffset + placement.y,
    clamp(placement.z, ROOM_LIMITS.minZ, ROOM_LIMITS.maxZ),
  );

  return {
    placementId: placement.placement_id,
    objectId: placement.object.id,
    root,
    meshes,
    materials,
    heightOffset,
    yOffset: placement.y,
  };
}

function disposePlacementRecord(record: PlacementRecord) {
  record.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose());
    } else if (mesh.material) {
      mesh.material.dispose();
    }
  });
}