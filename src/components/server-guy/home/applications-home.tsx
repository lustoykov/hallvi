"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowUpRight,
  ChatCircle,
  GearSix,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
} from "@phosphor-icons/react";
import type { ApplicationListItem } from "../applications-screen";
import { mascotColors } from "./mascot-palette";
import { applicationKind, ApplicationSymbol } from "./application-illustration";
import s from "./home.module.css";

const Mascot = dynamic(
  () => import("./mascot-scene").then((m) => m.MascotScene),
  {
    ssr: false,
    loading: () => (
      <div className={s.mascotPlaceholder} aria-hidden="true">
        <span>• •</span>
        <i />
      </div>
    ),
  },
);
type HomeApplication = ApplicationListItem & { href: string };

function colorFor(item: HomeApplication) {
  const kind = applicationKind(item.source, item.name);
  if (kind === "uptime") return 0;
  if (kind === "tasks") return 3;
  if (kind === "metrics") return 2;
  return (
    [...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    mascotColors.length
  );
}

export function ApplicationsHome({
  applications,
  piReady,
  preview,
}: {
  applications: HomeApplication[];
  piReady: boolean;
  preview: boolean;
}) {
  const [selectedId, setSelectedId] = useState(applications[0]?.id);
  const [query, setQuery] = useState("");
  const [paused] = useState(false);
  const visible = applications.filter((item) =>
    `${item.name} ${item.source}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0];
  // What a return visit is for. Attention only — a recovered failure is not
  // carried forward, because the condition is read from the current checks.
  const waiting = applications.filter(
    (item) => item.attention > 0 || item.condition.tone === "bad",
  );
  const addHref = preview ? "/prototype/new" : "/applications/new";
  const unprotected = applications.filter(
    (item) =>
      item.protection === "Not backed up" ||
      item.protection.includes("not scheduled") ||
      item.protection === "Restore proof did not succeed" ||
      item.protection === "Restore cleanup needs attention" ||
      [
        "Backup cleanup needs attention",
        "Backup status unavailable",
        "Backup schedule stopped",
        "Backup failed",
        "Retention needs attention",
        "Backup overdue",
        "Scheduled · awaiting first backup",
        "Backed up · restore not tested",
      ].includes(item.protection),
  );
  function greet(id: string) {
    setSelectedId(id);
  }
  return (
    <main className={s.page}>
      <header className={s.header}>
        <Link
          className={s.brand}
          href={preview ? "/prototype/applications" : "/applications"}
        >
          <span className={s.brandMark} aria-hidden="true">
            <i />
            <i />
            <b />
          </span>
          Server Guy
        </Link>
        <span className={s.workspaceLabel}>Your workspace</span>
        <Link
          className={s.settings}
          href={preview ? "/prototype/settings/connections" : "/setup/pi"}
        >
          <GearSix aria-hidden="true" />
          <span>{piReady ? "Settings" : "Settings · Connect ChatGPT"}</span>
        </Link>
      </header>
      <div className={s.content}>
        <section className={s.greeting} aria-labelledby="home-heading">
          <div>
            {/* Somebody opening this page has come back to find out whether
                their software is all right. It used to open with a marketing
                line and three large caretakers, and the only real facts were
                below them. The heading answers the question the visit is
                about, from the records; the personality stays, smaller, and
                beside it rather than on top of it. */}
            <h1 id="home-heading">
              {waiting.length === 0 ? (
                <>
                  Nothing needs you
                  <br />
                  <em>right now.</em>
                </>
              ) : waiting.length === 1 ? (
                <>
                  {waiting[0].name}
                  <br />
                  <em>needs you.</em>
                </>
              ) : (
                <>
                  {waiting.length} applications
                  <br />
                  <em>need you.</em>
                </>
              )}
            </h1>
            <p>
              {waiting.length === 0
                ? "Nothing on record is waiting. Open an application to see what it has been doing."
                : `${
                    waiting.length === 1
                      ? waiting[0].name
                      : `${waiting
                          .slice(0, -1)
                          .map((item) => item.name)
                          .join(", ")} and ${waiting.at(-1)!.name}`
                  }${
                    waiting.length === 1
                      ? " has something waiting."
                      : " have something waiting."
                  }`}
            </p>
          </div>
          {/* One caretaker, at the size of a thought rather than a poster,
              and its mood is the page's answer: it is attentive when
              something is waiting and at rest when nothing is. Personality
              that carries meaning survives; three identical figures taking a
              scroll's worth of room did not. */}
          <div className={s.pageMascot} aria-hidden="true">
            <Mascot
              color={0}
              mood={waiting.length ? "attention" : "resting"}
              paused={paused}
              ambient
              slot={0}
            />
          </div>
          {selected && (
            <div className={s.conversationAction}>
              <Link className={s.primary} href={selected.href.split("#")[0]}>
                Talk to Server Guy <ChatCircle aria-hidden="true" />
                <span className={s.visuallyHidden}> about {selected.name}</span>
              </Link>
              <small>About {selected.name}</small>
            </div>
          )}
        </section>
        <section aria-labelledby="applications-heading">
          <div className={s.collectionHeading}>
            <h2 id="applications-heading">
              Your applications <span>{applications.length}</span>
            </h2>
            {applications.length > 0 && (
              <>
                <label className={s.search}>
                  <MagnifyingGlass aria-hidden="true" />
                  <input
                    aria-label="Find an application"
                    placeholder="Find an app"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <Link className={s.add} href={addHref}>
                  <Plus aria-hidden="true" />
                  Add application
                </Link>
              </>
            )}
          </div>
          {!applications.length ? (
            <div className={s.empty}>
              <div className={s.emptyMascot}>
                <Mascot color={3} mood="ready" paused={paused} />
              </div>
              <h2>Add your first application</h2>
              <p>
                Start with a GitHub repository. Server Guy inspects it,
                recommends a server and deploys when you approve.
              </p>
              <Link className={s.primary} href={addHref}>
                <Plus aria-hidden="true" />
                Add application
              </Link>
              <small>Nothing is bought or changed until you approve it.</small>
            </div>
          ) : (
            <>
              <ul className={s.collection} aria-label="Applications">
                {visible.map((item) => {
                  const color = colorFor(item);
                  const kind = applicationKind(item.source, item.name);
                  const active = selected?.id === item.id;
                  return (
                    <li
                      key={item.id}
                      className={`${s.caretaker} ${active ? s.selected : ""}`}
                      style={
                        {
                          "--caretaker-color": mascotColors[color],
                        } as CSSProperties
                      }
                      onFocus={() => {
                        if (!active) greet(item.id);
                      }}
                    >
                      {/* The caretaker that used to stand above each
                          card is gone: three identical figures at 250px
                          each, with the application's own condition
                          underneath them. Personality moved to the page
                          head, where it costs nobody a scroll. */}
                      <Link className={s.application} href={item.href}>
                        <div className={s.appIdentity}>
                          <span className={s.appSymbol}>
                            <ApplicationSymbol kind={kind} />
                          </span>
                          <div>
                            <h3>{item.name}</h3>
                            <span>{item.source}</span>
                          </div>
                          <ArrowUpRight aria-hidden="true" />
                        </div>
                        {/* The card used to carry a mock browser window with
                            an invented heartbeat chart in it. It was the same
                            on every application, it said nothing about any of
                            them, it pushed the condition and the attention
                            count below the fold — and on a product whose
                            first rule is not to manufacture healthy states, a
                            decorative heartbeat is the wrong ornament. What
                            the card is for is underneath it. */}
                        <div className={s.appFacts}>
                          <strong className={s[`tone_${item.condition.tone}`]}>
                            <i aria-hidden="true" />
                            {item.condition.text}
                          </strong>
                          <span>{item.stack}</span>
                          <div>
                            <span className={item.attention ? s.attention : ""}>
                              {item.attention
                                ? `${item.attention} need${item.attention === 1 ? "s" : ""} you`
                                : "Nothing needs you"}
                            </span>
                            <span
                              className={
                                item.protection === "Not backed up"
                                  ? s.attention
                                  : ""
                              }
                            >
                              {item.protection}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {!visible.length && (
                <div className={s.noResults}>
                  <h3>No applications match “{query}”.</h3>
                  <button onClick={() => setQuery("")}>Clear search</button>
                </div>
              )}
            </>
          )}
        </section>
        {unprotected.length > 0 && (
          <aside className={s.protection}>
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>A little peace of mind, next.</strong>
              <p>
                {unprotected.length} application
                {unprotected.length === 1 ? " needs" : "s need"} a backup, a
                restore test, or a current status check.
              </p>
            </div>
            <Link href={`${unprotected[0].href.split("#")[0]}#backups`}>
              Review protection
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </aside>
        )}
        <footer className={s.footer}>
          Software you own. Help when you need it.
        </footer>
      </div>
    </main>
  );
}
