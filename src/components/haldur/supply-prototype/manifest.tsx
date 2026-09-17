"use client";

// PROTOTYPE · opus-ui-improvements · Variables.
// Manifest: everything this application was given, listed by who decided it.
// A value the plan states in the open is shown as it is; a value only you
// could give is sealed, because it lives on the host and this page never
// holds it. Configuration that is a file is listed the same way, by what
// reads it and where. Opening an entry says what changing it would cost.

import {
  ChatCircleText,
  FileText,
  GitBranch,
  LockKey,
} from "@phosphor-icons/react";
import { useState } from "react";

import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import { listed } from "../backup-prototype/model";
import type { SupplyProps } from "./supply-story";
import { RevealSecret } from "../reveal-secret";
import { ago, sizeWords, when, type Value } from "./supply-model";
import "./manifest.css";

const deciders = [
  {
    key: "plan",
    title: "Stated by the plan",
    note: "Anyone with the repository can read these; this page still does not print them.",
  },
  {
    key: "you",
    title: "Only you could give these",
    note: "Held on the host. Haldur never shows one back, here or anywhere.",
  },
  {
    key: "generated",
    title: "Made by Haldur",
    // "never shown" was true of every value on this page until the
    // controller started generating them. A generated credential the owner
    // cannot read is one they do not have, so these are the one kind that
    // opens to a Reveal — and the note must not claim otherwise.
    note: "Nobody typed these. Open one to read it back when you need it.",
  },
  {
    key: "connection",
    title: "Wired to the services beside it",
    note: "Addresses of the private processes on this server.",
  },
] as const;

export function ManifestDirection({
  story,
  now,
  applicationId,
  head,
  activity,
  onAsk,
  onOpenDestination,
}: SupplyProps) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = deciders
    .map((group) => ({
      ...group,
      items: story.values.filter((value) => value.who === group.key),
    }))
    .filter((group) => group.items.length);
  const pending = story.values.filter((value) => value.pending);
  const held = story.values.filter((value) => value.held);
  const plan = story.values.filter((value) => !value.held);
  const shown = story.values.find((value) => value.id === open) ?? null;

  const say = story.waiting.length
    ? `Haldur is waiting for ${listed(story.waiting.map((item) => item.name))}.`
    : story.values.length || story.files.length
      ? `${story.name} runs on ${listed(
          [
            story.values.length &&
              `${story.values.length} value${story.values.length === 1 ? "" : "s"}`,
            story.files.length &&
              `${story.files.length} configuration file${story.files.length === 1 ? "" : "s"}`,
          ].filter(Boolean) as string[],
        )}.`
      : `Nothing configures ${story.name} on record.`;

  return (
    <section className="axma" aria-label="Environment variables">
      {head}
      {activity}
      <div className="axma-lede">
        <div>
          <h2>{say}</h2>
          <p>
            <Tag
              tone={
                story.waiting.length
                  ? "failed"
                  : pending.length
                    ? "stale"
                    : story.appliedAt
                      ? "verified"
                      : "planned"
              }
            >
              {story.waiting.length
                ? "A value is missing"
                : pending.length
                  ? `${pending.length} not live yet`
                  : story.appliedAt
                    ? `Applied ${ago(story.appliedAt, now)}`
                    : "Nothing applied yet"}
            </Tag>
            <span>
              No value is printed on this page; a credential Haldur generated
              opens to a Reveal.{" "}
              {held.length
                ? `${held.length === 1 ? "One is" : `${held.length} are`} held on the host, where only the process that needs it can read it. `
                : ""}
              {/* Where the rest live is each value's own source fact, and
                  saying "the repository" for all of them was a guess about
                  values written by a release, a connection or Haldur. */}
              {plan.length
                ? `${held.length ? "The rest come" : "They come"} from where each row says, in the release at revision `
                : "The release is at revision "}
              <code>{story.revision?.slice(0, 12) ?? "not recorded"}</code>.
            </span>
          </p>
        </div>
        <button
          type="button"
          className="ax-button axma-ask"
          onClick={() =>
            onAsk(
              story.waiting.length
                ? `Ask me for ${story.waiting[0].name} again and tell me exactly what it is used for.`
                : `Change a value for ${story.name}: tell me which ones I can change safely and what a change would cost.`,
            )
          }
        >
          <ChatCircleText weight="bold" />
          {story.waiting.length
            ? "Give it in the conversation"
            : "Change a value"}
        </button>
      </div>

      {story.waiting.length > 0 && (
        <div className="axma-waiting" role="status">
          <h3>Waiting for you</h3>
          <ul>
            {story.waiting.map((item) => (
              <li key={item.name}>
                <code>{item.name}</code>
                <span>{item.reason}</span>
              </li>
            ))}
          </ul>
          <p>
            Haldur asks for these in the conversation that needs them, and
            nothing here can take one: a value typed into a page is a value in a
            page.
          </p>
        </div>
      )}

      {groups.map((group) => (
        <section
          className="axma-group"
          key={group.key}
          aria-label={group.title}
        >
          <header>
            <h3>{group.title}</h3>
            <small>{group.note}</small>
          </header>
          <div className="axma-cards">
            {group.items.map((value) => (
              <button
                key={value.id}
                type="button"
                className="axma-card"
                data-held={value.held || undefined}
                data-pending={value.pending || undefined}
                data-open={open === value.id || undefined}
                onClick={() => setOpen(open === value.id ? null : value.id)}
              >
                <span className="axma-name">{value.name}</span>
                <span className={value.held ? "axma-sealed" : "axma-where"}>
                  {value.held ? (
                    <LockKey weight="fill" />
                  ) : (
                    <GitBranch weight="bold" />
                  )}
                  {value.where.toLowerCase()}
                </span>
                <span className="axma-to">
                  {value.product} · <code>{value.service}</code>
                  {value.pending && <b>not live yet</b>}
                </span>
              </button>
            ))}
          </div>
          {shown && group.items.some((item) => item.id === shown.id) && (
            <Opened
              value={shown}
              story={story}
              now={now}
              applicationId={applicationId}
            />
          )}
        </section>
      ))}

      {story.files.length > 0 && (
        <section className="axma-files" aria-label="Configuration files">
          <header>
            <h3>Written as files</h3>
            <small>
              Placed beside the containers and mounted into them. What they say
              is in the record; this page does not print it.
            </small>
          </header>
          <div className="axma-file-list">
            <div className="axma-file axma-file-head">
              <span>File</span>
              <span>Read by</span>
              <span>Size</span>
              <span>Checksum</span>
            </div>
            {story.files.map((file) => (
              <div className="axma-file" key={file.id}>
                <span>
                  <FileText weight="bold" aria-hidden="true" />
                  <code>{file.name}</code>
                  <small>mode {file.mode}</small>
                </span>
                <span>
                  {file.product}
                  <small>
                    <code>{file.target}</code>
                    {file.readOnly ? " · read-only" : ""}
                  </small>
                </span>
                <span>{sizeWords(file.bytes)}</span>
                <span>
                  <code>{file.sha}</code>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="axma-foot">
        <LittleServer
          mood={story.waiting.length ? "attention" : "ready"}
          className="axma-guy"
        />
        <div>
          <p>
            Values reach only the processes that need them. A change is recorded
            here the moment it is made, and reaches the running processes with
            the next release or restart — the page says which until it has.
            {story.appliedAt
              ? ` These were applied with the deployment on ${when(story.appliedAt)}.`
              : ""}
          </p>
          <button
            type="button"
            className="ax-textlink"
            onClick={() => onOpenDestination("deployment")}
          >
            The deployment that applied them
          </button>
        </div>
      </footer>
      {story.invented && <p className="ax-invented">{story.invented}</p>}
    </section>
  );
}

/** What one entry means, and what changing it would cost. */
function Opened({
  value,
  story,
  now,
  applicationId,
}: {
  value: Value;
  story: SupplyProps["story"];
  now: number;
  applicationId?: string;
}) {
  const held = value.held;
  return (
    <div className="axma-open" role="region" aria-label={value.name}>
      <h3>{value.name}</h3>
      <p>
        {value.why ??
          (held
            ? "The intake recorded no reason for this one; it is held on the host and given to the process that needs it."
            : `The plan states this value in the open, so it is part of the repository at the recorded revision.`)}
      </p>
      <dl className="ax-facts">
        <div>
          <dt>Given to</dt>
          <dd>
            {value.product} · <code>{value.service}</code>
          </dd>
        </div>
        <div>
          <dt>Where the value is</dt>
          <dd>
            {value.held && applicationId ? (
              <>
                {value.revealable
                  ? `${value.where}. Haldur generated it, so you have never seen it — read it back here when you need it.`
                  : `${value.where}, and never printed here.`}
                <RevealSecret
                  applicationId={applicationId}
                  name={value.name}
                  revealable={Boolean(value.revealable)}
                  changing={Boolean(value.changing)}
                />
              </>
            ) : (
              `${value.where}, and never printed here`
            )}
          </dd>
        </div>
        <div>
          <dt>Applied</dt>
          <dd>
            {value.pending
              ? "Recorded, but the running process still has the old one"
              : story.appliedAt
                ? `With the deployment, ${ago(story.appliedAt, now)}`
                : "Not applied yet"}
          </dd>
        </div>
        <div>
          <dt>Changing it</dt>
          <dd>
            {value.changing
              ? "A replacement is part-way through. The value that still works is kept until the new one is proven."
              : held
                ? "Ask in the conversation. Changing a credential is an operational change: the service it authenticates to has to be updated too, and the new value only becomes current once it is proven to work."
                : "It lives in the repository, so it changes with a release."}
          </dd>
        </div>
      </dl>
    </div>
  );
}
