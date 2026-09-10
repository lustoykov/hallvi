"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// A bench for 3D model styles ("kits") of direction C: one kit at a time,
// the real parts of the Grafana + Prometheus record, an explode slider, orbit
// controls and anchor markers. Route: /prototype/anatomy-kits?kit=<name>

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import type { Kit, KitContext, KitLayer } from "./anatomy-kit";

export const DEMO_CONTEXT: Omit<KitContext, "font"> = {
  hostLabel: "Hetzner CX23 · Falkenstein",
  parts: [
    { id: "controller", kind: "controller", label: "Server Guy" },
    { id: "source", kind: "source", label: "lustoykov/server-guy" },
    { id: "gate:http", kind: "gate", label: "Port 80" },
    { id: "gate:ssh", kind: "gate", label: "Port 22" },
    { id: "tls", kind: "tls", label: "HTTPS" },
    { id: "host", kind: "host", label: "Hetzner CX23" },
    { id: "app", kind: "web", label: "Grafana" },
    {
      id: "svc:prometheus",
      kind: "private",
      owner: "app",
      label: "Prometheus",
    },
    {
      id: "vol:grafana-data",
      kind: "volume",
      owner: "app",
      label: "grafana.db",
    },
    {
      id: "vol:metrics",
      kind: "volume",
      owner: "svc:prometheus",
      label: "Metrics",
    },
    { id: "offsite", kind: "offsite", label: "Cloudflare R2" },
    { id: "gap:monitoring", kind: "gap", label: "Monitoring" },
  ],
};

const LAYERS: KitLayer[] = ["base", "disk", "net", "service", "shell"];
const KITS = ["sketch", "chassis", "clay", "glass"];

type Live = { explode: number; anchors: boolean; spin: boolean };

function mount(element: HTMLDivElement, kit: Kit, live: { current: Live }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.display = "block";
  element.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const disposeStage = kit.stage(scene, renderer);
  const ctx: KitContext = {
    ...DEMO_CONTEXT,
    font: getComputedStyle(document.body).fontFamily || "system-ui",
  };
  const groups = Object.fromEntries(
    LAYERS.map((layer) => [layer, new THREE.Group()]),
  ) as Record<KitLayer, THREE.Group>;
  for (const layer of LAYERS) scene.add(groups[layer]);
  const decor = kit.decor(ctx);
  for (const layer of LAYERS)
    for (const object of decor[layer] ?? []) groups[layer].add(object);
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0xff2d6f,
    depthTest: false,
  });
  const markerGeometry = new THREE.SphereGeometry(0.07, 12, 8);
  const markers: THREE.Mesh[] = [];
  for (const part of ctx.parts) {
    const built = kit.part(part, ctx);
    groups[built.layer].add(built.object);
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(built.anchor);
    marker.renderOrder = 99;
    built.object.add(marker);
    markers.push(marker);
  }
  const frame = kit.frame ?? { target: [0.1, 2.7, 0], halfHeight: 4.6 };
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const [tx, ty, tz] = frame.target;
  camera.position.set(tx + 15.5, ty + 12, tz + 17.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(tx, ty, tz);
  controls.enableDamping = true;
  controls.enablePan = false;
  const resize = () => {
    const width = Math.max(1, element.clientWidth);
    const height = Math.max(1, element.clientHeight);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.left = -frame.halfHeight * aspect;
    camera.right = frame.halfHeight * aspect;
    camera.top = frame.halfHeight;
    camera.bottom = -frame.halfHeight;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(element);
  resize();
  let raf = 0;
  let last = performance.now();
  const loop = (time: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (time - last) / 1000);
    last = time;
    for (const layer of LAYERS)
      groups[layer].position.y = kit.layerY(layer, live.current.explode);
    for (const marker of markers) marker.visible = live.current.anchors;
    kit.tick?.(dt, time / 1000);
    controls.autoRotate = live.current.spin;
    controls.update();
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    controls.dispose();
    disposeStage();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose?.();
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}

export function KitHarness() {
  const [name, setName] = useState<string | null>(null);
  const [explode, setExplode] = useState(0.65);
  const [anchors, setAnchors] = useState(true);
  const [spin, setSpin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<Live>({ explode: 0.65, anchors: true, spin: false });
  useEffect(() => {
    live.current = { explode, anchors, spin };
  }, [explode, anchors, spin]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setName(params.get("kit") ?? "sketch");
      const e = Number(params.get("explode"));
      if (params.has("explode") && Number.isFinite(e)) setExplode(e);
      if (params.get("anchors") === "0") setAnchors(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const element = host.current;
    if (!element || !name) return;
    let cancelled = false;
    let teardown = () => {};
    import(`./kits/${name}`)
      .then((module: { default: Kit }) => {
        if (cancelled) return;
        setError(null);
        teardown = mount(element, module.default, live);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(String(failure));
      });
    return () => {
      cancelled = true;
      teardown();
    };
  }, [name]);
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "20px 28px",
        background: "#f7f8fa",
        color: "#202838",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      }}
    >
      <header
        style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}
      >
        <strong style={{ fontSize: 18 }}>Exploded server · model bench</strong>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#fff8f0",
            border: "1px solid #f0dcc4",
            color: "#9a4b10",
          }}
        >
          Prototype
        </span>
        <nav style={{ display: "flex", gap: 6 }}>
          {KITS.map((kit) => (
            <button
              key={kit}
              type="button"
              onClick={() => {
                setName(kit);
                const url = new URL(window.location.href);
                url.searchParams.set("kit", kit);
                window.history.replaceState(null, "", url);
              }}
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                border: "1px solid #d8dee8",
                background: kit === name ? "#202838" : "#fff",
                color: kit === name ? "#fff" : "#202838",
                font: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {kit}
            </button>
          ))}
        </nav>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          Apart
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explode}
            onChange={(event) => setExplode(Number(event.target.value))}
          />
          {explode.toFixed(2)}
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={anchors}
            onChange={(event) => setAnchors(event.target.checked)}
          />
          anchors
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={spin}
            onChange={(event) => setSpin(event.target.checked)}
          />
          spin
        </label>
      </header>
      {error && (
        <pre style={{ color: "#a6312b", whiteSpace: "pre-wrap", fontSize: 12 }}>
          {error}
        </pre>
      )}
      <div
        ref={host}
        data-kit={name ?? ""}
        style={{
          marginTop: 14,
          height: 700,
          borderRadius: 16,
          border: "1px solid #e7e9ee",
          background: "#fbfcfe",
          overflow: "hidden",
        }}
      />
    </main>
  );
}
