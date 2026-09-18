"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowUpRight,
  GearSix,
  Globe,
  MagnifyingGlass,
  Pause,
  Play,
  Plus,
} from "@phosphor-icons/react";
import type { ApplicationListItem } from "../applications-screen";
import type { MascotMood } from "./mascot-scene";
import {
  applicationKind,
  caretakerPaint,
  KIND_ACCENT,
  type ApplicationKind,
} from "./application-kind";
import { PREVIEWS } from "./interface-previews";
import s from "./home.module.css";

const Mascot = dynamic(
  () => import("./mascot-scene").then((m) => m.MascotScene),
  {
    ssr: false,
    loading: () => <div className={s.mascotPlaceholder} aria-hidden="true" />,
  },
);
type HomeApplication = ApplicationListItem & { href: string };

/**
 * The application's situation, read from the list item. Five words the card
 * can say at its top right, and the caretaker's face and prop follow them:
 * a mug when all is fine, a wrench while working, a clipboard when nobody
 * has looked lately, a magnifier and a worried face when something waits.
 * A new application's caretaker simply stands ready and waves: the card's
 * "New" says the rest, and the box it used to hold read as awkward.
 */
type Situation = "fine" | "working" | "needs" | "stale" | "new";

function situationOf(item: HomeApplication): Situation {
  const text = item.condition.text;
  if (item.attention > 0 || item.condition.tone === "bad") return "needs";
  if (text === "Checked a while ago") return "stale";
  if (item.condition.tone === "warn") return "needs";
  if (/deploying|in progress|updating/i.test(text)) return "working";
  if (/^not deployed|^new application/i.test(text)) return "new";
  if (item.condition.tone === "muted") return "stale";
  return "fine";
}

const WORD: Record<Situation, string> = {
  fine: "Fine",
  working: "Working",
  needs: "Needs me",
  stale: "Not checked",
  new: "New",
};

function moodOf(situation: Situation, active: boolean): MascotMood {
  if (situation === "needs") return "attention";
  if (situation === "working") return "working";
  if (situation === "stale") return "checking";
  return active ? "waving" : "ready";
}

const COUNT = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];
const names = (items: HomeApplication[]) => {
  const list = items.map((item) => item.name);
  return list.length <= 1
    ? list.join("")
    : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
};

/** The collection in two or three sentences: what is so, never what to do. */
function summary(items: HomeApplication[]) {
  const by = (situation: Situation) =>
    items.filter((item) => situationOf(item) === situation);
  const needs = by("needs"),
    working = by("working"),
    stale = by("stale"),
    fresh = by("new"),
    fine = by("fine");
  const n = items.length;
  const head = `${COUNT[n] ?? n} application${n === 1 ? "" : "s"}.`;
  const parts = [
    working.length &&
      `${names(working)} ${working.length > 1 ? "are" : "is"} being worked on`,
    needs.length &&
      `${names(needs)} ${needs.length > 1 ? "have" : "has"} something waiting`,
    stale.length &&
      `${names(stale)} ${stale.length > 1 ? "haven't" : "hasn't"} been looked at lately`,
    fresh.length &&
      `${names(fresh)} ${fresh.length > 1 ? "are" : "is"} new to Hallvi`,
  ].filter((part): part is string => Boolean(part));
  const middle = parts.length
    ? `${parts.slice(0, -1).join(", ")}${parts.length > 1 ? ", and " : ""}${parts.at(-1)}.`
    : "";
  const tail =
    fine.length === n
      ? n === 1
        ? "It is fine."
        : "All of them are fine."
      : fine.length
        ? fine.length === 1
          ? `${fine[0].name} is fine.`
          : `The other ${COUNT[fine.length]?.toLowerCase() ?? fine.length} are fine.`
        : "";
  return [
    head,
    middle && middle.charAt(0).toUpperCase() + middle.slice(1),
    tail,
  ]
    .filter(Boolean)
    .join(" ");
}

export function ApplicationsHome({
  applications,
  piReady,
}: {
  applications: HomeApplication[];
  piReady: boolean;
}) {
  const [selectedId, setSelectedId] = useState(applications[0]?.id);
  const [greeting, setGreeting] = useState(0);
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState("");
  const visible = applications.filter((item) =>
    `${item.name} ${item.source}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const greet = (id: string) => {
    setSelectedId(id);
    setGreeting((value) => value + 1);
  };
  return (
    <main className={s.page}>
      <header className={s.header}>
        <Link className={s.brand} href="/applications">
          <span className={s.brandMark} aria-hidden="true">
            <i />
            <i />
            <b />
          </span>
          Hallvi
        </Link>
        <Link className={s.settings} href="/setup/pi">
          <GearSix aria-hidden="true" />
          <span>{piReady ? "Settings" : "Settings · Connect ChatGPT"}</span>
        </Link>
      </header>
      <div className={s.content}>
        {/* The page opens with what is so, in a sentence or two, and never
            with a list of things to do. Most first users run something
            small; the card below says what runs and where, and leaves
            protection to the application's own pages until the data has
            earned a nudge. */}
        <section className={s.greeting} aria-labelledby="home-heading">
          <h1 id="home-heading">
            Your apps are
            <br />
            <em>in good company.</em>
          </h1>
          <p>
            {applications.length
              ? summary(applications)
              : "Nothing here yet. Add an application and a caretaker arrives with it."}
          </p>
        </section>
        {applications.length > 0 && (
          <div className={s.collectionHeading}>
            <h2 id="applications-heading">
              Your applications <span>{applications.length}</span>
            </h2>
            {applications.length > 4 && (
              <label className={s.search}>
                <MagnifyingGlass aria-hidden="true" />
                <input
                  aria-label="Find an application"
                  placeholder="Find an app"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            )}
            <Link className={s.add} href={"/applications/new"}>
              <Plus aria-hidden="true" />
              Add application
            </Link>
          </div>
        )}
        {!applications.length ? (
          <div className={s.empty}>
            <div className={s.emptyMascot} aria-hidden="true">
              <Mascot color="#7a8bd6" mood="waving" paused={paused} />
            </div>
            <h2>Add your first application</h2>
            <p>
              Start with a GitHub repository. Hallvi inspects it, recommends a
              server and deploys when you approve.
            </p>
            <Link className={s.primary} href={"/applications/new"}>
              <Plus aria-hidden="true" />
              Add application
            </Link>
            <small>Nothing is bought or changed until you approve it.</small>
          </div>
        ) : (
          <>
            <ul className={s.collection} aria-label="Applications">
              {visible.map((item, index) => {
                const { kind, purpose } = applicationKind(
                  item.source,
                  item.name,
                );
                const situation = situationOf(item);
                const active = selectedId === item.id;
                const addressUrl = item.address
                  ? /^https?:\/\//i.test(item.address)
                    ? item.address
                    : `https://${item.address}`
                  : null;
                const addressLabel =
                  addressUrl && URL.canParse(addressUrl)
                    ? new URL(addressUrl).host
                    : item.address;
                const parts =
                  item.stack && !/^not deployed/i.test(item.stack)
                    ? item.stack.split(" · ")
                    : [];
                return (
                  <li
                    key={item.id}
                    className={`${s.card} ${active ? s.selected : ""}`}
                    style={{ "--tint": KIND_ACCENT[kind] } as CSSProperties}
                  >
                    <button
                      type="button"
                      className={s.caretaker}
                      aria-label={`Say hello to ${item.name}'s caretaker`}
                      aria-pressed={active}
                      onClick={() => greet(item.id)}
                    >
                      <Mascot
                        color={caretakerPaint(kind)}
                        mood={moodOf(situation, active)}
                        paused={paused}
                        gesture={active ? greeting : 0}
                        ambient={situation === "fine"}
                        slot={index % 3}
                        dance={
                          (["shuffle", "robot", "floss"] as const)[index % 3]
                        }
                      />
                    </button>
                    <div className={s.body}>
                      <div className={s.identity}>
                        <div>
                          <h3>
                            <Link href={item.href}>{item.name}</Link>
                          </h3>
                          <span>{purpose}</span>
                        </div>
                        <span
                          className={`${s.word} ${s[`tone_${item.condition.tone}`]}`}
                        >
                          <i aria-hidden="true" />
                          {WORD[situation]}
                        </span>
                      </div>
                      <Link
                        className={s.preview}
                        href={item.href}
                        aria-label={`Open ${item.name}`}
                      >
                        <Screen
                          kind={kind}
                          host={
                            addressLabel ??
                            (situation === "new"
                              ? "no address yet"
                              : item.source)
                          }
                        />
                      </Link>
                      <p
                        className={`${s.state} ${s[`tone_${item.condition.tone}`]}`}
                      >
                        {item.condition.text}
                      </p>
                      <div className={s.foot}>
                        <div>
                          {parts.length > 0 && (
                            <ul className={s.chips} aria-label="What it runs">
                              {parts.map((part) => (
                                <li key={part}>{part}</li>
                              ))}
                            </ul>
                          )}
                          {item.address ? (
                            <a
                              className={s.address}
                              href={addressUrl!}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Globe aria-hidden="true" />
                              {addressLabel}
                              <ArrowUpRight aria-hidden="true" />
                            </a>
                          ) : (
                            <span className={`${s.address} ${s.addressNone}`}>
                              <Globe aria-hidden="true" />
                              {situation === "new"
                                ? "No address yet"
                                : item.source}
                            </span>
                          )}
                        </div>
                        <Link className={s.more} href={item.href}>
                          More
                        </Link>
                      </div>
                    </div>
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
            <div className={s.controls}>
              <span>Click a caretaker to say hello.</span>
              <button onClick={() => setPaused((value) => !value)}>
                {paused ? (
                  <Play aria-hidden="true" />
                ) : (
                  <Pause aria-hidden="true" />
                )}
                {paused ? "Resume animations" : "Pause animations"}
              </button>
            </div>
          </>
        )}
        <footer className={s.footer}>
          Software you own. Help when you need it.
        </footer>
      </div>
    </main>
  );
}

/** The application's own screen, drawn, in a window frame that says so. */
function Screen({ kind, host }: { kind: ApplicationKind; host: string }) {
  return (
    <div className={s.window} aria-hidden="true">
      <div className={s.windowBar}>
        <span>
          <i />
          <i />
          <i />
        </span>
        <small>{host}</small>
        <em>Illustration</em>
      </div>
      <svg viewBox="0 0 320 200" className={s.screen}>
        {PREVIEWS[kind]()}
      </svg>
    </div>
  );
}
