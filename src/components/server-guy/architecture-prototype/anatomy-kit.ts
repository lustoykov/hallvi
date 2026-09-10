// PROTOTYPE · claude/architecture-directions · throwaway.
// The contract a 3D model style ("kit") implements for direction C, the
// exploded server. The scene owns the camera, the explode spring, lenses and
// state tints, picking, callouts and the re-check scan. A kit owns only how
// things look: geometry, materials, lights and any ambient animation.

import type * as THREE from "three";

/** Trays from the floor up. Each rises when the server is pulled apart. */
export type KitLayer = "base" | "disk" | "net" | "service" | "shell";

export type KitPartKind =
  | "host" // the server itself: the base tray, with its name engraved
  | "volume" // persistent state on the disk tray (grafana.db, metrics)
  | "web" // the application people open (Grafana)
  | "private" // a service with no way in from outside (Prometheus)
  | "gate" // a way in: a door in the cover (port 80, port 22)
  | "tls" // HTTPS, which is not set up: draw it as a ghost ring by the port-80 door
  | "offsite" // off-server copies (Cloudflare R2), beside the server
  | "source" // where the setup comes from (GitHub), floating off to the left
  | "controller" // Server Guy on your network, standing in front-left
  | "gap"; // something not set up (monitoring): a ghost on the cover's roof

export interface KitPart {
  id: string;
  kind: KitPartKind;
  /** Volumes: the part that mounts them. Private services: the part that calls them. */
  owner?: string;
  /** Short display name: "Grafana", "grafana.db", "Port 80". */
  label: string;
}

export interface KitContext {
  parts: KitPart[];
  /** Engraving for the host, e.g. "Hetzner CX23 · Falkenstein". */
  hostLabel: string;
  /** CSS font-family string for canvas-drawn text (Geist in the product). */
  font: string;
}

export interface BuiltPart {
  layer: KitLayer;
  /** Positioned in its layer's local space; y = 0 is the layer's floor. */
  object: THREE.Object3D;
  /**
   * Meshes the scene may tint for lenses and states. Their material colour at
   * build time is treated as the neutral look and restored afterwards. Use one
   * MeshStandardMaterial or MeshPhysicalMaterial instance per mesh; never share
   * a tintable material between parts.
   */
  tintable: THREE.Mesh[];
  /** A point in `object` space that a callout leader should point at. */
  anchor: THREE.Vector3;
}

export interface Kit {
  name: string;
  /** Lights, environment map, tone mapping, ground shadow. Returns a disposer. */
  stage(scene: THREE.Scene, renderer: THREE.WebGLRenderer): () => void;
  /** Objects on a layer that are not parts: trays, plates, the cover, cabling. */
  decor(ctx: KitContext): Partial<Record<KitLayer, THREE.Object3D[]>>;
  /** One object per part. Called once per part in `ctx.parts`. */
  part(part: KitPart, ctx: KitContext): BuiltPart;
  /** Height of a layer's floor at explode `e` (0 = assembled, 1 = fully apart). */
  layerY(layer: KitLayer, e: number): number;
  /** Optional ambient animation (fans, LEDs). Return true while it needs frames. */
  tick?(dt: number, time: number): boolean;
  /** Framing hint for an orthographic camera: look-at point and half-height (world units). */
  frame?: { target: [number, number, number]; halfHeight: number };
}
