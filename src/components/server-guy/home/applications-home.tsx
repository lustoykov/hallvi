"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowUpRight,
  ChatCircle,
  GearSix,
  MagnifyingGlass,
  Pause,
  Play,
  Plus,
  ShieldCheck,
} from "@phosphor-icons/react";
import type { ApplicationListItem } from "../applications-screen";
import type { MascotDance } from "./mascot-scene";
import { mascotColors } from "./mascot-palette";
import {
  applicationKind,
  ApplicationIllustration,
  ApplicationSymbol,
} from "./application-illustration";
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
  const [greeting, setGreeting] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dance, setDance] = useState<MascotDance>("shuffle");
  const [performance, setPerformance] = useState({
    target: "",
    request: 0,
    dance: "shuffle" as MascotDance,
  });
  const visible = applications.filter((item) =>
    `${item.name} ${item.source}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0];
  const addHref = preview ? "/prototype/new" : "/applications/new";
  const unprotected = applications.filter(
    (item) =>
      item.protection === "Not backed up" ||
      item.protection.includes("not scheduled") ||
      item.protection === "Restore proof did not succeed",
  );
  function greet(id: string) {
    setSelectedId(id);
    setGreeting((value) => value + 1);
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
            <h1 id="home-heading">
              Your apps are
              <br />
              <em>in good company.</em>
            </h1>
            <p>A home for your software. A little help looking after it.</p>
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
                {visible.map((item, index) => {
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
                      <button
                        className={s.selectMascot}
                        aria-label={`Select ${item.name} caretaker`}
                        aria-pressed={active}
                        onClick={() => greet(item.id)}
                      >
                        <Mascot
                          color={color}
                          mood={active ? "waving" : "ready"}
                          paused={paused}
                          gesture={active ? greeting : 0}
                          ambient
                          slot={index % 3}
                          dance={
                            performance.target === item.id
                              ? performance.dance
                              : (["shuffle", "robot", "floss"] as const)[
                                  index % 3
                                ]
                          }
                          danceRequest={
                            performance.target === item.id
                              ? performance.request
                              : 0
                          }
                        />
                        <span>
                          {active
                            ? "Ready when you are."
                            : "A little company for your app."}
                        </span>
                      </button>
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
                        <ApplicationIllustration kind={kind} />
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
        {applications.length > 0 && (
          <div className={s.controls}>
            <span>
              Select a caretaker to say hello. Open its application to get to
              work.
            </span>
            <div>
              <label className={s.visuallyHidden} htmlFor="mascot-dance">
                Dance or trick
              </label>
              <select
                id="mascot-dance"
                value={dance}
                onChange={(e) => setDance(e.target.value as MascotDance)}
              >
                <option value="shuffle">Shuffle</option>
                <option value="robot">The robot</option>
                <option value="floss">Floss</option>
                <option value="backflip">Backflip</option>
                <option value="cartwheel">Cartwheel</option>
              </select>
              <button
                disabled={!selected}
                onClick={() => {
                  if (selected) {
                    setPaused(false);
                    setPerformance({
                      target: selected.id,
                      request: performance.request + 1,
                      dance,
                    });
                  }
                }}
              >
                {dance === "backflip" || dance === "cartwheel"
                  ? "Show me a trick"
                  : "Show me a dance"}
                <Play aria-hidden="true" />
              </button>
              <button onClick={() => setPaused((value) => !value)}>
                {paused ? (
                  <Play aria-hidden="true" />
                ) : (
                  <Pause aria-hidden="true" />
                )}
                {paused ? "Resume animations" : "Pause animations"}
              </button>
            </div>
          </div>
        )}
        {unprotected.length > 0 && (
          <aside className={s.protection}>
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>A little peace of mind, next.</strong>
              <p>
                {unprotected.length} application
                {unprotected.length === 1 ? " has" : "s have"} persistent data
                without scheduled backups.
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
