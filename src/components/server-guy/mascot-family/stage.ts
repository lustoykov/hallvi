import * as THREE from "three";

import { buildRig, type Rig } from "./build";
import {
  actionDuration,
  applyPose,
  idleAllowed,
  type Action,
  type ActionKind,
  type Mood,
} from "./pose";
import type { FamilyId } from "./roster";

/**
 * Renderers for the family. A live stage owns one WebGL context, renders
 * only while visible, and releases the context on dispose. Stills come from
 * one shared offscreen renderer and are cached as data URLs, so the page
 * stays well under the browser's limit of live WebGL contexts.
 */

export type Framing = "stage" | "walker" | "icon";

const FOV = 32;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
/** Little Server's camera: (0.8, 1.95, 6.25) looking at (0, 1.05, 0). */
const VIEW = new THREE.Vector3(0.8, 0.9, 6.25);
const VIEW_DIR = VIEW.clone().normalize();
const VIEW_DIST = VIEW.length();
const ICON_DIR = new THREE.Vector3(0.3, 0.55, 6.25).normalize();

function frameCamera(
  camera: THREE.PerspectiveCamera,
  rig: Rig,
  framing: Framing,
) {
  const aspect = camera.aspect;
  let target: THREE.Vector3;
  let dist: number;
  if (framing === "icon") {
    // Tight and nearly frontal: the whole character fills the tile.
    const h = rig.top + 0.1;
    target = new THREE.Vector3(0, h / 2, 0);
    dist = Math.max(h / 2 / TAN, (rig.frame.w * 0.46) / (TAN * aspect)) * 1.02;
    camera.position.copy(target).addScaledVector(ICON_DIR, dist);
  } else {
    // Little Server's framing, scaled to each body so small cousins read
    // as small.
    const fill = framing === "walker" ? 0.94 : 0.86;
    target = new THREE.Vector3(0, rig.frame.h * 0.51, 0);
    dist = Math.max(
      VIEW_DIST * (rig.frame.h / 2.05) * fill,
      (rig.frame.w / 2 / (TAN * aspect)) * 1.1,
    );
    camera.position.copy(target).addScaledVector(VIEW_DIR, dist);
  }
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** Little Server's lights, floor and tone mapping. */
function createWorld() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x647089, 2.2));
  const light = new THREE.DirectionalLight(0xffffff, 3.3);
  light.position.set(-3, 6, 4);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.normalBias = 0.03;
  scene.add(light);
  const fill = new THREE.DirectionalLight(0xddeaff, 1.4);
  fill.position.set(3, 3, -4);
  scene.add(fill);
  const floorGeo = new THREE.PlaneGeometry(200, 200);
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.14 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.position.y = 0.015;
  scene.add(floor);
  return {
    scene,
    floor,
    dispose() {
      floorGeo.dispose();
      floorMat.dispose();
      light.shadow.map?.dispose();
    },
  };
}

function createRenderer(preserve: boolean) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: preserve,
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

export class MascotStage {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly world = createWorld();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  private rig: Rig | null = null;
  private mood: Mood = "ready";
  private moodStart = 0;
  private action: Action | null = null;
  private still = false;
  private readonly pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private readonly press = { x: 0, v: 0, held: false };
  private walk = 0;
  private look = false;
  private readonly offset = Math.random() * 5000;
  private host: HTMLElement | null = null;
  private track: HTMLElement | null = null;
  private resizer: ResizeObserver | null = null;
  private watcher: IntersectionObserver | null = null;
  private visible = true;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private fov = FOV;
  private settle = 0;

  private constructor(private readonly framing: Framing) {
    this.renderer = createRenderer(false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute("aria-hidden", "true");
  }

  /** Null when the browser cannot give us a WebGL context. */
  static create(framing: Framing = "stage") {
    try {
      return new MascotStage(framing);
    } catch {
      return null;
    }
  }

  mount(host: HTMLElement, track: HTMLElement = host) {
    if (this.host === host) return;
    this.unmount();
    this.host = host;
    this.track = track;
    host.appendChild(this.canvas);
    this.resizer = new ResizeObserver(() => this.resize());
    this.resizer.observe(host);
    this.watcher = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.dirty = true;
    });
    this.watcher.observe(host);
    track.addEventListener("pointermove", this.onMove);
    track.addEventListener("pointerleave", this.onLeave);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  unmount() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizer?.disconnect();
    this.watcher?.disconnect();
    this.track?.removeEventListener("pointermove", this.onMove);
    this.track?.removeEventListener("pointerleave", this.onLeave);
    this.canvas.remove();
    this.host = this.track = null;
    this.pointer.x = this.pointer.y = this.pointer.tx = this.pointer.ty = 0;
  }

  dispose() {
    this.unmount();
    clearTimeout(this.settle);
    this.rig?.dispose();
    this.rig = null;
    this.world.dispose();
    this.renderer.dispose();
    // Release the context now rather than at garbage collection.
    this.renderer.forceContextLoss();
  }

  setMember(id: FamilyId) {
    if (this.rig?.id === id) return;
    if (this.rig) {
      this.world.scene.remove(this.rig.body);
      this.rig.dispose();
    }
    this.rig = buildRig(id);
    this.world.scene.add(this.rig.body);
    this.action = null;
    this.reframe();
    this.dirty = true;
  }

  /**
   * `replay` restarts the mood's entrance, e.g. the wave before the waiting
   * card.
   */
  setMood(mood: Mood, replay = false) {
    if (mood === this.mood && !replay) return;
    this.mood = mood;
    this.moodStart = performance.now();
    this.dirty = true;
  }

  setStill(still: boolean) {
    this.still = still;
    this.press.v = 0;
    this.dirty = true;
  }

  setWalk(direction: number) {
    this.walk = direction;
    this.dirty = true;
  }

  setLook(look: boolean) {
    this.look = look;
    this.dirty = true;
  }

  /**
   * Starts a reaction and returns its length in ms, or 0 when it does not
   * apply.
   */
  play(kind: ActionKind): number {
    if (!this.rig) return 0;
    if (kind === "idle" && !idleAllowed(this.mood)) return 0;
    const duration = actionDuration(kind, this.rig.id, this.still);
    if (!duration) return 0;
    this.action = { kind, start: performance.now(), duration };
    this.dirty = true;
    // A still pose re-renders once when the reaction ends.
    clearTimeout(this.settle);
    this.settle = window.setTimeout(() => (this.dirty = true), duration + 40);
    return duration;
  }

  /** The reaction in progress, if any. */
  current() {
    const a = this.action;
    return a && performance.now() < a.start + a.duration
      ? { kind: a.kind, until: a.start + a.duration }
      : null;
  }

  /**
   * Stops a small reaction when the state changes; dances and celebrations
   * finish.
   */
  interrupt() {
    const a = this.current();
    if (a && (a.kind === "poke" || a.kind === "idle" || a.kind === "flinch")) {
      this.action = null;
      this.dirty = true;
    }
  }

  pressStart() {
    this.press.held = true;
    this.dirty = true;
  }

  /** Returns whether a press was in progress. */
  pressEnd() {
    const was = this.press.held;
    this.press.held = false;
    this.dirty = true;
    return was;
  }

  /** A keyboard poke: a quick squash and rebound without a held press. */
  bounce() {
    if (!this.still) this.press.v = 9;
    this.dirty = true;
  }

  private onMove = (e: PointerEvent) => {
    const r = this.host?.getBoundingClientRect();
    if (!r) return;
    this.pointer.tx = THREE.MathUtils.clamp(
      (e.clientX - r.left) / r.width - 0.5,
      -0.7,
      0.7,
    );
    this.pointer.ty = THREE.MathUtils.clamp(
      (e.clientY - r.top) / r.height - 0.5,
      -0.6,
      0.9,
    );
  };

  private onLeave = () => {
    this.pointer.tx = 0;
    this.pointer.ty = 0;
  };

  private resize() {
    const host = this.host;
    if (!host) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.reframe();
    this.dirty = true;
  }

  private reframe() {
    if (!this.rig || !this.host) return;
    frameCamera(this.camera, this.rig, this.framing);
    // Anchor points for the DOM overlays: sparkles above the head, the z's
    // and the floor line.
    const { width, height } = this.host.getBoundingClientRect();
    const at = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(this.camera);
      return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
    };
    const [hx, hy] = at(0, this.rig.top + 0.05, 0);
    const [zx, zy] = at(this.rig.frame.w * 0.3, this.rig.top * 0.96, 0);
    const [, fy] = at(0, 0, 0.3);
    const s = this.host.style;
    s.setProperty("--mf-head-x", `${hx.toFixed(1)}px`);
    s.setProperty("--mf-head-y", `${hy.toFixed(1)}px`);
    s.setProperty("--mf-z-x", `${zx.toFixed(1)}px`);
    s.setProperty("--mf-z-y", `${zy.toFixed(1)}px`);
    s.setProperty("--mf-floor-y", `${fy.toFixed(1)}px`);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const rig = this.rig;
    if (!rig || !this.visible || document.hidden) {
      this.last = now;
      return;
    }
    const dt = Math.min(64, now - this.last);
    this.last = now;
    if (this.still && !this.dirty) return;
    this.dirty = false;

    const p = this.pointer;
    const follow = this.still ? 0 : 1 - Math.pow(0.85, dt / 16.67);
    p.x = this.still ? 0 : p.x + (p.tx - p.x) * follow;
    p.y = this.still ? 0 : p.y + (p.ty - p.y) * follow;

    // Press: a damped spring that squashes on press and overshoots on release.
    const pr = this.press;
    const target = pr.held ? 1 : 0;
    if (this.still) {
      pr.x = target * 0.6;
    } else {
      const s = dt / 1000;
      pr.v += (520 * (target - pr.x) - 16 * pr.v) * s;
      pr.x = THREE.MathUtils.clamp(pr.x + pr.v * s, -0.5, 1.25);
    }

    const action = this.current() ? this.action : null;
    if (!action) this.action = null;
    const result = applyPose(rig, {
      t: now,
      dt,
      mood: this.mood,
      moodElapsed: now - this.moodStart,
      still: this.still,
      px: p.x,
      py: p.y,
      squash: pr.x,
      action,
      walk: this.walk,
      look: this.look,
      offset: this.offset,
    });
    // Tricks widen the lens, as Little Server's do.
    const fov = result.trick ? 43 : FOV;
    this.fov = this.still ? fov : THREE.MathUtils.lerp(this.fov, fov, 0.12);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.world.scene, this.camera);
    const host = this.host;
    if (host) {
      if (host.dataset.face !== result.face) host.dataset.face = result.face;
      const nap = result.nap ? "1" : "0";
      if (host.dataset.nap !== nap) host.dataset.nap = nap;
    }
  };
}

type SnapshotRequest = {
  id: FamilyId;
  mood: Mood;
  width: number;
  height: number;
  framing: Framing;
};
const keyOf = (r: SnapshotRequest) =>
  `${r.id}|${r.mood}|${r.width}x${r.height}|${r.framing}`;

/**
 * One offscreen renderer that poses a character once and returns a PNG
 * data URL.
 */
class Snapshots {
  private renderer: THREE.WebGLRenderer | null = null;
  private world: ReturnType<typeof createWorld> | null = null;
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  private readonly rigs = new Map<FamilyId, Rig>();
  private readonly cache = new Map<string, string>();
  private readonly queue = new Map<
    string,
    { req: SnapshotRequest; done: ((url: string | null) => void)[] }
  >();
  private timer = 0;
  private broken = false;

  peek(r: SnapshotRequest) {
    return this.cache.get(keyOf(r)) ?? null;
  }

  request(r: SnapshotRequest): Promise<string | null> {
    const key = keyOf(r);
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve) => {
      const job = this.queue.get(key);
      if (job) job.done.push(resolve);
      else this.queue.set(key, { req: r, done: [resolve] });
      if (!this.timer) this.timer = requestAnimationFrame(this.drain);
    });
  }

  /** A few renders per frame so a state change never stalls the page. */
  private drain = () => {
    this.timer = 0;
    const start = performance.now();
    for (const [key, job] of this.queue) {
      this.queue.delete(key);
      const url = this.render(job.req);
      if (url) this.cache.set(key, url);
      job.done.forEach((f) => f(url));
      if (performance.now() - start > 14) break;
    }
    if (this.queue.size) this.timer = requestAnimationFrame(this.drain);
  };

  private render(r: SnapshotRequest): string | null {
    if (this.broken) return null;
    if (!this.renderer || !this.world) {
      try {
        this.renderer = createRenderer(true);
        this.world = createWorld();
      } catch {
        this.broken = true;
        return null;
      }
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    let rig = this.rigs.get(r.id);
    if (!rig) {
      rig = buildRig(r.id);
      this.rigs.set(r.id, rig);
    }
    this.world.scene.add(rig.body);
    this.world.floor.visible = r.framing !== "icon";
    applyPose(rig, {
      t: 1000,
      dt: 16,
      mood: r.mood,
      moodElapsed: 5000,
      still: true,
      px: 0,
      py: 0,
      squash: 0,
      action: null,
      walk: 0,
      look: false,
      offset: 0,
    });
    frameCamera(this.camera, rig, r.framing);
    this.renderer.render(this.world.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.world.scene.remove(rig.body);
    return url;
  }

  dispose() {
    cancelAnimationFrame(this.timer);
    this.rigs.forEach((rig) => rig.dispose());
    this.rigs.clear();
    this.world?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}

// One instance per page; a hot reload of this module releases the previous
// context.
const store = globalThis as typeof globalThis & {
  __mascotFamilySnapshots?: Snapshots;
};
store.__mascotFamilySnapshots?.dispose();
store.__mascotFamilySnapshots = undefined;

export function snapshots(): Snapshots {
  return (store.__mascotFamilySnapshots ??= new Snapshots());
}
