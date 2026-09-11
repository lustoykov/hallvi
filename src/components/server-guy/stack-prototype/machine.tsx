"use client";

// PROTOTYPE · opus-ui-improvements · throwaway.
// Direction B, Machine: the server drawn as its front panel, with Little
// Server on top. Processes are modules with their port and a light for each
// recorded check; a cable runs from the web app's port up to your network
// and carries a light while you point at the module. Database: the storage
// bay, with the database's drive, the other files, a backup rack holding a
// slot for each copy the schedule keeps (the newest on record lit) and a
// restore lamp. Opening a module pulls out its spec plate underneath.

import { ChatCircleText, Lock, Plug, X } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import type { MascotMood } from "../home/mascot-scene";
import { FRESH_MS } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import type { StackDirectionProps } from "./index";
import {
  ago,
  clock,
  countWord,
  when,
  type Change,
  type Probe,
} from "./stack-model";
import "./machine.css";

const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};

interface Spec {
  title: ReactNode;
  rows: { label: string; value: string; mono?: boolean }[];
  probes?: {
    at: string | null;
    text: string;
    tone: "pass" | "fail" | "info";
  }[];
  note?: string;
  ask?: { label: string; draft: string };
}

export function MachineDirection({
  page,
  story,
  now,
  head,
  activity,
  server,
  onAsk,
  onOpenConversation,
  onOpenDestination,
}: StackDirectionProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((value) => (value === id ? null : id));
  const point = (id: string) => ({
    onPointerEnter: () => setHot(id),
    onPointerLeave: () => setHot(null),
    onFocus: () => setHot(id),
    onBlur: () => setHot(null),
  });
  const lightOf = (at: string | null) =>
    !at ? "off" : now - Date.parse(at) < FRESH_MS ? "on" : "old";
  const probeRows = (probes: Probe[]) =>
    probes.map((probe) => ({
      at: probe.at,
      tone: probe.at ? ("pass" as const) : ("info" as const),
      text: `${probe.name} · ${probe.probe} · ${probe.inside ? "inside the server" : "from your network"}`,
    }));

  const specs: Record<string, Spec> = {};
  const store = story.database;
  const guard = story.protection;
  if (page === "processes")
    for (const item of story.processes)
      specs[item.name] = {
        title: (
          <>
            {item.product} <code>{item.name}</code>
          </>
        ),
        rows: [
          { label: "Role", value: item.roleWords },
          { label: "Reached", value: item.reach },
          { label: "Image", value: item.image, mono: true },
          {
            label: "Command",
            value: item.command ?? "Image default",
            mono: Boolean(item.command),
          },
          { label: "Health", value: item.health ?? "None recorded" },
        ],
        probes: probeRows(item.probes),
        ask: {
          label: `Ask Server Guy about ${item.product}`,
          draft: `Check ${item.product} (${item.name}) now: is it running and healthy?`,
        },
      };
  else if (store) {
    specs.drive = {
      title: (
        <>
          {store.label} <code>{store.volume?.name ?? store.ownerName}</code>
        </>
      ),
      rows: [
        ...(store.file
          ? [{ label: "File", value: store.file, mono: true }]
          : []),
        ...(store.volume
          ? [
              { label: "Volume", value: store.volume.name, mono: true },
              ...(store.volume.docker
                ? [
                    {
                      label: "Docker name",
                      value: store.volume.docker,
                      mono: true,
                    },
                  ]
                : []),
              { label: "Mount", value: store.volume.mount, mono: true },
            ]
          : []),
        { label: "Used by", value: `${store.owner} (${store.ownerName})` },
        { label: "Size", value: "Not measured" },
      ],
      probes: [
        ...(store.firstFailure
          ? [
              {
                at: store.firstFailure.at,
                tone: "fail" as const,
                text: store.firstFailure.detail,
              },
            ]
          : []),
        ...(store.probe ? probeRows([store.probe]) : []),
      ],
      ask: {
        label: "Ask Server Guy to back it up now",
        draft: `Back up ${store.owner}'s database now and verify the copy.`,
      },
    };
    for (const item of story.files)
      specs[`files:${item.name}`] = {
        title: (
          <>
            {item.owner}&apos;s files <code>{item.name}</code>
          </>
        ),
        rows: [
          { label: "Mount", value: item.mount, mono: true },
          { label: "Kept", value: item.note ?? "Not recorded" },
        ],
        note: "Files, not a database. Storage shows every volume.",
      };
    if (guard.schedule || guard.backup)
      specs.rack = {
        title: guard.schedule?.words ?? "Backups",
        rows: [
          ...(guard.schedule
            ? [{ label: "Set up", value: when(guard.schedule.at) }]
            : []),
          ...(guard.backup
            ? [
                { label: "Newest copy", value: when(guard.backup.at) },
                { label: "What was checked", value: guard.backup.detail },
              ]
            : []),
        ],
        note: guard.schedule
          ? "Scheduled backups may have run since; nothing newer is on record here."
          : undefined,
      };
    if (guard.restore)
      specs.lamp = {
        title: "Restore test",
        rows: [
          { label: "Tested", value: when(guard.restore.at) },
          { label: "What passed", value: guard.restore.detail },
        ],
      };
  }
  const spec = open ? specs[open] : undefined;

  const bay = (
    id: string,
    body: ReactNode,
    label: string,
    extra?: ReactNode,
  ) => (
    <button
      key={id}
      type="button"
      className="axmc-module"
      aria-expanded={open === id}
      aria-label={label}
      onClick={() => toggle(id)}
      {...point(id)}
    >
      {body}
      {extra}
    </button>
  );
  const empty = (id: string, title: string, detail: string) => (
    <div key={id} className="axmc-module is-empty">
      <b>{title}</b>
      <small>{detail}</small>
    </div>
  );
  const cable = (id: string, words: string) => (
    <>
      <span
        className="axmc-cable"
        data-hot={hot === id || undefined}
        aria-hidden="true"
      />
      <span
        className="axmc-net"
        data-hot={hot === id || undefined}
        aria-hidden="true"
      >
        {words}
      </span>
    </>
  );
  const changes = (list: Change[]) =>
    list.length > 0 && (
      <section className="axmc-changes" aria-label="Recent changes">
        <h3>Recent changes</h3>
        <ul>
          {list.map((change) => (
            <li key={change.id} data-state={change.state}>
              <button
                type="button"
                onClick={() =>
                  change.origin
                    ? onOpenConversation(
                        change.origin.chatId,
                        change.origin.messageId,
                      )
                    : onOpenDestination("history")
                }
              >
                {change.title}
              </button>
              <small>{when(change.at)}</small>
            </li>
          ))}
        </ul>
      </section>
    );

  // ---------- The lede and the panel for each page ----------
  let say: string;
  let sure: ReactNode;
  let ask: { label: string; draft: string };
  let bays: ReactNode;
  if (page === "processes") {
    const n = story.processes.length;
    const names = story.processes.map((item) => item.product);
    say =
      story.state === "running"
        ? `${countWord(n)} ${n === 1 ? "process is" : "processes are"} running.`
        : `${countWord(n)} ${n === 1 ? "process" : "processes"} ${story.state === "unknown" ? "may have changed" : "planned"}.`;
    sure = (
      <>
        <Tag tone={story.tone}>{story.word}</Tag>
        <span>Checked by the deployment, not continuously.</span>
      </>
    );
    ask = {
      label: "Ask Server Guy to check now",
      draft: `Check that ${names.join(" and ")} are running and healthy now.`,
    };
    bays = (
      <>
        {story.processes.map((item) => {
          const passed = item.probes.filter((probe) => probe.at).length;
          return bay(
            item.name,
            <>
              <span className="axmc-name">
                <b>{item.product}</b>
                <code>{item.name}</code>
              </span>
              <span className="axmc-role">
                {item.role === "web"
                  ? "Web app"
                  : item.role === "private"
                    ? "Private service"
                    : item.role === "worker"
                      ? "Worker"
                      : "Service"}
              </span>
              <span
                className="axmc-socket"
                data-kind={item.role === "web" ? "open" : "closed"}
              >
                {item.role === "private" ? (
                  <Lock weight="bold" />
                ) : (
                  <Plug weight="bold" />
                )}
                {item.role === "web" ? `80 → ${item.port}` : (item.port ?? "—")}
              </span>
              <span className="axmc-leds" aria-hidden="true">
                {item.probes.map((probe) => (
                  <i
                    key={probe.name}
                    data-light={lightOf(probe.at)}
                    title={`${probe.name} · ${probe.at ? when(probe.at) : "not run"}`}
                  />
                ))}
              </span>
            </>,
            `${item.product}, ${item.roleWords}, ${item.reach}, ${passed} of ${item.probes.length} checks passed`,
            item.role === "web" &&
              cable(
                item.name,
                story.restricted && story.from
                  ? `Your network · ${story.from}`
                  : "The internet",
              ),
          );
        })}
        {story.processGaps.map((gap) =>
          empty(gap.id, gap.title, gap.detail.split(". ")[0]),
        )}
      </>
    );
  } else if (store) {
    const checked = store.probe?.at ?? null;
    const fresh = Boolean(checked) && now - Date.parse(checked!) < FRESH_MS;
    say = `${store.owner} keeps its data in ${store.kind === "sqlite" ? "one SQLite file" : store.label}.`;
    sure = (
      <>
        <Tag tone={checked ? (fresh ? "verified" : "stale") : "planned"}>
          {checked ? `Healthy ${ago(checked, now)}` : "Not checked"}
        </Tag>
        <span>A recorded check, not continuous monitoring.</span>
      </>
    );
    ask = {
      label: "Ask Server Guy to back it up now",
      draft: `Back up ${store.owner}'s database now and verify the copy.`,
    };
    const keep = guard.keep ?? 7;
    bays = (
      <>
        {bay(
          "drive",
          <>
            <span className="axmc-name">
              <b>{store.volume?.name ?? store.label}</b>
            </span>
            <span className="axmc-cart">
              <code>{store.file?.split("/").at(-1) ?? store.label}</code>
              <small>{store.label}</small>
            </span>
            <span className="axmc-role">
              Used by {store.owner} · size not measured
            </span>
            <span className="axmc-leds" aria-hidden="true">
              <i data-light={lightOf(checked)} />
            </span>
          </>,
          `${store.label} in ${store.volume?.name ?? "its volume"}, used by ${store.owner}`,
        )}
        {story.files.map((item) =>
          bay(
            `files:${item.name}`,
            <>
              <span className="axmc-name">
                <b>{item.name}</b>
              </span>
              <span className="axmc-cart is-files">
                <code>{item.mount}</code>
                <small>{item.owner} files</small>
              </span>
              <span className="axmc-role">{item.note ?? "Files"}</span>
            </>,
            `${item.owner}'s files in ${item.name}`,
          ),
        )}
        {guard.schedule || guard.backup
          ? bay(
              "rack",
              <>
                <span className="axmc-name">
                  <b>Backups</b>
                </span>
                <span className="axmc-slots" aria-hidden="true">
                  {Array.from({ length: keep }, (_, index) => (
                    <i
                      key={index}
                      data-filled={
                        (index === 0 && Boolean(guard.backup)) || undefined
                      }
                    />
                  ))}
                </span>
                <span className="axmc-role">
                  {guard.backup
                    ? `Newest on record ${when(guard.backup.at)}`
                    : "None on record"}
                </span>
              </>,
              `${guard.schedule?.words ?? "Backups"}; ${guard.backup ? `newest on record ${when(guard.backup.at)}` : "none on record"}`,
              guard.backup &&
                cable("rack", `Off-host copy · ${when(guard.backup.at)}`),
            )
          : empty("rack", "Backups", "Not set up")}
        {guard.restore
          ? bay(
              "lamp",
              <>
                <span className="axmc-name">
                  <b>Restore test</b>
                </span>
                <span className="axmc-lamp" data-on aria-hidden="true" />
                <span className="axmc-role">
                  Passed {when(guard.restore.at)}
                </span>
              </>,
              `Restore test passed ${when(guard.restore.at)}`,
            )
          : empty("lamp", "Restore test", "Not run yet")}
        {story.dataGaps
          .filter((gap) => gap.id !== "backups" && gap.id !== "logs")
          .map((gap) => empty(gap.id, gap.title, gap.detail.split(". ")[0]))}
      </>
    );
  } else {
    say = "No database recorded.";
    sure = null;
    ask = {
      label: "Ask Server Guy",
      draft: "Does this application use a database?",
    };
    bays = null;
  }

  return (
    <section
      className="axmc"
      aria-label={page === "processes" ? "Processes" : "Database"}
    >
      {head}
      {activity}
      <div className="axmc-lede">
        <div>
          <h2 className="axmc-say">{say}</h2>
          {sure && <p className="axmc-sure">{sure}</p>}
        </div>
        <button
          type="button"
          className="ax-button axmc-ask"
          onClick={() => onAsk(ask.draft)}
        >
          <ChatCircleText weight="bold" />
          {ask.label}
        </button>
      </div>

      {bays && (
        <div className="axmc-stage">
          <div
            className="axmc-panel"
            role="group"
            aria-label={
              page === "processes"
                ? "The server's processes"
                : "The server's storage"
            }
          >
            <div className="axmc-bays">{bays}</div>
            <div className="axmc-foot" aria-hidden="true">
              <span className="axmc-vent" />
              <span className="axmc-plate">
                {server
                  ? `${server.label}${server.city ? ` · ${server.city}` : ""}`
                  : story.name}
              </span>
              <span className="axmc-status" data-tone={story.tone}>
                <i />
                {story.word}
              </span>
            </div>
          </div>
          <LittleServer mood={moodOf[story.tone]} className="axmc-guy" />
          <div className="axmc-drawer" data-open={Boolean(spec)}>
            <div>
              {spec && (
                <section className="axmc-spec" aria-label="Details">
                  <header>
                    <b>{spec.title}</b>
                    <button
                      type="button"
                      className="axmc-close"
                      aria-label="Close"
                      onClick={() => setOpen(null)}
                    >
                      <X weight="bold" />
                    </button>
                  </header>
                  <dl>
                    {spec.rows.map((row) => (
                      <div key={row.label}>
                        <dt>{row.label}</dt>
                        <dd className={row.mono ? "ax-mono" : undefined}>
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {spec.probes && spec.probes.length > 0 && (
                    <div className="axmc-probes" role="log">
                      {spec.probes.map((row, index) => (
                        <div key={index} data-tone={row.tone}>
                          <time>{row.at ? clock(row.at) : "—"}</time>
                          <b aria-hidden="true">
                            {row.tone === "pass"
                              ? "✓"
                              : row.tone === "fail"
                                ? "✗"
                                : "·"}
                          </b>
                          <span>{row.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {spec.note && <p className="axmc-note">{spec.note}</p>}
                  {spec.ask && (
                    <button
                      type="button"
                      className="ax-textlink"
                      onClick={() => onAsk(spec.ask!.draft)}
                    >
                      <ChatCircleText weight="bold" />
                      {spec.ask.label}
                    </button>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {changes(page === "processes" ? story.processChanges : story.dataChanges)}
    </section>
  );
}
