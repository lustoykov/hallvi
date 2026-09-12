"use client";

// PROTOTYPE · opus-ui-improvements · Security, direction B.
// Rings: reach as territory. Four rings, each one further in than the last —
// the internet, your network, the server itself, the private network the
// processes share. What a ring grants sits inside it, and the gate you must
// pass to get to the next ring sits on the wall between them. Picking a ring
// says plainly what someone standing there can reach, and dims everything
// they cannot. A rule that opens a private service straight to the internet
// is drawn as what it is: a hole through every wall.

import {
  ArrowsClockwise,
  ChatCircleText,
  Warning,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import type { ReachDirectionProps } from "./index";
import { ago, when, type Door } from "./reach-model";
import "./rings.css";

interface Ring {
  level: number;
  name: string;
  who: string;
  /** What you must pass to stand here, coming from the ring outside. */
  gate: string;
  says: string;
  doors: Door[];
  extras: string[];
}

export function RingsDirection({
  story,
  now,
  head,
  activity,
  onAsk,
  onOpenDestination,
  panel,
  onCheck,
  checking,
}: ReachDirectionProps) {
  const [picked, setPicked] = useState<number | null>(null);
  // The "everything else" entry only belongs in a ring when nothing
  // refuses it, which is what a missing firewall means.
  const doors = story.doors.filter(
    (door) => door.id !== "rest" || door.reach !== "closed",
  );
  const privately = (door: Door) =>
    story.processes.some(
      (process) =>
        process.role === "private" && String(process.port) === door.port,
    );
  const pierce = doors.find(
    (door) => door.reach === "internet" && privately(door),
  );
  const at = (test: (door: Door) => boolean) => doors.filter(test);
  const web = story.processes.find((process) => process.role === "web");
  const rings: Ring[] = [
    {
      level: 0,
      name: "The internet",
      who: "Anyone at all, from any network",
      gate: "No gate: this is where everyone already is",
      says: "Out here, only the ports the firewall opens to every network answer at all.",
      doors: at((door) => door.reach === "internet"),
      extras: [],
    },
    {
      level: 1,
      name: "Your network",
      who: story.controllerIp
        ? `Whoever is at ${story.controllerIp}`
        : "The networks named in the rules",
      gate:
        story.audience === "controller"
          ? "Be on the network the deployment named"
          : "No gate: HTTP is open to everyone",
      says:
        story.audience === "controller"
          ? `${web?.product ?? "The application"} answers here and nowhere else, which is why it needs no certificate yet.`
          : `${web?.product ?? "The application"} answers everyone; this ring adds nothing.`,
      doors: at((door) => door.reach === "restricted"),
      extras: [],
    },
    {
      level: 2,
      name: "On the server",
      who: "Whoever holds the SSH key",
      gate:
        story.ssh.told === "provider"
          ? "Hold the SSH key · the provider’s read says nothing about how it authenticates"
          : "Hold the SSH key · password sign-in is off on the host",
      says: "A shell on the host reaches everything: the containers, the volumes and the data inside them.",
      doors: [],
      extras: [
        "Every container, and the output it has written",
        ...(story.database?.volume
          ? [`${story.database.volume.name} · ${story.database.volume.mount}`]
          : []),
        ...(story.database
          ? [`${story.database.label} · the data itself`]
          : []),
      ],
    },
    {
      level: 3,
      name: "Inside the private network",
      who: "The processes themselves",
      gate: "Be a process on this server, in the network Compose made",
      says: "Private services publish no port, so this is the only place they answer.",
      doors: at((door) => door.reach === "private"),
      extras: [],
    },
  ];
  const open = rings.find((ring) => ring.level === picked) ?? null;

  // Built from the inside out, so the rings really are inside one another.
  let field: ReactNode = null;
  for (const ring of [...rings].reverse()) {
    const inner = field;
    field = (
      <div
        key={ring.level}
        className="axri-ring"
        data-level={ring.level}
        data-dim={picked !== null && ring.level > picked ? true : undefined}
        data-on={picked === ring.level || undefined}
      >
        {ring.level > 0 && (
          <span className="axri-gate">
            <b>Wall</b>
            {ring.gate}
          </span>
        )}
        <button
          type="button"
          className="axri-name"
          aria-pressed={picked === ring.level}
          onClick={() => setPicked(picked === ring.level ? null : ring.level)}
        >
          <b>{ring.name}</b>
          <small>{ring.who}</small>
        </button>
        <div className="axri-items">
          {ring.doors.map((door) => (
            <span
              key={door.id}
              className="axri-item"
              data-warn={door.concern ? true : undefined}
              data-pierce={
                door.reach === "internet" && privately(door) ? true : undefined
              }
            >
              <b>
                {door.port ? `port ${door.port} · ` : ""}
                {door.title}
              </b>
              <small>{door.serves ?? "nothing recorded listens"}</small>
              {door.unasked && <i>nobody asked for this</i>}
            </span>
          ))}
          {ring.extras.map((extra) => (
            <span key={extra} className="axri-item" data-plain="true">
              <b>{extra}</b>
            </span>
          ))}
          {!ring.doors.length && !ring.extras.length && (
            <span className="axri-none">
              Nothing new is reachable from here
            </span>
          )}
          {ring.level === 3 && (
            <LittleServer
              mood={pierce ? "attention" : "ready"}
              className="axri-guy"
            />
          )}
        </div>
        {inner}
      </div>
    );
  }

  return (
    <section className="axri" aria-label="Security">
      {head}
      {activity}
      {panel}
      <div className="axri-lede">
        <div>
          <h2>
            {pierce
              ? `Something out on the internet can reach ${pierce.title}, which was meant to stay inside.`
              : `Four rings in, and each wall needs something different to pass.`}
          </h2>
          <p>
            <Tag
              tone={story.firewall.state === "read" ? "verified" : "planned"}
            >
              {story.firewall.state === "read"
                ? `Read from ${story.firewall.provider} ${ago(story.firewall.at, now)}`
                : "Asked for, never read back"}
            </Tag>
            <span>
              Standing in a ring means you can reach everything drawn in it.
              Getting to the next one in means passing its wall.
            </span>
          </p>
        </div>
        <div className="axri-acts">
          {onCheck && (
            <button
              type="button"
              className="ax-button axri-check"
              disabled={checking}
              onClick={onCheck}
            >
              <ArrowsClockwise
                weight="bold"
                className={checking ? "ax-spin" : undefined}
              />
              {checking ? "Checking…" : "Check now"}
            </button>
          )}
          <button
            type="button"
            className="ax-button axri-ask"
            onClick={() =>
              onAsk(
                `For ${story.name}, tell me what someone on the internet can reach, and what would have to be true for them to get onto the server.`,
              )
            }
          >
            <ChatCircleText weight="bold" />
            Ask what a stranger can reach
          </button>
        </div>
      </div>

      <div className="axri-field" data-pierced={pierce ? true : undefined}>
        {field}
      </div>

      <div className="axri-says" role="status">
        {open ? (
          <>
            <h3>
              {open.who}
              {open.level > 0 ? `, having passed: ${open.gate}` : ""}
            </h3>
            <p>{open.says}</p>
          </>
        ) : (
          <>
            <h3>Pick a ring to see what someone standing there can reach.</h3>
            <p>
              {story.firewall.detail}{" "}
              {story.firewall.state === "read"
                ? "The rules are the provider’s own, read just now."
                : "These are the rules the deployment asked for, not a read of what is in place."}
            </p>
          </>
        )}
      </div>

      <div className="axri-notes">
        {story.holes.map((hole) => (
          <div key={hole.id} className="axri-hole">
            <b>
              <Warning weight="bold" /> {hole.title}
            </b>
            <span>{hole.detail}</span>
          </div>
        ))}
      </div>

      <footer className="axri-foot">
        <p>
          {story.guards.map((guard) => guard.title).join(" · ")}
          {story.guards[0]?.at ? ` · recorded ${when(story.guards[0].at)}` : ""}
        </p>
        <button
          type="button"
          className="ax-textlink"
          onClick={() => onOpenDestination("domains")}
        >
          The name and certificate in front of it
        </button>
      </footer>
      {story.invented && <p className="ax-invented">{story.invented}</p>}
    </section>
  );
}
