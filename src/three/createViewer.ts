import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { installNativeImageShim, withEmbeddedTextures } from './nativeImage';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DoorKey, StudioSnapshot } from '../sim/types';
import { paintById, type PaintId } from './paints';
import type { PointerSurface } from './pointerSurface';

const DOOR_NODES: Record<DoorKey | 'trunk', string> = {
  fl: 'ANCHOR_Door_FrontLeft_7',
  fr: 'ANCHOR_Door_FrontRight_6',
  rl: 'ANCHOR_Door_RearLeft_5',
  rr: 'ANCHOR_Door_RearRight_4',
  trunk: 'ANCHOR_Boot_8',
};
const DOOR_ANGLES: Record<DoorKey | 'trunk', number> = {
  fl: Math.PI / 3,
  fr: -Math.PI / 3,
  rl: Math.PI / 3,
  rr: -Math.PI / 3,
  trunk: -0.8726646,
};
export const CAMERA_POSITIONS = {
  iso: [6.1, 3.9, -7.2],
  front: [0, 2.25, -8.5],
  rear: [0, 2.25, 8.5],
  side: [8.5, 2.6, 0],
  top: [0, 10.5, -0.001],
  adas: [3.1, 4.7, -9.4],
} as const;
export type CameraName = keyof typeof CAMERA_POSITIONS;

const FONT: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  '.': [0, 0, 0, 0, 0, 12, 12],
  '%': [25, 26, 2, 4, 8, 11, 19],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '/': [1, 1, 2, 4, 8, 16, 16],
};

function radialTexture(size: number, inner: number, outer: number, stops: [number, number, number, number, number][]) {
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dist = Math.hypot(x - center, y - center);
      const t = Math.min(1, Math.max(0, (dist - inner) / (outer - inner)));
      let lower = stops[0];
      let upper = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i += 1) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) {
          lower = stops[i];
          upper = stops[i + 1];
          break;
        }
      }
      const span = upper[0] - lower[0] || 1;
      const mix = (t - lower[0]) / span;
      const i = (y * size + x) * 4;
      data[i] = Math.round(lower[1] + (upper[1] - lower[1]) * mix);
      data[i + 1] = Math.round(lower[2] + (upper[2] - lower[2]) * mix);
      data[i + 2] = Math.round(lower[3] + (upper[3] - lower[3]) * mix);
      data[i + 3] = Math.round((lower[4] + (upper[4] - lower[4]) * mix) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function paintLabel(data: Uint8Array, text: string, color: [number, number, number]) {
  const width = 512;
  const height = 128;
  data.fill(0);
  for (let y = 6; y < height - 6; y += 1) {
    for (let x = 6; x < width - 6; x += 1) {
      const border = x < 10 || y < 10 || x > width - 11 || y > height - 11;
      const i = (y * width + x) * 4;
      data[i] = border ? 173 : 255;
      data[i + 1] = border ? 195 : 255;
      data[i + 2] = border ? 219 : 255;
      data[i + 3] = border ? 210 : 235;
    }
  }
  const upper = text.toUpperCase();
  let scale = 4;
  const advanceOf = (value: number) => 5 * value + value;
  while (upper.length * advanceOf(scale) > width - 36 && scale > 2) scale -= 1;
  const advance = advanceOf(scale);
  const startX = Math.max(12, Math.floor((width - upper.length * advance) / 2));
  const startY = Math.floor((height - 7 * scale) / 2);
  for (let c = 0; c < upper.length; c += 1) {
    const rows = FONT[upper[c]] ?? FONT[' '];
    for (let gy = 0; gy < 7; gy += 1) {
      const bits = rows[gy];
      for (let gx = 0; gx < 5; gx += 1) {
        if (((bits >> (4 - gx)) & 1) === 0) continue;
        for (let py = 0; py < scale; py += 1) {
          for (let px = 0; px < scale; px += 1) {
            const x = startX + c * advance + gx * scale + px;
            const y = startY + gy * scale + py;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const i = (y * width + x) * 4;
            data[i] = color[0];
            data[i + 1] = color[1];
            data[i + 2] = color[2];
            data[i + 3] = 255;
          }
        }
      }
    }
  }
}

function makeLabel(text: string, color: [number, number, number]) {
  const canvas = new Uint8Array(512 * 128 * 4);
  paintLabel(canvas, text, color);
  const texture = new THREE.DataTexture(canvas, 512, 128, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const label = new THREE.Sprite(material);
  label.scale.set(2, 0.5, 1);
  label.userData = { canvas, texture, last: null as string | null, color };
  return label;
}

function setLabel(label: THREE.Sprite, text: string) {
  const user = label.userData as { canvas: Uint8Array; texture: THREE.DataTexture; last: string | null; color: [number, number, number] };
  if (user.last === text) return;
  user.last = text;
  paintLabel(user.canvas, text, user.color);
  user.texture.needsUpdate = true;
}

export interface ViewerHandle {
  frame: (dt: number, snap: StudioSnapshot) => void;
  setCamera: (name: CameraName) => void;
  setPaint: (id: PaintId) => void;
  zoomBy: (factor: number) => void;
  setAppearance: (mode: 'light' | 'dark') => void;
  resize: (width: number, height: number) => void;
  tap: (x: number, y: number) => void;
  dispose: () => void;
}

export async function createVehicleViewer(options: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  surface: PointerSurface;
  phone: boolean;
  onProgress: (fraction: number) => void;
  onDoor: (door: DoorKey) => void;
  onTrunk: () => void;
  onTire: (tire: DoorKey) => void;
}): Promise<ViewerHandle> {
  installNativeImageShim();
  const { scene, camera, surface, phone } = options;
  scene.background = new THREE.Color(0xf2f5fa);
  let appearance: 'light' | 'dark' = 'light';
  const target = new THREE.Vector3(0, 0.85, 0);
  camera.position.set(...CAMERA_POSITIONS.iso);
  const controls = new OrbitControls(camera, surface.element as unknown as HTMLElement);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 3.5;
  controls.maxDistance = 18;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minPolarAngle = 0.05;
  controls.enablePan = false;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb1becb, 2.5));
  const key = new THREE.DirectionalLight(0xffffff, 3.1);
  key.position.set(-3.5, 8, -5);
  if (!phone) {
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 22;
    key.shadow.bias = -0.00025;
  }
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdcecff, 1.35);
  fill.position.set(3.2, 5.5, 5);
  scene.add(fill);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 110),
    new THREE.MeshStandardMaterial({ color: 0xf3f6fa, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.039;
  floor.receiveShadow = !phone;
  scene.add(floor);
  const grid = new THREE.GridHelper(12, 24, 0xd9e3ed, 0xe2eaf2);
  grid.position.y = -0.025;
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMaterials.forEach((material) => {
    material.transparent = true;
    material.opacity = 0.43;
    material.depthWrite = false;
  });
  scene.add(grid);
  const shadowMap = radialTexture(256, 14, 125, [
    [0, 48, 65, 85, 0.22],
    [0.5, 45, 63, 85, 0.13],
    [1, 45, 63, 85, 0],
  ]);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 6.1),
    new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, opacity: 0.8 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.021;
  scene.add(shadow);

  options.onProgress(0.05);
  const asset = Asset.fromModule(require('../../assets/models/polestar_3_2027.glb'));
  await asset.downloadAsync();
  options.onProgress(0.35);
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('Vehicle model URI is missing');
  const buffer = await readModelBytes(uri);
  options.onProgress(0.7);
  const gltf = await withEmbeddedTextures(
    () =>
      new Promise<THREE.Group>((resolve, reject) => {
        new GLTFLoader().parse(
          buffer,
          '',
          (parsed) => resolve(parsed.scene),
          (error) => reject(error instanceof Error ? error : new Error('GLB parse failed')),
        );
      }),
  );
  const vehicle = gltf;
  scene.add(vehicle);
  vehicle.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(vehicle);
  const center = bbox.getCenter(new THREE.Vector3());
  const width = bbox.max.x - bbox.min.x;
  const height = bbox.max.y - bbox.min.y;
  const length = bbox.max.z - bbox.min.z;
  if (Math.abs(width - 2.1) > 0.8 || Math.abs(length - 4.88) > 2) {
    console.warn('Loaded model has unexpected dimensions', { width, height, length });
  }
  camera.position.set(
    CAMERA_POSITIONS.iso[0] + center.x,
    CAMERA_POSITIONS.iso[1] + center.y - 0.82,
    CAMERA_POSITIONS.iso[2] + center.z,
  );
  controls.target.set(center.x, center.y - 0.04, center.z);
  controls.update();

  const anchors: Partial<Record<DoorKey | 'trunk', THREE.Object3D>> = {};
  const closedQuat: Partial<Record<DoorKey | 'trunk', THREE.Quaternion>> = {};
  const openQuat: Partial<Record<DoorKey | 'trunk', THREE.Quaternion>> = {};
  for (const [key, nodeName] of Object.entries(DOOR_NODES) as [DoorKey | 'trunk', string][]) {
    const anchor = vehicle.getObjectByName(nodeName);
    if (!anchor) {
      console.warn('Missing model animation anchor', nodeName);
      continue;
    }
    anchors[key] = anchor;
    closedQuat[key] = anchor.quaternion.clone();
    const relative = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(key === 'trunk' ? 1 : 0, key === 'trunk' ? 0 : 1, 0), DOOR_ANGLES[key]);
    openQuat[key] = closedQuat[key].clone().multiply(relative);
  }
  const wheelKeys: Record<string, DoorKey> = {};
  const wheels: { anchor: THREE.Object3D; key: DoorKey }[] = [];
  vehicle.traverse((object) => {
    if (/^ANCHOR_Wheel\d+_/.test(object.name)) {
      const wheelCenter = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
      const key = `${wheelCenter.z < 0 ? 'f' : 'r'}${wheelCenter.x > 0 ? 'l' : 'r'}` as DoorKey;
      wheelKeys[object.name] = key;
      wheels.push({ anchor: object, key });
    }
  });
  const rearLenses: THREE.MeshStandardMaterial[] = [];
  const frontLenses: THREE.MeshStandardMaterial[] = [];
  const bodyPaint: THREE.MeshStandardMaterial[] = [];
  const seenPaint = new Set<THREE.Material>();
  vehicle.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material || seenPaint.has(material)) continue;
      if ((material.name || '').toLowerCase() !== 'magnesium') continue;
      seenPaint.add(material);
      bodyPaint.push(material as THREE.MeshStandardMaterial);
    }
    const source = materials[0];
    if (!source) return;
    let path = '';
    for (let parent: THREE.Object3D | null = mesh; parent && path.length < 450; parent = parent.parent) path += ` ${parent.name || ''}`;
    const materialName = (source.name || '').toLowerCase();
    const meshCenter = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    const isRear = meshCenter.z > 1.62;
    const isFront = meshCenter.z < -1.6;
    const headName = /headlight|smallbeams|led_headlight/i.test(`${path} ${materialName}`);
    const redMaterial = /redlight|material_153/.test(materialName);
    const rearLens = isRear && (redMaterial || (/taillight/i.test(path) && /glass|led|reflect/i.test(path)));
    const frontLens = isFront && headName && /glass|led|reflect/i.test(path);
    if (!rearLens && !frontLens) return;
    const copy = source.clone() as THREE.MeshStandardMaterial;
    if (!copy.emissive) return;
    if (rearLens) {
      copy.emissive = new THREE.Color(0xff1028);
      copy.emissiveIntensity = 0;
      mesh.material = copy;
      rearLenses.push(copy);
    } else {
      copy.emissive = new THREE.Color(0xe6f6ff);
      copy.emissiveIntensity = 0;
      mesh.material = copy;
      frontLenses.push(copy);
    }
  });

  const glows: { group: string; mat: THREE.SpriteMaterial; brightness: number }[] = [];
  const glowMap = radialTexture(128, 3, 62, [
    [0, 255, 255, 255, 1],
    [0.13, 255, 255, 255, 0.83],
    [0.32, 255, 255, 255, 0.34],
    [1, 255, 255, 255, 0],
  ]);
  const addGlow = (group: string, color: number, x: number, y: number, z: number, sx: number, sy: number, brightness = 1) => {
    const mat = new THREE.SpriteMaterial({
      map: glowMap,
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      depthTest: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(sx, sy, 1);
    scene.add(sprite);
    glows.push({ group, mat, brightness });
  };
  const frontZ = bbox.min.z + 0.13;
  const rearZ = bbox.max.z - 0.11;
  for (const side of [-1, 1]) {
    addGlow('headlights', 0xcdeaff, side * 0.77, 0.77, frontZ, 0.6, 0.31, 0.85);
    addGlow('taillights', 0xff334b, side * 0.76, 0.86, rearZ, 0.58, 0.27, 1);
    addGlow('brake', 0xff0e28, side * 0.71, 0.86, rearZ, 0.6, 0.26, 1.15);
    addGlow('reverse', 0xf5ffff, side * 0.6, 0.7, rearZ + 0.03, 0.23, 0.15, 1);
    addGlow(side < 0 ? 'right' : 'left', 0xffa92e, side * 0.91, 0.77, frontZ + 0.025, 0.26, 0.21, 1);
    addGlow(side < 0 ? 'right' : 'left', 0xffad2e, side * 0.93, 0.75, rearZ - 0.025, 0.27, 0.21, 1);
  }

  const roadGroup = new THREE.Group();
  scene.add(roadGroup);
  const lanePaint = new THREE.MeshBasicMaterial({ color: 0x75adcb, transparent: true, opacity: 0.52, depthWrite: false });
  const laneDashes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 11; i += 1) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 1.15), lanePaint);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(side * 1.64, 0.015, -12 + i * 2.4);
      roadGroup.add(dash);
      laneDashes.push(dash);
    }
  }
  const projectedGroup = new THREE.Group();
  scene.add(projectedGroup);
  const radarMat = new THREE.MeshBasicMaterial({ color: 0x39b7bf, transparent: true, opacity: 0.105, side: THREE.DoubleSide, depthWrite: false });
  const fz = bbox.min.z - 0.1;
  const wedge = new Float32Array([0, 0.032, fz, -3, 0.032, fz - 7.1, 0, 0.032, fz, 3, 0.032, fz - 7.1, 0, 0.032, fz, -3, 0.032, fz - 7.1, 3, 0.032, fz - 7.1]);
  const radarShape = new THREE.BufferGeometry();
  radarShape.setAttribute('position', new THREE.BufferAttribute(wedge, 3));
  try {
    radarShape.computeVertexNormals();
  } catch {
    /* illustrative fan still draws from the position buffer */
  }
  projectedGroup.add(new THREE.Mesh(radarShape, radarMat));
  for (const dx of [-2.4, -1.2, 0, 1.2, 2.4]) {
    const points = [new THREE.Vector3(0, 0.036, fz), new THREE.Vector3(dx, 0.036, fz - 6.5)];
    projectedGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x37a8b8, transparent: true, opacity: 0.32 })));
  }
  const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x188de0, transparent: true, opacity: 0.96 }));
  scene.add(pathLine);
  const pathDots: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i += 1) {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), new THREE.MeshBasicMaterial({ color: 0x318ce5 }));
    scene.add(marker);
    pathDots.push(marker);
  }

  const targetGroup = new THREE.Group();
  scene.add(targetGroup);
  const targetVehicle = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.58, 2.65), new THREE.MeshStandardMaterial({ color: 0x47768e, metalness: 0.3, roughness: 0.5 }));
  body.position.y = 0.49;
  targetVehicle.add(body);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.46, 1.32), new THREE.MeshStandardMaterial({ color: 0x8cc6d6, metalness: 0.12, roughness: 0.38 }));
  upper.position.set(0, 0.93, 0.1);
  targetVehicle.add(upper);
  for (const x of [-0.77, 0.77]) {
    for (const z of [-0.84, 0.87]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.18, 14), new THREE.MeshStandardMaterial({ color: 0x26313e }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.33, z);
      targetVehicle.add(wheel);
    }
  }
  const pedestrian = new THREE.Group();
  const humanMat = new THREE.MeshStandardMaterial({ color: 0xd28541, roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.72, 6, 12), humanMat);
  torso.position.y = 1.12;
  pedestrian.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), new THREE.MeshStandardMaterial({ color: 0xe5bb93 }));
  head.position.y = 1.94;
  pedestrian.add(head);
  for (const x of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.61, 8), humanMat);
    leg.position.set(x, 0.34, 0);
    pedestrian.add(leg);
  }
  const cyclist = new THREE.Group();
  const cycleMat = new THREE.MeshStandardMaterial({ color: 0x33455b, roughness: 0.8 });
  for (const z of [-0.62, 0.62]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.045, 8, 20), cycleMat);
    w.rotation.y = Math.PI / 2;
    w.position.set(0, 0.43, z);
    cyclist.add(w);
  }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), cycleMat);
  tube.rotation.x = Math.PI / 3;
  tube.position.set(0, 0.74, 0);
  cyclist.add(tube);
  const rider = pedestrian.clone();
  rider.scale.set(0.65, 0.75, 0.65);
  rider.position.set(0, 0.25, 0);
  cyclist.add(rider);
  const targets = { vehicle: targetVehicle, pedestrian, cyclist };
  Object.values(targets).forEach((group) => {
    group.visible = false;
    targetGroup.add(group);
  });
  const targetCaption = makeLabel('TARGET', [39, 65, 90]);
  targetCaption.position.set(0, 2.6, 0);
  targetGroup.add(targetCaption);

  const wheelRings: Partial<Record<DoorKey, THREE.Mesh>> = {};
  for (const [key, x, z] of [
    ['fl', 0.99, bbox.min.z + 1.18],
    ['fr', -0.99, bbox.min.z + 1.18],
    ['rl', 0.99, bbox.max.z - 1.14],
    ['rr', -0.99, bbox.max.z - 1.14],
  ] as [DoorKey, number, number][]) {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.028, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffa53b, transparent: true, opacity: 0.9 }));
    torus.rotation.x = Math.PI / 2;
    torus.position.set(x, 0.045, z);
    torus.visible = false;
    scene.add(torus);
    wheelRings[key] = torus;
  }
  const windowMarkers: Partial<Record<DoorKey, THREE.Sprite>> = {};
  for (const [key, x, z] of [
    ['fl', 1.04, -0.82],
    ['fr', -1.04, -0.82],
    ['rl', 1.04, 0.83],
    ['rr', -1.04, 0.83],
  ] as [DoorKey, number, number][]) {
    const mark = makeLabel('WINDOW OPEN', [22, 122, 193]);
    mark.scale.set(1.18, 0.3, 1);
    mark.position.set(x * 1.43, 1.65, z);
    mark.visible = false;
    scene.add(mark);
    windowMarkers[key] = mark;
  }
  const chargeHalo = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.036, 12, 48), new THREE.MeshBasicMaterial({ color: 0x26b6d2, transparent: true, opacity: 0.93 }));
  chargeHalo.position.set(-1.07, 0.62, bbox.max.z - 0.64);
  chargeHalo.rotation.y = Math.PI / 2;
  chargeHalo.visible = false;
  scene.add(chargeHalo);
  const securityHalo = new THREE.Mesh(
    new THREE.RingGeometry(2.73, 2.78, 80),
    new THREE.MeshBasicMaterial({ color: 0xe95d70, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
  );
  securityHalo.rotation.x = -Math.PI / 2;
  securityHalo.position.y = 0.021;
  securityHalo.visible = false;
  scene.add(securityHalo);
  const wiperGroup = new THREE.Group();
  const wiperMat = new THREE.MeshBasicMaterial({ color: 0x273b4b });
  for (const x of [-0.35, 0.35]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.018, 0.036), wiperMat);
    blade.position.set(x, 0, 0);
    wiperGroup.add(blade);
  }
  wiperGroup.position.set(0, 1.22, bbox.min.z + 1.72);
  wiperGroup.visible = false;
  scene.add(wiperGroup);
  const neutralWheels: Record<string, THREE.Quaternion> = {};
  for (const wheel of wheels) neutralWheels[wheel.anchor.name] = wheel.anchor.quaternion.clone();

  let roadRun = 0;
  let elapsed = 0;
  let lastPathKey = '';
  let cameraGoal: THREE.Vector3 | null = null;
  const steerAxis = new THREE.Vector3(0, 1, 0);
  const steerDelta = new THREE.Quaternion();
  const steerGoal = new THREE.Quaternion();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  controls.addEventListener('start', () => {
    cameraGoal = null;
  });

  function syncLayers(dt: number, snap: StudioSnapshot) {
    const s = snap.vehicle;
    elapsed += dt;
    const extras = s.adas;
    const overlays = s.overlays;
    const sceneEnabled = overlays.sensors !== false;
    const target = extras.object || 'none';
    const hasTarget = sceneEnabled && extras.perception !== false && target !== 'none';
    const dist = Number(extras.distance || 30);
    const depth = fz - (2.1 + Math.min(9.5, dist * 0.115));
    targetGroup.visible = hasTarget;
    for (const [kind, obj] of Object.entries(targets)) obj.visible = hasTarget && kind === target;
    targetGroup.position.set(0, 0, depth);
    targetCaption.visible = hasTarget && overlays.labels !== false;
    if (hasTarget) setLabel(targetCaption, `${target.toUpperCase()}  ${Math.round(dist)} m${extras.ttc !== null && extras.ttc !== undefined ? `  TTC ${extras.ttc}s` : ''}`);
    projectedGroup.visible = sceneEnabled && extras.perception !== false;
    const danger = extras.alert === 'AEB';
    radarMat.color.setHex(danger ? 0xf25362 : 0x39b7bf);
    radarMat.opacity = danger ? 0.22 : 0.105;
    const showPath = overlays.trajectory !== false && (s.infotainment.destination !== 'None' || extras.lka || Math.abs(s.motion.steering || 0) > 1);
    pathLine.visible = showPath;
    pathDots.forEach((dot) => {
      dot.visible = showPath;
    });
    const pathKey = `${showPath}/${Number(s.motion.steering || 0)}`;
    if (showPath && pathKey !== lastPathKey) {
      const curvature = Number(s.motion.steering || 0) / 35;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < 50; i += 1) {
        const t = i / 49;
        points.push(new THREE.Vector3(curvature * t * t * 3, 0.065, fz - t * 9.2));
      }
      pathLine.geometry.dispose();
      pathLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
      pathDots.forEach((dot, i) => dot.position.copy(points[Math.round((i + 1) * 4.45)]));
    }
    lastPathKey = pathKey;
    roadGroup.visible = sceneEnabled || showPath;
    lanePaint.color.setHex(s.motion.road === 'ice' ? 0xa7cce4 : s.motion.road === 'wet' ? 0xabc6df : 0x75adcb);
    paintStudio(s.motion.road);
    if (dt > 0 && Number(s.speed) > 0) roadRun += Number(s.speed) * dt * 0.035;
    for (let i = 0; i < laneDashes.length; i += 1) {
      let z = (-12 + (i % 11) * 2.4 + roadRun) % 26.4;
      if (z > 13) z -= 26.4;
      laneDashes[i].position.z = z;
    }
    for (const [key, ring] of Object.entries(wheelRings) as [DoorKey, THREE.Mesh][]) {
      const pressure = s.tpms[key] || 35;
      ring.visible = overlays.labels !== false && (pressure < 29 || pressure > 45);
      (ring.material as THREE.MeshBasicMaterial).color.setHex(pressure < 24 || pressure > 49 ? 0xf13c56 : 0xffa53b);
      ring.scale.setScalar(1 + 0.06 * Math.sin(elapsed * 5));
    }
    for (const [key, mark] of Object.entries(windowMarkers) as [DoorKey, THREE.Sprite][]) {
      mark.visible = overlays.labels !== false && s.windows[key] < 95;
      if (mark.visible) setLabel(mark, `WINDOW ${Math.round(s.windows[key])}%`);
    }
    chargeHalo.visible = !!s.ev.plugged;
    chargeHalo.scale.setScalar(s.ev.charging ? 1 + 0.15 * Math.sin(elapsed * 4) : 1);
    securityHalo.visible = Number(s.security.blocked) > 0 && overlays.labels !== false;
    (securityHalo.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.08 * Math.sin(elapsed * 3);
    wiperGroup.visible = !!s.wipers;
    if (s.wipers) wiperGroup.rotation.y = 0.24 * Math.sin(elapsed * 7);
    for (const wheel of wheels) {
      if (wheel.key[0] !== 'f') continue;
      const neutral = neutralWheels[wheel.anchor.name];
      const angle = Number(s.motion.steering || 0) * (Math.PI / 180) * 0.65;
      steerDelta.setFromAxisAngle(steerAxis, angle);
      steerGoal.copy(neutral).multiply(steerDelta);
      wheel.anchor.quaternion.slerp(steerGoal, Math.min(1, dt * 6));
    }
    const lights = snap.lights;
    for (const material of rearLenses) material.emissiveIntensity = lights.brake ? 2.9 : lights.taillights ? 1.28 : 0;
    for (const material of frontLenses) material.emissiveIntensity = lights.headlights ? 1.7 : 0;
    for (const glow of glows) {
      const active = glow.group === 'left' ? lights.left && snap.blink : glow.group === 'right' ? lights.right && snap.blink : !!lights[glow.group as keyof typeof lights];
      glow.mat.opacity = active ? glow.brightness * (glow.group === 'taillights' && lights.brake ? 0.3 : 0.55) : 0;
      if (glow.group === 'headlights') glow.mat.opacity = active ? 0.65 : 0;
      if (glow.group === 'brake') glow.mat.opacity = active ? 0.78 : 0;
    }
  }

  function paintStudio(road: string) {
    const darkMode = appearance === 'dark';
    (scene.background as THREE.Color).setHex(darkMode ? 0x1c1c1e : 0xf2f5fa);
    const floorMaterial = floor.material as THREE.MeshStandardMaterial;
    const dry = darkMode ? 0x2c2c2e : 0xf3f6fa;
    const wet = darkMode ? 0x243038 : 0xe0e8f0;
    const ice = darkMode ? 0x2a3844 : 0xe1f3f9;
    floorMaterial.color.setHex(road === 'wet' ? wet : road === 'ice' ? ice : dry);
    gridMaterials.forEach((material, index) => {
      const line = material as THREE.LineBasicMaterial;
      line.color?.setHex(index === 0 ? (darkMode ? 0x5a5a5e : 0xd9e3ed) : (darkMode ? 0x3a3a3c : 0xe2eaf2));
    });
  }

  options.onProgress(1);
  return {
    frame(dt, snap) {
      syncLayers(dt, snap);
      const alpha = 1 - Math.exp(-3.3 * dt);
      for (const [key, anchor] of Object.entries(anchors) as [DoorKey | 'trunk', THREE.Object3D][]) {
        const open = key === 'trunk' ? snap.vehicle.trunk : snap.vehicle.doors[key];
        const goal = open ? openQuat[key] : closedQuat[key];
        if (goal) anchor.quaternion.slerp(goal, alpha);
      }
      if (cameraGoal) {
        camera.position.lerp(cameraGoal, Math.min(1, dt * 5));
        if (camera.position.distanceToSquared(cameraGoal) < 0.0004) cameraGoal = null;
      }
      controls.update();
    },
    setAppearance(mode) {
      appearance = mode;
    },
    setCamera(name) {
      const preset = CAMERA_POSITIONS[name];
      if (!preset) return;
      camera.up.set(0, 1, 0);
      cameraGoal = new THREE.Vector3(preset[0] + center.x, preset[1] + center.y - 0.82, preset[2] + center.z);
      controls.target.set(center.x, center.y - 0.04, center.z);
      controls.update();
    },
    setPaint(id) {
      const paint = paintById(id);
      for (const material of bodyPaint) {
        if ('linear' in paint) material.color.setRGB(paint.linear[0], paint.linear[1], paint.linear[2], THREE.LinearSRGBColorSpace);
        else material.color.setHex(paint.hex);
        material.metalness = paint.metalness;
        material.roughness = paint.roughness;
        material.needsUpdate = true;
      }
    },
    zoomBy(factor) {
      cameraGoal = null;
      const offset = camera.position.clone().sub(controls.target);
      const distance = offset.length();
      if (distance < 1e-4) return;
      const next = Math.min(controls.maxDistance, Math.max(controls.minDistance, distance * factor));
      offset.multiplyScalar(next / distance);
      camera.position.copy(controls.target).add(offset);
    },
    resize(viewWidth, viewHeight) {
      surface.setSize(viewWidth, viewHeight);
      camera.aspect = viewWidth / Math.max(1, viewHeight);
      camera.fov = viewHeight < 390 ? 44 : 39;
      camera.updateProjectionMatrix();
    },
    tap(x, y) {
      const viewWidth = surface.element.clientWidth;
      const viewHeight = surface.element.clientHeight;
      if (!viewWidth || !viewHeight) return;
      pointer.set((x / viewWidth) * 2 - 1, -(y / viewHeight) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(vehicle, true);
      for (const hit of hits) {
        for (let parent: THREE.Object3D | null = hit.object; parent && parent !== vehicle.parent; parent = parent.parent) {
          const name = parent.name || '';
          const entry = (Object.entries(DOOR_NODES) as [DoorKey | 'trunk', string][]).find(([, node]) => node === name);
          if (entry) {
            if (entry[0] === 'trunk') options.onTrunk();
            else options.onDoor(entry[0]);
            return;
          }
          if (wheelKeys[name]) {
            options.onTire(wheelKeys[name]);
            return;
          }
        }
      }
    },
    dispose() {
      controls.dispose();
      scene.remove(vehicle);
    },
  };
}

async function readModelBytes(uri: string) {
  const attempts: Array<() => Promise<ArrayBuffer>> = [
    async () => new File(uri).arrayBuffer(),
    async () => {
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`Model download failed (${response.status})`);
      return response.arrayBuffer();
    },
  ];
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const buffer = await attempt();
      if (buffer.byteLength > 1000) return buffer;
      lastError = new Error('Vehicle model file was empty');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Vehicle model could not be read');
}
