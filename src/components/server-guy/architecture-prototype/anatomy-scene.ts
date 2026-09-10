// PROTOTYPE · claude/architecture-directions · throwaway.
// The Three.js scene behind direction C: the one server as an assembly of
// trays (host, disk, private network, services) under a cover whose doors are
// the ways in. The scene owns behaviour: the camera, explode, lenses and state
// tints, picking, the re-check scan and the beams. How it looks comes from a
// kit (see anatomy-kit.ts), so the same object can be clay, aluminium or
// glass. It renders only while something moves.

import * as THREE from "three";

import type { Kit, KitContext, KitLayer } from "./anatomy-kit";
import type { Certainty, PartKind } from "./model";
import { reducedMotion } from "./motion";

export type Lens = "structure" | "exposure" | "data" | "certainty";

export interface ScenePart {
  id: string;
  kind: PartKind | "gap";
  label: string;
  certainty: Certainty;
  checking: boolean;
  owner?: string;
}

export interface SceneCallbacks {
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onFrame: () => void;
}

const LAYERS: KitLayer[] = ["base", "disk", "net", "service", "shell"];
const AZIMUTH = 0.72;
const BLUE = new THREE.Color(0x285ad8);
const RED = new THREE.Color(0xa6312b);

/** The colour a part leans towards under the "How sure" lens. */
const certaintyTint: Record<Certainty, number> = {
  verified: 0x7fd1a8,
  stale: 0xf2b077,
  failed: 0xec8f87,
  unknown: 0xc3c9d4,
  planned: 0xffffff,
  absent: 0xffffff,
};
const certaintyFlash: Record<Certainty, number> = {
  verified: 0x14945f,
  stale: 0xb25a16,
  failed: 0xa6312b,
  unknown: 0x8b95a5,
  planned: 0x687183,
  absent: 0xb9c2d0,
};

type Shaded = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };

/** A material's look as the kit made it, kept so every tint can be undone. */
interface Look {
  material: Shaded;
  color: THREE.Color | null;
  emissive: THREE.Color | null;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  tint: boolean;
}

interface Visual {
  id: string;
  kind: ScenePart["kind"];
  object: THREE.Object3D;
  meshes: THREE.Mesh[];
  looks: Look[];
  anchor: THREE.Vector3;
  baseY: number;
  certainty: Certainty;
  checking: boolean;
  tint: THREE.Color;
  tintTarget: THREE.Color;
  mix: number;
  mixTarget: number;
  fade: number;
  fadeTarget: number;
  lift: number;
  liftTarget: number;
  glow: number;
  glowColor: THREE.Color;
}

interface Decor {
  layer: KitLayer;
  looks: Look[];
  fade: number;
  fadeTarget: number;
}

/**
 * Give everything drawn under `object` its own copies of its materials, so
 * one part can be tinted or faded without touching another, and remember the
 * kit's look to return to.
 */
function adopt(object: THREE.Object3D, tintable: Set<THREE.Object3D>, id?: string) {
  const meshes: THREE.Mesh[] = [];
  const looks: Look[] = [];
  object.traverse((child) => {
    const drawable = child as THREE.Mesh;
    if (!drawable.material) return;
    const own = Array.isArray(drawable.material)
      ? drawable.material.map((material) => material.clone())
      : drawable.material.clone();
    drawable.material = own;
    if (drawable.isMesh) {
      meshes.push(drawable);
      if (id) drawable.userData.partId = id;
    }
    for (const material of Array.isArray(own) ? own : [own]) {
      const shaded = material as Shaded;
      looks.push({
        material: shaded,
        color: shaded.color?.isColor ? shaded.color.clone() : null,
        emissive: shaded.emissive?.isColor ? shaded.emissive.clone() : null,
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
        tint: tintable.has(drawable),
      });
    }
  });
  return { meshes, looks };
}

const scratch = new THREE.Color();

function paint(
  look: Look,
  fade: number,
  tint: THREE.Color | null = null,
  mix = 0,
  glow: THREE.Color | null = null,
  glowAmount = 0,
) {
  const material = look.material;
  if (look.color && material.color) {
    material.color.copy(look.color);
    if (look.tint && tint && mix > 0.002) material.color.lerp(tint, mix);
  }
  if (look.emissive && material.emissive) {
    material.emissive.copy(look.emissive);
    if (look.tint && glow && glowAmount > 0.002)
      material.emissive.add(scratch.copy(glow).multiplyScalar(glowAmount));
  }
  const transparent = look.transparent || fade < 0.995;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  material.opacity = look.opacity * fade;
  material.depthWrite = look.depthWrite && fade > 0.6;
}

function disposeDeep(object: THREE.Object3D) {
  object.traverse((child) => {
    const drawable = child as THREE.Mesh;
    drawable.geometry?.dispose?.();
    const materials = drawable.material
      ? Array.isArray(drawable.material)
        ? drawable.material
        : [drawable.material]
      : [];
    for (const material of materials) {
      for (const value of Object.values(material))
        if ((value as THREE.Texture | null)?.isTexture)
          (value as THREE.Texture).dispose();
      material.dispose();
    }
  });
}

function stripeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#46a2de";
  ctx.fillRect(0, 0, 36, 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(14, 1);
  return texture;
}

const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export class AnatomyScene {
  private host: HTMLElement;
  private callbacks: SceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private layers = Object.fromEntries(
    LAYERS.map((layer) => [layer, new THREE.Group()]),
  ) as Record<KitLayer, THREE.Group>;
  private kit: Kit | null = null;
  private unstage: (() => void) | null = null;
  private parts: ScenePart[] = [];
  private visuals = new Map<string, Visual>();
  private decor: Decor[] = [];
  private built: THREE.Object3D[] = [];
  private roofLocal = new THREE.Vector3(-0.2, 2, 0.9);
  private topology = "";
  private hostLabel = "";
  private explode = 0;
  private lens: Lens = "structure";
  private hovered: string | null = null;
  private selected: string | null = null;
  private azimuth = AZIMUTH;
  private azimuthVelocity = 0;
  private elevation = 0.5;
  private target = new THREE.Vector3(0.1, 2.7, 0);
  private halfHeight = 4.6;
  private raf = 0;
  private last = 0;
  private pending = false;
  private time = 0;
  /** Kits may animate (fans, LEDs) only for a while after you interact. */
  private ambientUntil = 0;
  private drag: { x: number; moved: boolean; id: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private scanPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private scanEdge: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private scanTarget: number | null = null;
  private scanY = 0;
  private scanOpacity = 0;
  private beam: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private release: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private dataArc: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  private family: string;
  private observer: ResizeObserver;

  constructor(host: HTMLElement, callbacks: SceneCallbacks) {
    this.host = host;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = "axc-canvas";
    host.appendChild(this.renderer.domElement);
    this.family = getComputedStyle(document.body).fontFamily || "system-ui";
    for (const layer of LAYERS) this.scene.add(this.layers[layer]);

    this.scanPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 5.2),
      new THREE.MeshBasicMaterial({
        color: BLUE,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.scanPlane.rotation.x = -Math.PI / 2;
    this.scanEdge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-3.7, 0, -2.6),
        new THREE.Vector3(3.7, 0, -2.6),
        new THREE.Vector3(3.7, 0, 2.6),
        new THREE.Vector3(-3.7, 0, 2.6),
      ]),
      new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0 }),
    );
    const dashed = (color: number) =>
      new THREE.LineDashedMaterial({
        color,
        dashSize: 0.16,
        gapSize: 0.12,
        transparent: true,
        opacity: 0.8,
      });
    this.beam = new THREE.Line(new THREE.BufferGeometry(), dashed(0x285ad8));
    this.release = new THREE.Line(new THREE.BufferGeometry(), dashed(0x7c889d));
    this.dataArc = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0.1, 0, 0),
        ]),
        2,
        0.04,
        8,
        false,
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: stripeTexture(),
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    this.dataArc.visible = false;
    this.scene.add(
      this.scanPlane,
      this.scanEdge,
      this.beam,
      this.release,
      this.dataArc,
    );

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("dblclick", this.onDoubleClick);
  }

  // ---------- Public API ----------

  /** Change how the server looks. Its state, lens and explode carry over. */
  setKit(kit: Kit) {
    if (kit === this.kit) return;
    this.clear();
    this.unstage?.();
    this.kit = kit;
    this.unstage = kit.stage(this.scene, this.renderer);
    const frame = kit.frame ?? { target: [0.1, 2.7, 0], halfHeight: 4.6 };
    this.target.set(...frame.target);
    this.halfHeight = frame.halfHeight;
    this.resize();
    this.build(true);
  }

  setParts(parts: ScenePart[], hostLabel: string) {
    this.parts = parts;
    const topology = parts
      .map((part) => `${part.id}:${part.kind}:${part.owner ?? ""}:${part.label}`)
      .join("|");
    if (topology !== this.topology || hostLabel !== this.hostLabel) {
      this.topology = topology;
      this.hostLabel = hostLabel;
      this.build(false);
    }
    for (const part of parts) {
      const visual = this.visuals.get(part.id);
      if (!visual) continue;
      if (visual.certainty !== part.certainty)
        this.flash(visual, certaintyFlash[part.certainty], 0.55);
      visual.certainty = part.certainty;
      visual.checking = part.checking;
    }
    this.applyTargets();
    this.invalidate();
  }

  setLens(lens: Lens) {
    if (lens === this.lens) return;
    this.lens = lens;
    const accent =
      lens === "exposure"
        ? 0x285ad8
        : lens === "data"
          ? 0x46a2de
          : lens === "certainty"
            ? 0x14945f
            : 0xffffff;
    for (const visual of this.visuals.values())
      if (this.inFocus(visual)) this.flash(visual, accent, 0.45);
    this.applyTargets();
    this.wake();
  }

  setExplode(value: number) {
    this.explode = value;
    this.layout();
    this.wake();
  }

  setHighlight(hovered: string | null, selected: string | null) {
    this.hovered = hovered;
    this.selected = selected;
    this.applyTargets();
    this.wake();
  }

  /** 0 = the cover, 1 = the host; null hides the scan. */
  setScan(progress: number | null) {
    this.scanTarget = progress;
    this.invalidate();
  }

  celebrate(ids: string[]) {
    for (const id of ids) {
      const visual = this.visuals.get(id);
      if (visual) this.flash(visual, 0x14945f, 1);
    }
    this.invalidate();
  }

  /** Where a part's callout should point, in CSS pixels inside the host. */
  anchor(id: string) {
    const visual = this.visuals.get(id);
    if (!visual) return null;
    return this.toScreen(visual.object.localToWorld(visual.anchor.clone()));
  }

  /** The top of the cover: where Little Server stands. */
  roof() {
    return this.toScreen(this.layers.shell.localToWorld(this.roofLocal.clone()));
  }

  resetView() {
    this.azimuth = AZIMUTH;
    this.azimuthVelocity = 0;
    this.updateCamera();
    this.invalidate();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.clear();
    this.unstage?.();
    for (const object of [
      this.scanPlane,
      this.scanEdge,
      this.beam,
      this.release,
      this.dataArc,
    ])
      disposeDeep(object);
    this.renderer.dispose();
    canvas.remove();
  }

  // ---------- Building ----------

  private build(entering: boolean) {
    const kit = this.kit;
    if (!kit || !this.parts.length) return;
    this.clear();
    const ctx: KitContext = {
      parts: this.parts.map(({ id, kind, owner, label }) => ({
        id,
        kind,
        owner,
        label,
      })),
      hostLabel: this.hostLabel,
      font: this.family,
    };
    const decor = kit.decor(ctx);
    for (const layer of LAYERS)
      for (const object of decor[layer] ?? []) {
        this.layers[layer].add(object);
        this.built.push(object);
        this.decor.push({
          layer,
          looks: adopt(object, new Set()).looks,
          fade: entering ? 0 : 1,
          fadeTarget: 1,
        });
      }
    ctx.parts.forEach((kitPart, i) => {
      const part = this.parts[i];
      const built = kit.part(kitPart, ctx);
      this.layers[built.layer].add(built.object);
      this.built.push(built.object);
      const { meshes, looks } = adopt(
        built.object,
        new Set(built.tintable),
        part.id,
      );
      this.visuals.set(part.id, {
        id: part.id,
        kind: part.kind,
        object: built.object,
        meshes,
        looks,
        anchor: built.anchor.clone(),
        baseY: built.object.position.y,
        certainty: part.certainty,
        checking: part.checking,
        tint: new THREE.Color(0xffffff),
        tintTarget: new THREE.Color(0xffffff),
        mix: 0,
        mixTarget: 0,
        fade: entering ? 0 : 1,
        fadeTarget: 1,
        lift: 0,
        liftTarget: 0,
        glow: 0,
        glowColor: new THREE.Color(0xffffff),
      });
    });
    this.layout();
    // Little Server stands on the cover, a little in front of its middle.
    const shell = decor.shell ?? [];
    if (shell.length) {
      const box = new THREE.Box3();
      for (const object of shell) box.expandByObject(object);
      this.roofLocal.set(
        THREE.MathUtils.lerp(box.min.x, box.max.x, 0.47),
        box.max.y - this.layers.shell.position.y,
        THREE.MathUtils.lerp(box.min.z, box.max.z, 0.7),
      );
    }
    this.applyTargets();
    this.wake();
  }

  private clear() {
    for (const object of this.built) {
      object.parent?.remove(object);
      disposeDeep(object);
    }
    this.built = [];
    this.visuals.clear();
    this.decor = [];
  }

  // ---------- State to targets ----------

  private inFocus(visual: Visual) {
    switch (this.lens) {
      case "exposure":
        return ["gate", "tls", "web", "private", "controller"].includes(
          visual.kind,
        );
      case "data":
        return visual.kind === "volume" || visual.kind === "offsite";
      default:
        return true;
    }
  }

  private applyTargets() {
    for (const visual of this.visuals.values()) {
      // Kits already draw what isn't set up (HTTPS, monitoring) as ghosts;
      // anything else planned or absent is faded here.
      const ghost =
        (visual.certainty === "planned" || visual.certainty === "absent") &&
        visual.kind !== "tls" &&
        visual.kind !== "gap";
      const focus = this.inFocus(visual);
      let tint = 0xffffff;
      let mix = 0;
      if (this.lens === "certainty") {
        tint = certaintyTint[visual.certainty];
        mix = tint === 0xffffff ? 0 : 0.75;
      } else if (this.lens === "exposure" && visual.id === "gate:http") {
        tint = 0x285ad8;
        mix = 0.8;
      } else if (this.lens === "data" && focus) {
        tint = 0x46a2de;
        mix = 0.45;
      }
      if (visual.certainty === "failed" && this.lens !== "certainty") {
        tint = certaintyTint.failed;
        mix = 0.6;
      }
      visual.tintTarget.set(tint);
      visual.mixTarget = mix;
      visual.fadeTarget = !focus ? 0.14 : ghost ? 0.35 : 1;
      visual.liftTarget =
        this.hovered === visual.id || this.selected === visual.id ? 0.14 : 0;
    }
    // Under a lens the cover turns to glass, so the answer isn't hidden.
    const xray = this.lens !== "structure";
    for (const decor of this.decor)
      decor.fadeTarget = decor.layer === "shell" && xray ? 0.25 : 1;
    this.beam.material.opacity = this.lens === "exposure" ? 0.95 : 0.12;
    this.release.material.opacity =
      this.lens === "structure" || this.lens === "certainty" ? 0.55 : 0.1;
    this.dataArc.material.opacity = this.lens === "data" ? 1 : 0.28;
  }

  private flash(visual: Visual, color: number, amount: number) {
    visual.glowColor.set(color);
    visual.glow = Math.max(visual.glow, amount);
  }

  // ---------- Layout and camera ----------

  private layout() {
    const kit = this.kit;
    if (!kit) return;
    for (const layer of LAYERS)
      this.layers[layer].position.y = kit.layerY(layer, this.explode);
    for (const visual of this.visuals.values())
      visual.object.position.y = visual.baseY + visual.lift;
    this.scene.updateMatrixWorld(true);

    const at = (id: string) => {
      const visual = this.visuals.get(id);
      return visual ? visual.object.localToWorld(visual.anchor.clone()) : null;
    };
    const arc = (
      from: THREE.Vector3 | null,
      to: THREE.Vector3 | null,
      line: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>,
      rise: number,
    ) => {
      line.visible = Boolean(from && to);
      if (!from || !to) return;
      const mid = from.clone().lerp(to, 0.5);
      mid.y += rise;
      line.geometry.setFromPoints(
        new THREE.QuadraticBezierCurve3(from, mid, to).getPoints(40),
      );
      line.computeLineDistances();
    };
    arc(at("controller"), at("gate:http"), this.beam, 0.6);
    arc(at("source"), at("gate:ssh"), this.release, 0.4);

    // The nightly copy leaves the disk for the off-site store.
    const volumes = [...this.visuals.values()].filter(
      (visual) => visual.kind === "volume",
    );
    const offsite = this.visuals.get("offsite");
    const to =
      offsite && offsite.certainty !== "absent" ? at("offsite") : null;
    this.dataArc.visible = Boolean(volumes.length && to);
    if (volumes.length && to) {
      const first = at(volumes[0].id)!;
      const last = at(volumes[volumes.length - 1].id)!;
      const points = [first];
      if (volumes.length > 1) points.push(last.clone().setY(last.y + 0.3));
      const mid = last.clone().lerp(to, 0.5);
      mid.y = Math.max(last.y, to.y) + 0.7;
      points.push(mid, to);
      this.dataArc.geometry.dispose();
      this.dataArc.geometry = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        64,
        0.04,
        8,
        false,
      );
    }
  }

  private updateCamera() {
    const distance = 24;
    const { azimuth, elevation } = this;
    this.camera.position.set(
      this.target.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      this.target.y + Math.sin(elevation) * distance,
      this.target.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    this.camera.lookAt(this.target);
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    this.camera.left = -this.halfHeight * aspect;
    this.camera.right = this.halfHeight * aspect;
    this.camera.top = this.halfHeight;
    this.camera.bottom = -this.halfHeight;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
    this.invalidate();
  }

  private toScreen(point: THREE.Vector3) {
    const projected = point.clone().project(this.camera);
    return {
      x: ((projected.x + 1) / 2) * this.host.clientWidth,
      y: ((1 - projected.y) / 2) * this.host.clientHeight,
    };
  }

  // ---------- Frames ----------

  private wake() {
    this.ambientUntil = this.time + 12;
    this.invalidate();
  }

  invalidate() {
    this.pending = true;
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (now: number) => {
    this.raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.pending = false;
    const busy = this.step(dt);
    this.renderer.render(this.scene, this.camera);
    this.callbacks.onFrame();
    if (busy || this.pending) this.raf = requestAnimationFrame(this.frame);
  };

  private step(dt: number) {
    let busy = false;
    let moved = false;
    const k = 1 - Math.exp(-9 * dt);
    for (const visual of this.visuals.values()) {
      visual.tint.lerp(visual.tintTarget, k);
      visual.mix = damp(visual.mix, visual.mixTarget, 9, dt);
      visual.fade = damp(visual.fade, visual.fadeTarget, 7, dt);
      const lift = damp(visual.lift, visual.liftTarget, 14, dt);
      if (Math.abs(lift - visual.lift) > 0.0005) moved = true;
      visual.lift = lift;
      visual.glow = damp(visual.glow, 0, 3.2, dt);
      const failed = visual.certainty === "failed";
      const pulse = visual.checking
        ? 0.28 + 0.2 * Math.sin(this.time * 9)
        : failed
          ? 0.22 + 0.18 * Math.sin(this.time * 4.2)
          : this.selected === visual.id
            ? 0.12
            : 0;
      const color =
        visual.glow > 0.05
          ? visual.glowColor
          : failed && !visual.checking
            ? RED
            : BLUE;
      const glow = Math.min(1, visual.glow + pulse) * 0.55;
      for (const look of visual.looks)
        paint(look, visual.fade, visual.tint, visual.mix, color, glow);
      if (
        visual.checking ||
        failed ||
        visual.glow > 0.01 ||
        visual.tint.getHex() !== visual.tintTarget.getHex() ||
        Math.abs(visual.mix - visual.mixTarget) > 0.003 ||
        Math.abs(visual.fade - visual.fadeTarget) > 0.003
      )
        busy = true;
    }
    for (const decor of this.decor) {
      const gap = Math.abs(decor.fade - decor.fadeTarget);
      if (gap < 0.0005) continue;
      decor.fade =
        gap < 0.003 ? decor.fadeTarget : damp(decor.fade, decor.fadeTarget, 7, dt);
      for (const look of decor.looks) paint(look, decor.fade);
      busy = true;
    }
    if (moved) {
      this.layout();
      busy = true;
    }
    if (Math.abs(this.azimuthVelocity) > 0.0001 && !this.drag) {
      this.azimuth = Math.max(
        -0.1,
        Math.min(1.45, this.azimuth + this.azimuthVelocity),
      );
      this.azimuthVelocity *= Math.exp(-5 * dt);
      this.updateCamera();
      busy = true;
    }
    // The scan sweeps from the cover down to the host.
    const top = this.layers.shell.position.y + this.roofLocal.y + 0.15;
    const targetY =
      this.scanTarget === null ? this.scanY : top - this.scanTarget * top;
    const targetOpacity = this.scanTarget === null ? 0 : 1;
    this.scanY = damp(this.scanY || top, targetY, 6, dt);
    this.scanOpacity = damp(this.scanOpacity, targetOpacity, 6, dt);
    this.scanPlane.position.y = this.scanY;
    this.scanEdge.position.y = this.scanY;
    this.scanPlane.material.opacity = this.scanOpacity * 0.1;
    this.scanEdge.material.opacity = this.scanOpacity * 0.85;
    if (
      Math.abs(this.scanOpacity - targetOpacity) > 0.01 ||
      Math.abs(this.scanY - targetY) > 0.01
    )
      busy = true;
    const stripes = this.dataArc.material.map;
    if (this.lens === "data" && this.dataArc.visible && stripes) {
      stripes.offset.x -= dt * 0.8;
      busy = true;
    }
    if (this.kit?.tick && this.time < this.ambientUntil && !reducedMotion())
      if (this.kit.tick(dt, this.time)) busy = true;
    return busy;
  }

  // ---------- Pointer ----------

  private pick(event: PointerEvent | MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const visual of this.visuals.values())
      if (visual.fade > 0.1) meshes.push(...visual.meshes);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    return (hit?.object.userData.partId as string | undefined) ?? null;
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.drag = { x: event.clientX, moved: false, id: event.pointerId };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.drag) {
      const dx = event.clientX - this.drag.x;
      if (Math.abs(dx) > 3) this.drag.moved = true;
      if (this.drag.moved) {
        const step = -dx * 0.006;
        this.azimuth = Math.max(-0.1, Math.min(1.45, this.azimuth + step));
        this.azimuthVelocity = step;
        this.drag.x = event.clientX;
        this.updateCamera();
        this.wake();
        this.renderer.domElement.style.cursor = "grabbing";
      }
      return;
    }
    const id = this.pick(event);
    this.renderer.domElement.style.cursor = id ? "pointer" : "grab";
    if (id !== this.hovered) this.callbacks.onHover(id);
  };

  private onPointerUp = (event: PointerEvent) => {
    const drag = this.drag;
    this.drag = null;
    if (this.renderer.domElement.hasPointerCapture(event.pointerId))
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    this.renderer.domElement.style.cursor = "grab";
    if (drag && !drag.moved) this.callbacks.onSelect(this.pick(event));
    this.invalidate();
  };

  private onPointerLeave = () => {
    if (!this.drag && this.hovered) this.callbacks.onHover(null);
  };

  private onDoubleClick = () => this.resetView();
}
