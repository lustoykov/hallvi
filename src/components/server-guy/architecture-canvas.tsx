"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowCounterClockwise, Pause, Play } from "@phosphor-icons/react";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationRecord } from "@/server/types";

type Point = { x: number; y: number };
const initialPositions: Record<string, Point> = {
  source: { x: 48, y: 138 },
  app: { x: 365, y: 224 },
  host: { x: 686, y: 138 },
  database: { x: 365, y: 448 },
  cache: { x: 48, y: 448 },
  workers: { x: 686, y: 448 },
};
const WIDTH = 960,
  HEIGHT = 650,
  NODE_WIDTH = 224,
  NODE_HEIGHT = 112;
const bounded = (p: Point) => ({
  x: Math.max(16, Math.min(WIDTH - NODE_WIDTH - 16, p.x)),
  y: Math.max(20, Math.min(HEIGHT - NODE_HEIGHT - 20, p.y)),
});

export function ArchitectureCanvas({
  application,
  deployment,
  stack,
}: {
  application: ApplicationRecord;
  deployment: DeploymentRecord | null;
  /** Recorded services beyond the web process appear as their own nodes. */
  stack?: ApplicationStack;
}) {
  const storageKey = `sg:architecture:v1:${application.id}`;
  const [positions, setPositions] = useState(initialPositions);
  const [motion, setMotion] = useState(true);
  const [selected, setSelected] = useState("app");
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; offset: Point } | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        if (!saved) return;
        const next = { ...initialPositions };
        for (const id of Object.keys(next)) {
          const p = saved[id];
          if (Number.isFinite(p?.x) && Number.isFinite(p?.y))
            next[id] = bounded(p);
        }
        setPositions(next);
      } catch {
        /* Browser storage is optional; default layout remains usable. */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);
  function save(next: Record<string, Point>) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* optional */
    }
  }
  function point(event: PointerEvent<SVGGElement>) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
  }
  const live = deployment?.status === "live";
  const postgres = deployment?.plan?.postgres;
  const sqlite = stack?.databases.find((item) => item.kind === "sqlite");
  const service = stack?.services[0];
  const workers = stack?.processes.filter((item) => item.role === "worker");
  const nodes = [
    {
      id: "source",
      label: "GitHub repository",
      name: application.repositoryName,
      detail: deployment?.revision?.slice(0, 12) ?? "Revision not selected",
      symbol: "source",
      description: `${application.repositoryOwner}/${application.repositoryName}. ${deployment?.revision ? `Selected revision: ${deployment.revision}.` : "A revision will be selected during deployment."}`,
    },
    {
      id: "app",
      label: "Application",
      name: application.name,
      detail: live ? "Last deployment verified" : "Deployment not verified",
      symbol: "app",
      description: deployment?.url
        ? `Public address: ${deployment.url}. ${deployment?.verifiedAt ? `Last verified ${new Date(deployment.verifiedAt).toLocaleString()}.` : "Not externally verified yet."}`
        : "Your application's runtime will appear here once a deployment is recorded.",
    },
    {
      id: "host",
      label: "Hetzner instance",
      name: deployment?.offer?.serverType.toUpperCase() ?? "Host not selected",
      detail: deployment?.address ?? "No instance recorded",
      symbol: "host",
      description: deployment?.serverId
        ? `Server ${deployment.serverId}, ${deployment.address}. ${deployment.offer?.cores} vCPU, ${deployment.offer?.memory} GB RAM. Docker Compose runs the application services on this host.`
        : "No server has been recorded. Host selection and purchase remain part of deployment approval.",
    },
    ...(postgres
      ? [
          {
            id: "database",
            label: "Database",
            name: `PostgreSQL ${postgres.version}`,
            detail: live
              ? "Persistent volume · private network"
              : "Planned service",
            symbol: "database",
            description: live
              ? "Runs on the same instance as the application. Its data uses a persistent Docker volume. Off-host backups are not configured."
              : "Planned to run on the same instance as the application with a persistent Docker volume. Off-host backups are not configured.",
          },
        ]
      : sqlite
        ? [
            {
              id: "database",
              label: "Database",
              name: "Embedded SQLite",
              detail: sqlite.location,
              symbol: "database",
              description:
                "Application-owned SQLite file inside the application's persistent files. Protected together with those files, never as a live copy.",
            },
          ]
        : []),
    ...(service
      ? [
          {
            id: "cache",
            label: service.role === "cache" ? "Cache" : "Cache & queue",
            name: `${service.kind === "valkey" ? "Valkey" : "Redis"}${service.version ? ` ${service.version}` : ""}`,
            detail: live ? "Private network" : "Planned service",
            symbol: "cache",
            description: `${service.role === "broker" ? "Queue broker" : service.role === "cache" ? "Cache" : "Cache and queue broker"} on the same instance, reachable only inside the Compose network. ${service.persistence ?? "Persistence not recorded."}`,
          },
        ]
      : []),
    ...(workers?.length
      ? [
          {
            id: "workers",
            label: "Workers",
            name:
              workers.length === 1
                ? workers[0].name
                : `${workers.length} worker processes`,
            detail: live ? "Same image as the application" : "Planned",
            symbol: "workers",
            description: `${workers.map((worker) => worker.name).join(", ")}: background processes that consume queued work on this instance.`,
          },
        ]
      : []),
  ];
  const edges = [
    {
      from: "source",
      to: "app",
      label: "Build from revision",
      vertical: false,
    },
    { from: "app", to: "host", label: "Docker Compose", vertical: false },
    ...(postgres || sqlite
      ? [
          {
            from: "app",
            to: "database",
            label: postgres ? "Private network" : "Application files",
            vertical: true,
          },
        ]
      : []),
    ...(service
      ? [{ from: "app", to: "cache", label: "Private network", vertical: true }]
      : []),
    ...(workers?.length
      ? [
          {
            from: "app",
            to: "workers",
            label: service ? "Queued work" : "Background work",
            vertical: true,
          },
        ]
      : []),
  ];
  const active = nodes.find((node) => node.id === selected) ?? nodes[1];
  return (
    <div className="sg-architecture-view">
      <div className="sg-canvas-toolbar">
        <span>Drag to arrange · arrow keys to move a focused node</span>
        <div>
          <button onClick={() => setMotion(!motion)} aria-pressed={!motion}>
            {motion ? <Pause /> : <Play />}
            {motion ? "Pause motion" : "Resume motion"}
          </button>
          <button
            onClick={() => {
              setPositions(initialPositions);
              save(initialPositions);
            }}
          >
            <ArrowCounterClockwise /> Reset layout
          </button>
        </div>
      </div>
      <div
        className="sg-canvas-scroll"
        role="region"
        aria-label="Architecture canvas"
        tabIndex={0}
      >
        <svg
          ref={svg}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={`sg-topology ${motion ? "sg-topology-motion" : ""}`}
          aria-label="Recorded application architecture"
        >
          <defs>
            <pattern
              id="sg-canvas-dots"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="1" fill="#dfe4ec" />
            </pattern>
          </defs>
          <rect width={WIDTH} height={HEIGHT} fill="url(#sg-canvas-dots)" />
          {edges.map((edge) => {
            const a = positions[edge.from],
              b = positions[edge.to];
            const x1 = a.x + (edge.vertical ? NODE_WIDTH / 2 : NODE_WIDTH),
              y1 = a.y + (edge.vertical ? NODE_HEIGHT : NODE_HEIGHT / 2);
            const x2 = b.x + (edge.vertical ? NODE_WIDTH / 2 : 0),
              y2 = b.y + (edge.vertical ? 0 : NODE_HEIGHT / 2);
            const midX = (x1 + x2) / 2,
              midY = (y1 + y2) / 2;
            const d = edge.vertical
              ? `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
              : `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
            return (
              <g key={`${edge.from}-${edge.to}`} aria-hidden="true">
                <path d={d} className="sg-topology-edge" />
                <path d={d} className="sg-topology-flow" />
                <rect
                  x={midX - 65}
                  y={midY - 12}
                  width="130"
                  height="24"
                  rx="5"
                  fill="#fafbfc"
                />
                <text
                  x={midX}
                  y={midY + 4}
                  textAnchor="middle"
                  className="sg-edge-label"
                >
                  {edge.label}
                </text>
              </g>
            );
          })}
          {nodes.map((node) => {
            const p = positions[node.id];
            return (
              <g
                key={node.id}
                transform={`translate(${p.x},${p.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${node.label}: ${node.name}. Drag or use arrow keys to arrange.`}
                aria-pressed={selected === node.id}
                className={`sg-topology-node ${selected === node.id ? "selected" : ""}`}
                onFocus={() => setSelected(node.id)}
                onClick={() => setSelected(node.id)}
                onKeyDown={(event) => {
                  const direction: Record<string, Point> = {
                    ArrowLeft: { x: -16, y: 0 },
                    ArrowRight: { x: 16, y: 0 },
                    ArrowUp: { x: 0, y: -16 },
                    ArrowDown: { x: 0, y: 16 },
                  };
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(node.id);
                  }
                  if (!direction[event.key]) return;
                  event.preventDefault();
                  const delta = direction[event.key];
                  const next = {
                    ...positions,
                    [node.id]: bounded({ x: p.x + delta.x, y: p.y + delta.y }),
                  };
                  setPositions(next);
                  save(next);
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  const cursor = point(event);
                  if (!cursor) return;
                  setSelected(node.id);
                  event.currentTarget.focus();
                  drag.current = {
                    id: node.id,
                    offset: { x: cursor.x - p.x, y: cursor.y - p.y },
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (drag.current?.id !== node.id) return;
                  const cursor = point(event);
                  if (!cursor) return;
                  setPositions((current) => ({
                    ...current,
                    [node.id]: bounded({
                      x: cursor.x - drag.current!.offset.x,
                      y: cursor.y - drag.current!.offset.y,
                    }),
                  }));
                }}
                onPointerUp={(event) => {
                  if (drag.current?.id !== node.id) return;
                  drag.current = null;
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  save(positions);
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              >
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx="12"
                  className="sg-node-surface"
                />
                <text x="20" y="28" className="sg-node-label">
                  {node.label}
                </text>
                <text x="20" y="58" className="sg-node-name">
                  {node.name.length > 25
                    ? `${node.name.slice(0, 23)}…`
                    : node.name}
                </text>
                <text x="20" y="86" className="sg-node-detail">
                  {node.detail}
                </text>
                <circle
                  cx="202"
                  cy="25"
                  r="4"
                  fill={live ? "#267c58" : "#8b95a5"}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="sg-canvas-detail" aria-live="polite">
        <strong>{active.label}</strong>
        <p>{active.description}</p>
      </div>
      <p className="sg-canvas-caption">
        Connections illustrate the recorded topology, not measured traffic.
        Arranging nodes only changes this browser’s layout.
      </p>
    </div>
  );
}
