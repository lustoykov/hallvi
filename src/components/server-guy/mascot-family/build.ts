import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import { memberById, type FamilyId } from "./roster";

/**
 * Geometry for the Little Server family. Little Server's parts are copied
 * exactly from home/mascot-scene.tsx; every cousin reuses the same screen
 * face, mitten arms, dark feet, props and materials, and differs only in
 * body proportions and one signature feature.
 */

/** Little Server's hardware colours, shared by the whole family. */
export const HW = {
  navy: 0x192338,
  eye: 0xedf3ff,
  line: 0xd6e5ff,
  slate: 0x3e4a60,
  steel: 0x647089,
  silver: 0xd6e0f0,
  paper: 0xf7f9fc,
  check: 0x285ad8,
  /** Little Server's attention eye tint. */
  attention: 0xf0c37b,
} as const;

const TAU = Math.PI * 2;

export type MouthShape = "smile" | "flat" | "concern" | "joy" | "o";
export type Arm = {
  side: -1 | 1;
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
};
export type Foot = {
  mesh: THREE.Mesh;
  side: -1 | 1;
  x: number;
  y: number;
  z: number;
  phase: number;
};

export type Extras = {
  hatch?: THREE.Group;
  beacon?: {
    glow: THREE.MeshStandardMaterial;
    light: THREE.PointLight;
    halo: THREE.SpriteMaterial;
  };
  crate?: THREE.Group;
  dial?: THREE.Group;
  disk?: { hug: THREE.Group; held: THREE.Group; floor: THREE.Group };
  ears?: THREE.Group[];
  tips?: THREE.MeshStandardMaterial[];
  leds?: THREE.MeshStandardMaterial[];
};

export type Rig = {
  id: FamilyId;
  body: THREE.Group;
  face: THREE.Group;
  eyeGap: number;
  eyes: THREE.Mesh[];
  eyeMats: THREE.MeshStandardMaterial[];
  happyEyes: THREE.Mesh[];
  brows: THREE.Mesh[];
  mouth: THREE.Mesh;
  mouths: Record<MouthShape, THREE.BufferGeometry>;
  arms: Arm[];
  armRest: number;
  feet: Foot[];
  clipboard: THREE.Group;
  wrench: THREE.Group;
  card: THREE.Group;
  cardHand: 0 | 1;
  /** Rotation centre for flips, top of the silhouette, and camera frame. */
  center: number;
  top: number;
  frame: { h: number; w: number };
  extra: Extras;
  dispose(): void;
};

type Tint = THREE.ColorRepresentation | THREE.Material;

function kit() {
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<number, THREE.MeshStandardMaterial>();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => {
    owned.push(x);
    return x;
  };
  const paint = (c: THREE.ColorRepresentation) => {
    const color = new THREE.Color(c);
    let m = materials.get(color.getHex());
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.44,
        metalness: 0.07,
      });
      materials.set(color.getHex(), m);
    }
    return m;
  };
  const glow = (color: number, emissive: number, intensity: number) =>
    own(
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: intensity,
        roughness: 0.35,
        metalness: 0,
      }),
    );
  /** A soft round glow sprite; its opacity follows the light it belongs to. */
  const halo = (color: number) => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,0.6)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const map = own(new THREE.CanvasTexture(c));
    return own(
      new THREE.SpriteMaterial({
        map,
        color,
        transparent: true,
        depthWrite: false,
        opacity: 0.3,
      }),
    );
  };
  const place = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    tint: Tint,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new THREE.Mesh(
      geometry,
      tint instanceof THREE.Material ? tint : paint(tint),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    r: number,
    tint: Tint,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const key = `b${w}|${h}|${d}|${r}`;
    let g = geometries.get(key);
    if (!g) {
      g = new RoundedBoxGeometry(w, h, d, r >= 0.04 ? 5 : 2, r);
      geometries.set(key, g);
    }
    return place(parent, g, tint, x, y, z);
  };
  /** A disc facing the camera. */
  const disc = (
    parent: THREE.Object3D,
    radius: number,
    depth: number,
    tint: Tint,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const key = `c${radius}|${depth}`;
    let g = geometries.get(key);
    if (!g) {
      g = new THREE.CylinderGeometry(radius, radius, depth, 40);
      g.rotateX(Math.PI / 2);
      geometries.set(key, g);
    }
    return place(parent, g, tint, x, y, z);
  };
  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    owned.forEach((o) => o.dispose());
  };
  return { box, disc, paint, glow, halo, own, dispose };
}

type Kit = ReturnType<typeof kit>;
type FootFn = (
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  phase?: number,
) => void;
type Spec = {
  face: { y: number; z: number; gap: number; scale: number };
  arms: { x: number; y: number; z: number; scale: number; rest: number };
  cardHand: 0 | 1;
  center: number;
  top: number;
  frame: { h: number; w: number };
};
type Builder = (
  k: Kit,
  body: THREE.Group,
  paint: THREE.Color,
  extra: Extras,
  foot: FootFn,
) => Spec;

const LED = [0xdfeaff, 0x8fb3ff] as const;

/** Little Server, unchanged. */
const server: Builder = (k, body, paint, extra, foot) => {
  k.box(body, 1.6, 1.8, 1.45, 0.19, paint, 0, 1.1);
  k.box(body, 1.38, 0.72, 0.08, 0.12, HW.navy, 0, 1.4, 0.735);
  for (let i = 0; i < 6; i++)
    k.box(
      body,
      0.035,
      0.28,
      0.025,
      0.013,
      HW.steel,
      -0.35 + i * 0.14,
      0.61,
      0.738,
    );
  // The top hatch, hinged at its back edge so a poke can pop it open.
  const hatch = new THREE.Group();
  hatch.position.set(0, 2.01, -0.31);
  body.add(hatch);
  k.box(hatch, 0.38, 0.035, 0.32, 0.045, HW.silver, 0, 0, 0.16);
  extra.hatch = hatch;
  // Two antennas after Ping's, which act as ears.
  const ears: THREE.Group[] = [];
  const tips: THREE.MeshStandardMaterial[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.5, 2.0, -0.32);
    body.add(ear);
    k.box(ear, 0.2, 0.09, 0.2, 0.04, HW.slate, 0, 0.03, 0);
    k.box(ear, 0.075, 0.5, 0.075, 0.035, HW.slate, 0, 0.3, 0);
    const tip = k.glow(0xe4edff, 0x9dbbff, 0.3);
    tips.push(tip);
    k.box(ear, 0.17, 0.17, 0.17, 0.075, tip, 0, 0.6, 0);
    ears.push(ear);
  }
  extra.ears = ears;
  extra.tips = tips;
  foot(-0.49, 0.13, 0.02, 0.32, 0.16, 0.82);
  foot(0.49, 0.13, 0.02, 0.32, 0.16, 0.82);
  return {
    face: { y: 1.45, z: 0.795, gap: 0.28, scale: 1 },
    arms: { x: 0.84, y: 1.05, z: 0.15, scale: 1, rest: 0.13 },
    cardHand: 1,
    center: 1.05,
    top: 2.69,
    frame: { h: 2.75, w: 2.3 },
  };
};

/** Lumen: a tall tower with drive bays and a status light on top. */
const tower: Builder = (k, body, paint, extra, foot) => {
  k.box(body, 1.24, 2.3, 1.2, 0.18, paint, 0, 1.35);
  k.box(body, 1.06, 0.66, 0.08, 0.12, HW.navy, 0, 2.06, 0.61);
  const leds: THREE.MeshStandardMaterial[] = [];
  for (const y of [1.5, 1.31, 1.12]) {
    k.box(body, 0.86, 0.14, 0.04, 0.035, HW.silver, 0, y, 0.61);
    k.box(body, 0.46, 0.028, 0.02, 0.01, HW.steel, -0.11, y, 0.633);
    const led = k.glow(LED[0], LED[1], 0.3);
    leds.push(led);
    k.box(body, 0.05, 0.05, 0.02, 0.02, led, 0.31, y, 0.633);
  }
  k.box(body, 0.14, 0.14, 0.03, 0.065, HW.silver, 0, 0.88, 0.612);
  for (let i = 0; i < 4; i++)
    k.box(
      body,
      0.035,
      0.24,
      0.025,
      0.013,
      HW.steel,
      -0.21 + i * 0.14,
      0.54,
      0.612,
    );
  // The status light on top; a soft halo lets its glow read on a light page.
  const beacon = new THREE.Group();
  beacon.position.set(0, 2.5, -0.04);
  body.add(beacon);
  k.box(beacon, 0.42, 0.1, 0.42, 0.045, HW.slate, 0, 0.04, 0);
  const glow = k.glow(0xeaf2ff, 0xa9c7ff, 0.6);
  k.box(beacon, 0.32, 0.28, 0.32, 0.14, glow, 0, 0.22, 0);
  k.box(beacon, 0.2, 0.05, 0.2, 0.02, HW.slate, 0, 0.385, 0);
  const halo = k.halo(0xb8d0ff);
  const sprite = new THREE.Sprite(halo);
  sprite.position.set(0, 0.22, 0.05);
  sprite.scale.setScalar(1.05);
  beacon.add(sprite);
  const light = new THREE.PointLight(0xb9d1ff, 0, 2.8, 2);
  light.position.set(0, 0.22, 0.14);
  beacon.add(light);
  extra.beacon = { glow, light, halo };
  extra.leds = leds;
  foot(-0.36, 0.13, 0.02, 0.3, 0.16, 0.74);
  foot(0.36, 0.13, 0.02, 0.3, 0.16, 0.74);
  return {
    face: { y: 2.1, z: 0.67, gap: 0.24, scale: 0.96 },
    arms: { x: 0.66, y: 1.62, z: 0.1, scale: 0.96, rest: 0.1 },
    cardHand: 1,
    center: 1.35,
    top: 2.91,
    frame: { h: 2.8, w: 2.0 },
  };
};

/**
 * Tug: a wide, low 1U rack unit on four stubby feet, with a deploy crate
 * for its back.
 */
const rack: Builder = (k, body, paint, extra, foot) => {
  k.box(body, 2.25, 0.92, 1.38, 0.26, paint, 0, 0.73);
  k.box(body, 1.12, 0.5, 0.08, 0.1, HW.navy, 0, 0.78, 0.7);
  for (const side of [-1, 1]) {
    // Rack ears: the mounting flanges and their screws.
    k.box(body, 0.1, 0.78, 0.1, 0.035, HW.silver, side * 1.1, 0.73, 0.58);
    for (const dy of [-0.24, 0.24])
      k.box(
        body,
        0.06,
        0.06,
        0.03,
        0.026,
        HW.steel,
        side * 1.1,
        0.73 + dy,
        0.64,
      );
    for (let j = 0; j < 4; j++)
      k.box(
        body,
        0.22,
        0.03,
        0.025,
        0.012,
        HW.steel,
        side * 0.74,
        0.6 + j * 0.1,
        0.7,
      );
  }
  const crate = new THREE.Group();
  crate.position.set(0, 1.19, -0.1);
  body.add(crate);
  k.box(crate, 1.04, 0.54, 0.8, 0.07, HW.silver, 0, 0.27, 0);
  for (const x of [-0.3, 0.3])
    k.box(crate, 0.08, 0.56, 0.82, 0.025, HW.steel, x, 0.27, 0);
  k.box(crate, 0.32, 0.22, 0.012, 0.02, HW.navy, 0, 0.29, 0.405);
  k.box(crate, 0.03, 0.11, 0.012, 0.01, HW.eye, 0, 0.27, 0.414);
  for (const s of [-1, 1]) {
    const head = k.box(
      crate,
      0.03,
      0.08,
      0.012,
      0.01,
      HW.eye,
      s * 0.022,
      0.31,
      0.414,
    );
    head.rotation.z = s * 0.75;
  }
  extra.crate = crate;
  // Diagonal pairs step together.
  for (const x of [-0.78, 0.78])
    for (const z of [-0.36, 0.38])
      foot(x, 0.15, z, 0.3, 0.22, 0.32, x < 0 === z < 0 ? 0 : Math.PI);
  return {
    face: { y: 0.81, z: 0.76, gap: 0.24, scale: 0.78 },
    arms: { x: 1.16, y: 0.84, z: 0.14, scale: 0.72, rest: 0.32 },
    cardHand: 1,
    center: 0.72,
    top: 1.23,
    frame: { h: 2.0, w: 3.0 },
  };
};

/**
 * Pip: a single-board scout, a big face over a small board with its chip
 * on show.
 */
const pip: Builder = (k, body, paint, extra, foot) => {
  k.box(body, 1.18, 0.92, 0.92, 0.24, paint, 0, 1.18);
  k.box(body, 1.0, 0.66, 0.08, 0.14, HW.navy, 0, 1.19, 0.47);
  // The GPIO header along the top of its head.
  k.box(body, 0.66, 0.04, 0.2, 0.015, HW.slate, 0, 1.645, -0.1);
  for (let i = 0; i < 7; i++)
    for (const z of [-0.14, -0.06])
      k.box(
        body,
        0.045,
        0.08,
        0.045,
        0.012,
        HW.steel,
        -0.27 + i * 0.09,
        1.69,
        z,
      );
  k.box(body, 0.42, 0.12, 0.4, 0.05, HW.slate, 0, 0.7, 0);
  k.box(body, 0.76, 0.46, 0.58, 0.08, paint, 0, 0.44);
  // The chip on its chest.
  k.box(body, 0.24, 0.24, 0.04, 0.03, HW.slate, 0, 0.44, 0.3);
  k.box(body, 0.12, 0.12, 0.02, 0.02, HW.steel, 0, 0.44, 0.325);
  for (let j = -1; j <= 1; j++) {
    for (const s of [-1, 1]) {
      k.box(
        body,
        0.045,
        0.026,
        0.02,
        0.008,
        HW.silver,
        s * 0.145,
        0.44 + j * 0.065,
        0.3,
      );
      k.box(
        body,
        0.026,
        0.045,
        0.02,
        0.008,
        HW.silver,
        j * 0.065,
        0.44 + s * 0.145,
        0.3,
      );
    }
  }
  const led = k.glow(LED[0], LED[1], 0.3);
  k.box(body, 0.05, 0.05, 0.02, 0.02, led, 0.27, 0.56, 0.3);
  extra.leds = [led];
  foot(-0.21, 0.12, 0.03, 0.24, 0.14, 0.48);
  foot(0.21, 0.12, 0.03, 0.24, 0.14, 0.48);
  return {
    face: { y: 1.22, z: 0.53, gap: 0.25, scale: 1 },
    arms: { x: 0.42, y: 0.6, z: 0.06, scale: 0.64, rest: 0.2 },
    cardHand: 1,
    center: 0.9,
    top: 1.73,
    frame: { h: 2.0, w: 1.7 },
  };
};

/** A 3.5-inch disk: the save icon everyone knows. */
function floppy(k: Kit, parent: THREE.Object3D) {
  const g = new THREE.Group();
  parent.add(g);
  k.box(g, 0.46, 0.46, 0.05, 0.03, HW.slate);
  k.box(g, 0.2, 0.15, 0.012, 0.01, HW.silver, 0.03, 0.155, 0.03);
  k.box(g, 0.05, 0.1, 0.014, 0.008, HW.steel, 0.07, 0.155, 0.037);
  k.box(g, 0.34, 0.2, 0.012, 0.015, HW.paper, 0, -0.1, 0.03);
  k.box(g, 0.22, 0.018, 0.01, 0.006, 0xb3bdcc, -0.02, -0.07, 0.038);
  k.box(g, 0.16, 0.018, 0.01, 0.006, 0xb3bdcc, -0.05, -0.12, 0.038);
  return g;
}

/**
 * Trove: a chunky backup keeper with a vault dial on its belly and drive
 * bays beside it.
 */
const vault: Builder = (k, body, paint, extra, foot) => {
  k.box(body, 1.84, 2.0, 1.45, 0.28, paint, 0, 1.22);
  k.box(body, 1.28, 0.54, 0.08, 0.12, HW.navy, 0, 1.86, 0.735);
  k.disc(body, 0.27, 0.06, HW.silver, 0, 1.22, 0.735);
  const dial = new THREE.Group();
  dial.position.set(0, 1.22, 0.735);
  body.add(dial);
  k.disc(dial, 0.215, 0.05, HW.slate, 0, 0, 0.03);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const tick = k.box(
      dial,
      0.02,
      i % 3 ? 0.04 : 0.065,
      0.015,
      0.006,
      HW.silver,
      Math.sin(a) * 0.17,
      Math.cos(a) * 0.17,
      0.06,
    );
    tick.rotation.z = -a;
  }
  k.disc(dial, 0.085, 0.07, HW.silver, 0, 0, 0.08);
  k.box(dial, 0.05, 0.16, 0.05, 0.02, HW.steel, 0, 0, 0.12);
  k.box(body, 0.05, 0.06, 0.02, 0.012, HW.eye, 0, 1.52, 0.745);
  extra.dial = dial;
  // Drive bays either side of the dial.
  const leds: THREE.MeshStandardMaterial[] = [];
  for (const side of [-1, 1])
    for (let j = 0; j < 3; j++) {
      const y = 1.09 + j * 0.13;
      k.box(body, 0.24, 0.085, 0.035, 0.03, HW.silver, side * 0.5, y, 0.735);
      const led = k.glow(LED[0], LED[1], 0.3);
      leds.push(led);
      k.box(body, 0.04, 0.04, 0.02, 0.016, led, side * 0.58, y, 0.755);
    }
  extra.leds = leds;
  for (const y of [1.7, 0.7])
    k.box(body, 0.09, 0.22, 0.09, 0.035, HW.steel, -0.9, y, 0.6);
  foot(-0.52, 0.13, 0.03, 0.44, 0.17, 0.9);
  foot(0.52, 0.13, 0.03, 0.44, 0.17, 0.9);
  return {
    face: { y: 1.89, z: 0.795, gap: 0.27, scale: 0.9 },
    // Forward-set, longer arms so the hug reaches around the disk (solved
    // with forward kinematics).
    arms: { x: 0.94, y: 0.95, z: 0.5, scale: 1.28, rest: 0.12 },
    cardHand: 0,
    center: 1.2,
    top: 2.22,
    frame: { h: 2.35, w: 2.4 },
  };
};

/** Ping: a router whose two antennas act like ears. */
const relay: Builder = (k, body, paint, extra, foot) => {
  k.box(body, 1.5, 1.1, 1.3, 0.21, paint, 0, 0.77);
  k.box(body, 1.24, 0.56, 0.08, 0.11, HW.navy, 0, 0.9, 0.66);
  const leds: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 5; i++) {
    const led = k.glow(LED[0], LED[1], 0.3);
    leds.push(led);
    k.box(body, 0.075, 0.075, 0.03, 0.03, led, -0.36 + i * 0.18, 0.5, 0.66);
  }
  const ears: THREE.Group[] = [];
  const tips: THREE.MeshStandardMaterial[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.5, 1.3, -0.3);
    body.add(ear);
    k.box(ear, 0.2, 0.1, 0.2, 0.045, HW.slate, 0, 0.03, 0);
    k.box(ear, 0.08, 0.8, 0.08, 0.038, HW.slate, 0, 0.44, 0);
    const tip = k.glow(0xe4edff, 0x9dbbff, 0.25);
    tips.push(tip);
    k.box(ear, 0.17, 0.17, 0.17, 0.08, tip, 0, 0.88, 0);
    ears.push(ear);
  }
  extra.ears = ears;
  extra.tips = tips;
  extra.leds = leds;
  foot(-0.46, 0.12, 0.02, 0.3, 0.15, 0.72);
  foot(0.46, 0.12, 0.02, 0.3, 0.15, 0.72);
  return {
    face: { y: 0.94, z: 0.72, gap: 0.26, scale: 0.86 },
    arms: { x: 0.79, y: 0.86, z: 0.12, scale: 0.82, rest: 0.16 },
    cardHand: 1,
    center: 0.8,
    top: 2.27,
    frame: { h: 2.35, w: 2.1 },
  };
};

const BUILDERS: Record<FamilyId, Builder> = {
  server,
  tower,
  rack,
  pip,
  vault,
  relay,
};

function addFace(k: Kit, body: THREE.Group, o: Spec["face"]) {
  const face = new THREE.Group();
  face.position.set(0, o.y, o.z);
  face.scale.setScalar(o.scale);
  body.add(face);
  const eyeMats = [0, 1].map(() =>
    k.own(
      new THREE.MeshStandardMaterial({
        color: HW.eye,
        roughness: 0.44,
        metalness: 0.07,
      }),
    ),
  );
  const eyes = [-o.gap, o.gap].map((x, i) =>
    k.box(face, 0.115, 0.25, 0.035, 0.05, eyeMats[i], x),
  );
  const stroke = (points: number[][], radius = 0.018) =>
    k.own(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
        ),
        20,
        radius,
        8,
        false,
      ),
    );
  const o_ = k.own(new THREE.TorusGeometry(0.05, 0.02, 8, 24));
  o_.translate(0, -0.26, 0);
  const mouths: Record<MouthShape, THREE.BufferGeometry> = {
    smile: stroke([
      [-0.15, -0.24, 0],
      [0, -0.285, 0.01],
      [0.15, -0.24, 0],
    ]),
    flat: stroke([
      [-0.1, -0.25, 0],
      [0, -0.25, 0.01],
      [0.1, -0.25, 0],
    ]),
    concern: stroke([
      [-0.12, -0.29, 0],
      [0, -0.245, 0.01],
      [0.12, -0.29, 0],
    ]),
    joy: stroke(
      [
        [-0.21, -0.2, 0],
        [0, -0.31, 0.01],
        [0.21, -0.2, 0],
      ],
      0.023,
    ),
    o: o_,
  };
  const lineMat = k.own(new THREE.MeshStandardMaterial({ color: HW.line }));
  const mouth = new THREE.Mesh(mouths.smile, lineMat);
  face.add(mouth);
  const arc = stroke(
    [
      [-0.09, 0, 0],
      [0, 0.075, 0.01],
      [0.09, 0, 0],
    ],
    0.025,
  );
  const happyEyes = [-o.gap, o.gap].map((x) => {
    const eye = new THREE.Mesh(arc, lineMat);
    eye.position.x = x;
    face.add(eye);
    return eye;
  });
  const brows = [-o.gap, o.gap].map((x) =>
    k.box(face, 0.16, 0.025, 0.02, 0.01, HW.line, x, 0.19),
  );
  return {
    face,
    eyes,
    eyeMats,
    happyEyes,
    brows,
    mouth,
    mouths,
    eyeGap: o.gap,
  };
}

function addArms(
  k: Kit,
  body: THREE.Group,
  paint: THREE.Color,
  o: Spec["arms"],
): Arm[] {
  return ([-1, 1] as const).map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * o.x, o.y, o.z);
    shoulder.scale.setScalar(o.scale);
    body.add(shoulder);
    k.box(shoulder, 0.22, 0.36, 0.24, 0.1, paint, side * 0.05, -0.14, 0);
    const elbow = new THREE.Group();
    elbow.position.set(side * 0.08, -0.29, 0.02);
    shoulder.add(elbow);
    k.box(elbow, 0.18, 0.27, 0.19, 0.08, HW.silver, 0, -0.1, 0.03);
    const wrist = new THREE.Group();
    wrist.position.set(0, -0.24, 0.05);
    elbow.add(wrist);
    k.box(wrist, 0.25, 0.27, 0.21, 0.1, HW.eye);
    k.box(wrist, 0.11, 0.15, 0.15, 0.05, HW.eye, -side * 0.115, 0.04, 0.045);
    return { side, shoulder, elbow, wrist };
  });
}

function addClipboard(k: Kit, wrist: THREE.Group) {
  const g = new THREE.Group();
  wrist.add(g);
  g.position.set(-0.06, 0.17, 0.16);
  g.rotation.z = -0.1;
  k.box(g, 0.52, 0.7, 0.06, 0.035, HW.slate);
  k.box(g, 0.43, 0.54, 0.018, 0.014, HW.paper, 0, -0.025, 0.041);
  k.box(g, 0.2, 0.09, 0.07, 0.025, HW.steel, 0, 0.335, 0.055);
  for (let i = 0; i < 3; i++) {
    k.box(g, 0.22, 0.018, 0.016, 0.007, 0x8c9fb9, 0.045, 0.14 - i * 0.12, 0.06);
    k.box(
      g,
      0.035,
      0.035,
      0.017,
      0.012,
      HW.check,
      -0.14,
      0.14 - i * 0.12,
      0.06,
    );
  }
  return g;
}

/**
 * The wrench, held out from the body with its head up so its silhouette
 * reads on its own: a steel shank and open jaw, a navy grip in the mitten.
 */
function addWrench(k: Kit, wrist: THREE.Group) {
  const g = new THREE.Group();
  wrist.add(g);
  g.position.set(0.02, -0.02, 0.14);
  g.rotation.z = -1.25;
  const steel = 0x8a97ad;
  k.box(g, 0.1, 0.66, 0.06, 0.03, steel, 0, 0.13);
  k.box(g, 0.13, 0.27, 0.085, 0.04, HW.navy, 0, -0.06);
  k.box(g, 0.14, 0.035, 0.09, 0.015, 0x285ad8, 0, 0.15);
  const jaw = new THREE.Mesh(
    k.own(new THREE.TorusGeometry(0.125, 0.048, 10, 28, Math.PI * 1.45)),
    k.paint(steel),
  );
  jaw.castShadow = true;
  jaw.position.y = 0.56;
  // The gap of the open end faces up.
  jaw.rotation.z = Math.PI * 0.775;
  g.add(jaw);
  return g;
}

/** A small blank card held up while waiting, dashed like the approval card. */
function addCard(k: Kit, wrist: THREE.Group, side: -1 | 1) {
  const g = new THREE.Group();
  wrist.add(g);
  g.position.set(side * -0.02, 0.27, 0.12);
  k.box(g, 0.46, 0.58, 0.035, 0.045, HW.paper);
  const dash = (x: number, y: number, w: number, h: number) =>
    k.box(g, w, h, 0.01, 0.004, 0xb3bdcc, x, y, 0.021);
  for (let i = 0; i < 4; i++) {
    const x = -0.12 + i * 0.08;
    dash(x, 0.21, 0.045, 0.014);
    dash(x, -0.21, 0.045, 0.014);
  }
  for (let j = 0; j < 5; j++) {
    const y = -0.16 + j * 0.08;
    dash(-0.16, y, 0.014, 0.045);
    dash(0.16, y, 0.014, 0.045);
  }
  return g;
}

export function buildRig(id: FamilyId): Rig {
  const k = kit();
  const paint = new THREE.Color(memberById(id).paint);
  const body = new THREE.Group();
  const extra: Extras = {};
  const feet: Foot[] = [];
  const foot: FootFn = (x, y, z, w, h, d, phase = x < 0 ? 0 : Math.PI) => {
    const mesh = k.box(
      body,
      w,
      h,
      d,
      Math.min(0.07, h * 0.44),
      HW.slate,
      x,
      y,
      z,
    );
    feet.push({ mesh, side: x < 0 ? -1 : 1, x, y, z, phase });
  };
  const spec = BUILDERS[id](k, body, paint, extra, foot);
  const f = addFace(k, body, spec.face);
  const arms = addArms(k, body, paint, spec.arms);
  const clipboard = addClipboard(k, arms[0].wrist);
  const wrench = addWrench(k, arms[1].wrist);
  const card = addCard(k, arms[spec.cardHand].wrist, arms[spec.cardHand].side);
  if (id === "vault") {
    // One disk, three places: hugged, held up high, or set down by its foot.
    const hug = floppy(k, body);
    hug.position.set(0, 0.62, 0.82);
    hug.scale.setScalar(1.35);
    hug.rotation.set(-0.06, 0, 0.05);
    const held = floppy(k, arms[1].wrist);
    held.position.set(-0.04, 0.3, 0.14);
    const floor = floppy(k, body);
    floor.position.set(-1.2, 0.31, 0.72);
    floor.scale.setScalar(1.3);
    floor.rotation.set(-0.22, 0.35, 0.06);
    extra.disk = { hug, held, floor };
  }
  for (const prop of [clipboard, wrench, card]) prop.visible = false;
  return {
    id,
    body,
    ...f,
    arms,
    armRest: spec.arms.rest,
    feet,
    clipboard,
    wrench,
    card,
    cardHand: spec.cardHand,
    center: spec.center,
    top: spec.top,
    frame: spec.frame,
    extra,
    dispose: k.dispose,
  };
}
