// PROTOTYPE · claude/architecture-directions · throwaway.
// The Three.js scene behind direction C: the one server as an assembly of
// trays (host, disk, private network, services) under a cover whose doors are
// the ways in. Explode pulls the trays apart; lenses re-light the same object
// to answer one question at a time. It renders only while something moves.

import * as THREE from "three";

import type { Certainty, PartKind } from "./model";

export type Lens = "structure" | "exposure" | "data" | "certainty";
type Layer = "base" | "disk" | "net" | "service" | "shell";

export interface ScenePart {
  id: string;
  kind: PartKind | "gap";
  certainty: Certainty;
  checking: boolean;
  owner?: string;
}

export interface SceneCallbacks {
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onFrame: () => void;
}

const COLOR = {
  edge: 0x56627a,
  host: 0xe4e9f1,
  tray: 0xedf1f7,
  drum: 0xd7dfeb,
  plate: 0xd8e4ff,
  app: 0xdce6fb,
  svc: 0xeef1f6,
  door: 0x3e4a60,
  shell: 0xf3f6fb,
  offsite: 0xe7ecf3,
  source: 0xffffff,
  controller: 0x2a3550,
  blue: 0x285ad8,
  sky: 0x46a2de,
  skyTint: 0xd6ecfa,
  verified: 0x14945f,
  verifiedTint: 0xd4efe2,
  stale: 0xb25a16,
  staleTint: 0xf7e3cf,
  failed: 0xa6312b,
  failedTint: 0xf6d8d5,
  unknown: 0x8b95a5,
  unknownTint: 0xf2f4f8,
  planned: 0x687183,
};

function layerY(layer: Layer, e: number) {
  switch (layer) {
    case "base":
      return 0;
    case "disk":
      return 0.5 + e * 0.95;
    case "net":
      return 1.1 + e * 1.95;
    case "service":
      return 1.16 + e * 1.95;
    case "shell":
      return 0.5 + e * 4.1;
  }
}

type FillMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
type EdgeLines = THREE.LineSegments<THREE.BufferGeometry, THREE.LineDashedMaterial>;

interface Visual {
  id: string;
  kind: ScenePart["kind"];
  layer: Layer;
  group: THREE.Group;
  fills: FillMesh[];
  lines: EdgeLines[];
  anchor: THREE.Vector3;
  base: number;
  certainty: Certainty;
  checking: boolean;
  color: THREE.Color;
  colorTarget: THREE.Color;
  edge: THREE.Color;
  edgeTarget: THREE.Color;
  opacity: number;
  opacityTarget: number;
  edgeOpacity: number;
  edgeOpacityTarget: number;
  lift: number;
  liftTarget: number;
  glow: number;
  glowColor: THREE.Color;
  hatch: boolean;
  baseY: number;
}

function fillMaterial(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0.02,
    transparent: true,
    emissive: new THREE.Color(0x000000),
  });
}

function edgesOf(geometry: THREE.BufferGeometry, threshold = 28): EdgeLines {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, threshold),
    new THREE.LineDashedMaterial({
      color: COLOR.edge,
      transparent: true,
      dashSize: 0.14,
      gapSize: 0,
    }),
  );
  lines.computeLineDistances();
  return lines;
}

function hatchTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4f6f9";
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = "#c3cbd8";
  ctx.lineWidth = 3;
  for (let i = -64; i < 128; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 64);
    ctx.lineTo(i + 64, 0);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function labelTexture(text: string, family: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#7a869b";
  ctx.font = `600 64px ${family}`;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 36, 84);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function shadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  gradient.addColorStop(0, "rgba(32,40,56,0.22)");
  gradient.addColorStop(0.6, "rgba(32,40,56,0.08)");
  gradient.addColorStop(1, "rgba(32,40,56,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export class AnatomyScene {
  private host: HTMLElement;
  private callbacks: SceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private layers: Record<Layer, THREE.Group>;
  private visuals = new Map<string, Visual>();
  private topology = "";
  private explode = 0;
  private lens: Lens = "structure";
  private hovered: string | null = null;
  private selected: string | null = null;
  private azimuth = 0.72;
  private azimuthVelocity = 0;
  private elevation = 0.5;
  private target = new THREE.Vector3(0.1, 2.7, 0);
  private halfHeight = 4.6;
  private raf = 0;
  private last = 0;
  private pending = false;
  private time = 0;
  private drag: { x: number; moved: boolean; id: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hatch = hatchTexture();
  private scanPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private scanEdge: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private scanTarget: number | null = null;
  private scanY = 0;
  private scanOpacity = 0;
  private beam: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private release: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private dataArc: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial> | null =
    null;
  private privateLink: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial> | null =
    null;
  private shellFill: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private shellEdges: EdgeLines;
  private netPlate: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private diskTray: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private hostLabel = "";
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

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd3dae6, 1.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(-6, 12, 9);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
    fill.position.set(9, 5, -6);
    this.scene.add(fill);

    this.layers = {
      base: new THREE.Group(),
      disk: new THREE.Group(),
      net: new THREE.Group(),
      service: new THREE.Group(),
      shell: new THREE.Group(),
    };
    for (const group of Object.values(this.layers)) this.scene.add(group);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, 7.5),
      new THREE.MeshBasicMaterial({
        map: shadowTexture(),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    this.layers.base.add(shadow);

    this.diskTray = new THREE.Mesh(
      new THREE.BoxGeometry(6.0, 0.05, 3.8),
      fillMaterial(COLOR.tray),
    );
    this.diskTray.material.opacity = 0.75;
    this.layers.disk.add(this.diskTray);

    this.netPlate = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 0.05, 3.6),
      fillMaterial(COLOR.plate),
    );
    this.netPlate.material.opacity = 0.5;
    this.netPlate.material.depthWrite = false;
    this.layers.net.add(this.netPlate);

    const shellGeometry = new THREE.BoxGeometry(6.6, 1.95, 4.4);
    this.shellFill = new THREE.Mesh(shellGeometry, fillMaterial(COLOR.shell));
    this.shellFill.material.opacity = 0.07;
    this.shellFill.material.depthWrite = false;
    this.shellFill.position.y = 0.975;
    this.shellEdges = edgesOf(shellGeometry);
    this.shellEdges.position.y = 0.975;
    this.shellEdges.material.opacity = 0.55;
    this.layers.shell.add(this.shellFill, this.shellEdges);

    this.scanPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 5.2),
      new THREE.MeshBasicMaterial({
        color: COLOR.blue,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.scanPlane.rotation.x = -Math.PI / 2;
    const scanShape = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-3.7, 0, -2.6),
      new THREE.Vector3(3.7, 0, -2.6),
      new THREE.Vector3(3.7, 0, 2.6),
      new THREE.Vector3(-3.7, 0, 2.6),
    ]);
    this.scanEdge = new THREE.LineLoop(
      scanShape,
      new THREE.LineBasicMaterial({
        color: COLOR.blue,
        transparent: true,
        opacity: 0,
      }),
    );
    this.scene.add(this.scanPlane, this.scanEdge);

    const dashed = (color: number) =>
      new THREE.LineDashedMaterial({
        color,
        dashSize: 0.16,
        gapSize: 0.12,
        transparent: true,
        opacity: 0.8,
      });
    this.beam = new THREE.Line(new THREE.BufferGeometry(), dashed(COLOR.blue));
    this.release = new THREE.Line(new THREE.BufferGeometry(), dashed(0x7c889d));
    this.scene.add(this.beam, this.release);

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

  setParts(parts: ScenePart[], hostLabel: string) {
    const topology = parts
      .map((part) => `${part.id}:${part.kind}:${part.owner ?? ""}`)
      .join("|");
    if (topology !== this.topology || hostLabel !== this.hostLabel) {
      this.topology = topology;
      this.hostLabel = hostLabel;
      this.rebuild(parts);
    }
    for (const part of parts) {
      const visual = this.visuals.get(part.id);
      if (!visual) continue;
      if (
        visual.certainty !== part.certainty &&
        visual.certainty !== undefined
      )
        this.flash(visual, this.certaintyEdge(part.certainty), 0.55);
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
        ? COLOR.blue
        : lens === "data"
          ? COLOR.sky
          : lens === "certainty"
            ? COLOR.verified
            : 0xffffff;
    for (const visual of this.visuals.values())
      if (this.inFocus(visual)) this.flash(visual, accent, 0.45);
    this.applyTargets();
    this.invalidate();
  }

  setExplode(value: number) {
    this.explode = value;
    this.layout();
    this.invalidate();
  }

  setHighlight(hovered: string | null, selected: string | null) {
    this.hovered = hovered;
    this.selected = selected;
    this.applyTargets();
    this.invalidate();
  }

  /** 0 = the cover, 1 = the host; null hides the scan. */
  setScan(progress: number | null) {
    this.scanTarget = progress;
    this.invalidate();
  }

  celebrate(ids: string[]) {
    for (const id of ids) {
      const visual = this.visuals.get(id);
      if (visual) this.flash(visual, COLOR.verified, 1);
    }
    this.invalidate();
  }

  /** Where a part's callout should point, in CSS pixels inside the host. */
  anchor(id: string) {
    const visual = this.visuals.get(id);
    if (!visual) return null;
    const point = visual.anchor.clone();
    visual.group.localToWorld(point);
    return this.toScreen(point);
  }

  /** The top of the cover: where the caretaker stands. */
  roof() {
    const shell = this.layers.shell;
    const point = new THREE.Vector3(-0.2, 1.95, 0.9);
    shell.localToWorld(point);
    return this.toScreen(point);
  }

  resetView() {
    this.azimuth = 0.72;
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
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose?.();
    });
    this.hatch.dispose();
    this.renderer.dispose();
    canvas.remove();
  }

  // ---------- Building ----------

  private rebuild(parts: ScenePart[]) {
    for (const visual of this.visuals.values())
      visual.group.parent?.remove(visual.group);
    this.visuals.clear();
    if (this.dataArc) this.layers.disk.remove(this.dataArc);
    if (this.privateLink) this.layers.net.remove(this.privateLink);

    const services = parts.filter((part) => part.kind === "private");
    const appX = -1.45;
    const serviceX = (i: number) =>
      services.length <= 1 ? 1.7 : 0.95 + (i * 1.5) / (services.length - 1);
    const xOf: Record<string, number> = { app: appX };
    services.forEach((service, i) => (xOf[service.id] = serviceX(i)));
    const volumeCount: Record<string, number> = {};

    for (const part of parts) {
      const group = new THREE.Group();
      let layer: Layer = "base";
      let base = COLOR.host;
      const fills: FillMesh[] = [];
      const lines: EdgeLines[] = [];
      let anchor = new THREE.Vector3();
      const addBox = (
        w: number,
        h: number,
        d: number,
        color: number,
        y = h / 2,
      ) => {
        const geometry = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geometry, fillMaterial(color));
        mesh.position.y = y;
        const edge = edgesOf(geometry);
        edge.position.y = y;
        group.add(mesh, edge);
        fills.push(mesh);
        lines.push(edge);
        return mesh;
      };
      switch (part.kind) {
        case "host": {
          layer = "base";
          base = COLOR.host;
          addBox(6.4, 0.5, 4.2, base);
          const label = new THREE.Mesh(
            new THREE.PlaneGeometry(6.0, 0.47),
            new THREE.MeshBasicMaterial({
              map: labelTexture(this.hostLabel.toUpperCase(), this.family),
              transparent: true,
              depthWrite: false,
            }),
          );
          label.position.set(0, 0.25, 2.101);
          group.add(label);
          anchor = new THREE.Vector3(-2.6, 0.5, 2.1);
          break;
        }
        case "volume": {
          layer = "disk";
          base = COLOR.drum;
          const owner = part.owner && xOf[part.owner] !== undefined ? part.owner : "app";
          const n = (volumeCount[owner] = (volumeCount[owner] ?? 0) + 1);
          group.position.set(xOf[owner], 0.03, 0.35 - (n - 1) * 1.15);
          const geometry = new THREE.CylinderGeometry(0.55, 0.55, 0.6, 48);
          const mesh = new THREE.Mesh(geometry, fillMaterial(base));
          mesh.position.y = 0.3;
          const edge = edgesOf(geometry, 30);
          edge.position.y = 0.3;
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.55, 0.018, 6, 48),
            new THREE.MeshBasicMaterial({ color: COLOR.edge }),
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.4;
          group.add(mesh, edge, ring);
          fills.push(mesh);
          lines.push(edge);
          anchor = new THREE.Vector3(0.4, 0.6, 0.4);
          break;
        }
        case "web": {
          layer = "service";
          base = COLOR.app;
          group.position.set(appX, 0, 0.15);
          addBox(2.0, 1.1, 1.6, base);
          const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.07, 1.6),
            new THREE.MeshBasicMaterial({ color: COLOR.blue }),
          );
          stripe.position.y = 1.135;
          group.add(stripe);
          anchor = new THREE.Vector3(0.6, 1.1, 0.8);
          break;
        }
        case "private": {
          layer = "service";
          base = COLOR.svc;
          group.position.set(xOf[part.id] ?? 1.7, 0, 0.15);
          addBox(1.6, 0.95, 1.4, base);
          anchor = new THREE.Vector3(0.5, 0.95, 0.7);
          break;
        }
        case "gate": {
          layer = "shell";
          base = COLOR.door;
          const http = part.id === "gate:http";
          group.position.set(http ? appX : -2.8, http ? 0.5 : 0.42, 2.2);
          addBox(http ? 0.58 : 0.42, http ? 0.86 : 0.6, 0.12, base, 0);
          anchor = new THREE.Vector3(0, http ? 0.43 : 0.3, 0.06);
          break;
        }
        case "tls": {
          layer = "shell";
          base = COLOR.planned;
          group.position.set(appX, 0.5, 2.62);
          const curve = new THREE.EllipseCurve(0, 0, 0.66, 0.66, 0, Math.PI * 2);
          const geometry = new THREE.BufferGeometry().setFromPoints(
            curve.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0)),
          );
          const ring = new THREE.LineSegments(
            geometry,
            new THREE.LineDashedMaterial({
              color: 0xb9c2d0,
              dashSize: 0.1,
              gapSize: 0.08,
              transparent: true,
            }),
          ) as EdgeLines;
          ring.computeLineDistances();
          const hit = new THREE.Mesh(
            new THREE.CircleGeometry(0.66, 32),
            fillMaterial(0xffffff),
          );
          hit.material.opacity = 0;
          hit.material.depthWrite = false;
          group.add(ring, hit);
          lines.push(ring);
          fills.push(hit);
          anchor = new THREE.Vector3(0.5, 0.5, 0);
          break;
        }
        case "gap": {
          layer = "shell";
          base = COLOR.planned;
          group.position.set(2.4, 1.95, -1.3);
          addBox(0.1, 0.62, 0.1, base, 0.31);
          const bulb = new THREE.SphereGeometry(0.18, 20, 14);
          const mesh = new THREE.Mesh(bulb, fillMaterial(base));
          mesh.position.y = 0.78;
          const edge = edgesOf(bulb, 40);
          edge.position.y = 0.78;
          group.add(mesh, edge);
          fills.push(mesh);
          lines.push(edge);
          anchor = new THREE.Vector3(0.15, 0.8, 0);
          break;
        }
        case "offsite": {
          layer = "disk";
          base = COLOR.offsite;
          group.position.set(4.9, 0.03, -0.4);
          addBox(1.25, 1.05, 1.05, base);
          const dial = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32),
            new THREE.MeshStandardMaterial({ color: 0xc3ccdb, roughness: 0.6 }),
          );
          dial.rotation.x = Math.PI / 2;
          dial.position.set(0, 0.55, 0.54);
          group.add(dial);
          anchor = new THREE.Vector3(0.4, 1.05, 0.52);
          break;
        }
        case "source": {
          layer = "service";
          base = COLOR.source;
          group.position.set(-4.75, 1.25, -0.6);
          group.rotation.y = 0.62;
          addBox(1.7, 1.05, 0.08, base, 0);
          const lines3 = new THREE.Group();
          for (let i = 0; i < 3; i++) {
            const bar = new THREE.Mesh(
              new THREE.BoxGeometry(i === 0 ? 1.1 : 0.8 - i * 0.12, 0.07, 0.02),
              new THREE.MeshBasicMaterial({ color: i === 0 ? 0x2a3550 : 0xb9c2d0 }),
            );
            bar.position.set(-0.25 + (i === 0 ? 0.15 : 0), 0.24 - i * 0.2, 0.05);
            lines3.add(bar);
          }
          group.add(lines3);
          anchor = new THREE.Vector3(-0.5, 0.52, 0);
          break;
        }
        case "controller": {
          layer = "base";
          base = COLOR.controller;
          group.position.set(-4.4, 0, 2.55);
          const stem = new THREE.CylinderGeometry(0.05, 0.05, 0.85, 12);
          const stemMesh = new THREE.Mesh(stem, fillMaterial(0x7c889d));
          stemMesh.position.y = 0.42;
          const head = new THREE.SphereGeometry(0.22, 24, 16);
          const headMesh = new THREE.Mesh(head, fillMaterial(base));
          headMesh.position.y = 0.95;
          const foot = new THREE.Mesh(
            new THREE.RingGeometry(0.16, 0.3, 32),
            new THREE.MeshBasicMaterial({
              color: COLOR.controller,
              transparent: true,
              opacity: 0.35,
              side: THREE.DoubleSide,
            }),
          );
          foot.rotation.x = -Math.PI / 2;
          foot.position.y = 0.01;
          group.add(stemMesh, headMesh, foot);
          fills.push(stemMesh, headMesh);
          anchor = new THREE.Vector3(0, 1.0, 0);
          break;
        }
      }
      for (const mesh of fills) mesh.userData.partId = part.id;
      this.layers[layer].add(group);
      const color = new THREE.Color(base);
      const edge = new THREE.Color(COLOR.edge);
      this.visuals.set(part.id, {
        id: part.id,
        kind: part.kind,
        layer,
        group,
        fills,
        lines,
        anchor,
        base,
        certainty: part.certainty,
        checking: part.checking,
        color: color.clone(),
        colorTarget: color.clone(),
        edge: edge.clone(),
        edgeTarget: edge.clone(),
        opacity: 1,
        opacityTarget: 1,
        edgeOpacity: 0.9,
        edgeOpacityTarget: 0.9,
        lift: 0,
        liftTarget: 0,
        glow: 0,
        glowColor: new THREE.Color(0xffffff),
        hatch: false,
        baseY: group.position.y,
      });
    }

    // The private link between the application and what it calls.
    const called = parts.filter((part) => part.kind === "private");
    if (called.length) {
      const curve = new THREE.CatmullRomCurve3(
        [appX, ...called.map((part) => xOf[part.id])].map(
          (x) => new THREE.Vector3(x, 0.06, 0.15),
        ),
      );
      this.privateLink = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 32, 0.045, 8, false),
        new THREE.MeshBasicMaterial({
          color: COLOR.blue,
          transparent: true,
          opacity: 0.8,
        }),
      );
      this.layers.net.add(this.privateLink);
    }
    // The nightly copy leaves the disk for the off-site store.
    const offsite = this.visuals.get("offsite");
    const drums = [...this.visuals.values()].filter(
      (visual) => visual.kind === "volume",
    );
    if (offsite && drums.length && offsite.certainty !== "absent") {
      const from = drums[drums.length - 1].group.position;
      const to = offsite.group.position;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(drums[0].group.position.x, 0.65, from.z),
        new THREE.Vector3(from.x, 0.95, from.z),
        new THREE.Vector3((from.x + to.x) / 2 + 0.4, 1.35, (from.z + to.z) / 2),
        new THREE.Vector3(to.x - 0.3, 1.0, to.z),
      ]);
      const texture = (() => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 8;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#46a2de";
        ctx.fillRect(0, 0, 36, 8);
        const t = new THREE.CanvasTexture(canvas);
        t.wrapS = THREE.RepeatWrapping;
        t.repeat.set(14, 1);
        return t;
      })();
      this.dataArc = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 64, 0.04, 8, false),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          map: texture,
          transparent: true,
          opacity: 0.9,
        }),
      );
      this.layers.disk.add(this.dataArc);
    } else this.dataArc = null;

    this.layout();
    this.applyTargets();
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

  private certaintyEdge(certainty: Certainty) {
    return {
      verified: COLOR.verified,
      stale: COLOR.stale,
      failed: COLOR.failed,
      unknown: COLOR.unknown,
      planned: COLOR.planned,
      absent: 0xb9c2d0,
    }[certainty];
  }

  private applyTargets() {
    for (const visual of this.visuals.values()) {
      const ghost =
        visual.certainty === "planned" || visual.certainty === "absent";
      const focus = this.inFocus(visual);
      let color = visual.base;
      let edge = COLOR.edge;
      let opacity = 1;
      let edgeOpacity = 0.9;
      let hatch = false;
      if (this.lens === "certainty") {
        color = {
          verified: COLOR.verifiedTint,
          stale: COLOR.staleTint,
          failed: COLOR.failedTint,
          unknown: COLOR.unknownTint,
          planned: 0xffffff,
          absent: 0xffffff,
        }[visual.certainty];
        edge = this.certaintyEdge(visual.certainty);
        hatch = visual.certainty === "unknown";
      } else if (this.lens === "exposure" && visual.id === "gate:http")
        color = COLOR.blue;
      else if (this.lens === "data" && focus) {
        color = visual.kind === "volume" ? COLOR.skyTint : 0xe3f1fb;
        edge = 0x3f7fb8;
      }
      if (visual.kind === "controller" || visual.kind === "gate")
        color = this.lens === "exposure" && visual.id === "gate:http"
          ? COLOR.blue
          : this.lens === "certainty" && visual.kind === "gate"
            ? color
            : visual.base;
      if (!focus) {
        opacity = 0.14;
        edgeOpacity = 0.2;
      }
      if (ghost) {
        opacity = Math.min(opacity, 0.12);
        edgeOpacity = Math.min(edgeOpacity, 0.75);
        if (this.lens !== "certainty") edge = 0x8b95a5;
      }
      if (visual.certainty === "failed") edge = COLOR.failed;
      if (this.selected === visual.id) edge = COLOR.blue;
      visual.colorTarget.set(color);
      visual.edgeTarget.set(edge);
      visual.opacityTarget = opacity;
      visual.edgeOpacityTarget = edgeOpacity;
      visual.liftTarget =
        this.hovered === visual.id || this.selected === visual.id ? 0.14 : 0;
      if (visual.hatch !== hatch) {
        visual.hatch = hatch;
        for (const mesh of visual.fills) {
          mesh.material.map = hatch ? this.hatch : null;
          mesh.material.needsUpdate = true;
        }
      }
      for (const line of visual.lines) {
        line.material.gapSize = ghost ? 0.1 : 0;
        line.material.dashSize = ghost ? 0.13 : 0.14;
      }
    }
    const exposure = this.lens === "exposure";
    const data = this.lens === "data";
    this.beam.material.opacity = exposure ? 0.95 : 0.12;
    this.release.material.opacity =
      this.lens === "structure" || this.lens === "certainty" ? 0.55 : 0.1;
    if (this.dataArc) this.dataArc.material.opacity = data ? 1 : 0.28;
    if (this.privateLink)
      this.privateLink.material.opacity = exposure || data ? 0.2 : 0.8;
    this.netPlate.material.opacity = data ? 0.15 : 0.5;
    this.shellEdges.material.opacity = exposure ? 0.9 : 0.5;
  }

  private flash(visual: Visual, color: number, amount: number) {
    visual.glowColor.set(color);
    visual.glow = Math.max(visual.glow, amount);
  }

  // ---------- Layout and camera ----------

  private layout() {
    const e = this.explode;
    for (const layer of Object.keys(this.layers) as Layer[])
      this.layers[layer].position.y = layerY(layer, e);
    for (const visual of this.visuals.values())
      visual.group.position.y = visual.baseY + visual.lift;

    const point = (id: string, local: THREE.Vector3) => {
      const visual = this.visuals.get(id);
      if (!visual) return null;
      return visual.group.localToWorld(local.clone());
    };
    this.scene.updateMatrixWorld(true);
    const controller = point("controller", new THREE.Vector3(0, 0.95, 0));
    const http = point("gate:http", new THREE.Vector3(0, 0, 0.06));
    if (controller && http) {
      const mid = controller.clone().lerp(http, 0.5);
      mid.y += 0.6;
      const curve = new THREE.QuadraticBezierCurve3(controller, mid, http);
      this.beam.geometry.setFromPoints(curve.getPoints(40));
      this.beam.computeLineDistances();
    }
    const source = point("source", new THREE.Vector3(0.8, 0, 0));
    const ssh = point("gate:ssh", new THREE.Vector3(0, 0, 0.06));
    if (source && ssh) {
      const mid = source.clone().lerp(ssh, 0.5);
      mid.y += 0.4;
      const curve = new THREE.QuadraticBezierCurve3(source, mid, ssh);
      this.release.geometry.setFromPoints(curve.getPoints(40));
      this.release.computeLineDistances();
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
    for (const visual of this.visuals.values()) {
      const before = visual.color.getHex() + visual.edge.getHex();
      visual.color.lerp(visual.colorTarget, 1 - Math.exp(-9 * dt));
      visual.edge.lerp(visual.edgeTarget, 1 - Math.exp(-9 * dt));
      visual.opacity = damp(visual.opacity, visual.opacityTarget, 9, dt);
      visual.edgeOpacity = damp(
        visual.edgeOpacity,
        visual.edgeOpacityTarget,
        9,
        dt,
      );
      const lift = damp(visual.lift, visual.liftTarget, 14, dt);
      if (Math.abs(lift - visual.lift) > 0.0005) moved = true;
      visual.lift = lift;
      visual.glow = damp(visual.glow, 0, 3.2, dt);
      let pulse = 0;
      if (visual.certainty === "failed")
        pulse = 0.22 + 0.18 * Math.sin(this.time * 4.2);
      if (visual.checking) pulse = 0.28 + 0.2 * Math.sin(this.time * 9);
      const glow = Math.min(1, visual.glow + pulse);
      const glowColor =
        visual.checking && visual.glow < 0.05
          ? new THREE.Color(COLOR.blue)
          : visual.certainty === "failed" && visual.glow < 0.05
            ? new THREE.Color(COLOR.failed)
            : visual.glowColor;
      for (const mesh of visual.fills) {
        if (mesh.material.opacity === 0 && visual.kind === "tls") continue;
        mesh.material.color.copy(visual.color);
        mesh.material.opacity = visual.opacity;
        mesh.material.emissive.copy(glowColor).multiplyScalar(glow * 0.55);
        mesh.material.depthWrite = visual.opacity > 0.6;
      }
      for (const line of visual.lines) {
        line.material.color.copy(visual.edge);
        line.material.opacity = visual.edgeOpacity;
      }
      if (
        before !== visual.color.getHex() + visual.edge.getHex() ||
        Math.abs(visual.opacity - visual.opacityTarget) > 0.004 ||
        Math.abs(visual.edgeOpacity - visual.edgeOpacityTarget) > 0.004 ||
        visual.glow > 0.01 ||
        pulse > 0
      )
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
    const top = layerY("shell", this.explode) + 2.1;
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
    if (this.dataArc && this.lens === "data" && this.dataArc.material.map) {
      this.dataArc.material.map.offset.x -= dt * 0.8;
      busy = true;
    }
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
      if (visual.opacity > 0.1 || visual.kind === "tls" || visual.certainty === "absent" || visual.certainty === "planned")
        meshes.push(...visual.fills);
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
        this.invalidate();
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
