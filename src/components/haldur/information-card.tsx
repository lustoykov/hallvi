"use client";

// One saved record, read the way the rest of the workspace reads evidence:
// how certain it is first, then what it says, then what was actually checked,
// then where to look next. The card never invents certainty — every word in
// the header comes from what Pi established and when.

import { ArrowUpRight } from "@phosphor-icons/react";

import type { SavedInformation } from "@/server/operator-data";
import { InformationBody } from "./information-body";
import { LocalTime } from "./local-time";
import {
  applicationSections,
  recordDestination,
  type ApplicationSection,
} from "./application-sections";
import { Tag, toneOf } from "./presentation";
import "./information-card.css";
import { InformationContent } from "./information-content";
import type { Reachability } from "./deployment-prototype/page-head";

export function InformationCard(props: {
  record: SavedInformation;
  onOpen?: (view: ApplicationSection) => void;
  currentView?: ApplicationSection;
  /** A later record states the same subject; see GenericInformationCard. */
  superseded?: boolean;
  /** See InformationContent: an access URL outlives the tunnel behind it. */
  reachable?: Reachability;
}) {
  return props.record.presentation?.content ? (
    <InformationContent {...props} />
  ) : (
    <GenericInformationCard {...props} />
  );
}

function GenericInformationCard({
  record,
  onOpen,
  currentView,
  superseded,
  reachable,
}: {
  record: SavedInformation;
  onOpen?: (view: ApplicationSection) => void;
  /** See InformationContent: an access URL outlives the tunnel behind it. */
  reachable?: Reachability;
  /** The destination this card is already sitting in, so it does not
      offer to open the page you are reading. */
  currentView?: ApplicationSection;
  /**
   * A later record in the same conversation states this same subject, so
   * this one is history. It keeps its place, its words and its evidence and
   * gives up the room: one real transcript carried the same failure three
   * times at 653px each, which reads as three problems rather than one
   * re-checked twice.
   */
  superseded?: boolean;
}) {
  const presentation = record.presentation;

  if (!presentation) return null;
  const { tone, word } = toneOf(record);
  const destinations = applicationSections.filter(
    (section) =>
      presentation.views.includes(section.id) && section.id !== currentView,
  );
  const elsewhere = recordDestination(presentation.views, currentView);
  const established = record.establishedAt ?? record.updatedAt;
  const recommendation = presentation.role === "recommendation";
  /**
   * Retired: a later record replaced this one, so it is history.
   *
   * It used to render at full height with its red failed check and its
   * "Next" line intact. A reader scrolling the conversation met a resolved
   * failure that still told them what to do about it — in one real
   * transcript, a transfer that failed at 11:53 and succeeded at 11:55 sat
   * there advising a retry, which is not history, it is a to-do nobody
   * needs. The failure stays; the instruction and the alarm go.
   */
  const retired = Boolean(record.retiredAt);
  // Records written before facts existed have none: the presentation column
  // is JSON read back by cast, not by parse.
  const facts = presentation.facts ?? [];
  const labels = (basis: string) =>
    facts.filter((fact) => fact.basis === basis).map((fact) => fact.label);
  const told = labels("reported");
  const intended = labels("planned");

  // Folded in a transcript, open on the destination the record belongs to.
  const foldFacts = !currentView && facts.length > 4;
  const factList = (
    <>
      <dl className="hd-info-facts">
        {facts.map((fact, index) => (
          // A value too long for a column takes the whole row rather
          // than breaking an identifier across two lines.
          <div key={index} data-wide={fact.value.length > 26 || undefined}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {/* Said once for the whole card. Repeating it under every value
          turns one honest qualification into five lines of noise. */}
      {told.length > 0 && (
        <p className="hd-info-basis">
          As reported, not measured here: {told.join(", ")}.
        </p>
      )}
      {intended.length > 0 && (
        <p className="hd-info-basis">
          Planned, not in place yet: {intended.join(", ")}.
        </p>
      )}
    </>
  );

  const body = (
    <>
      <InformationBody source={record.body} />

      {facts.length > 0 &&
        // A spec sheet is supporting evidence, not the outcome. Ten rows of
        // server size, region and monthly cost under a two-line result made
        // a 726px card out of one sentence and one next step. On the
        // destination the record belongs to they stay open — that page is
        // about them; in a transcript they fold.
        (foldFacts ? (
          <details className="hd-info-more">
            <summary>{facts.length} details</summary>
            {factList}
          </details>
        ) : (
          factList
        ))}

      {presentation.checks.length > 0 && (
        <ul className="hd-info-checks">
          {presentation.checks.map((check, index) => (
            <li key={index} data-status={check.status}>
              <span aria-hidden="true" />
              {check.label}
            </li>
          ))}
        </ul>
      )}

      {presentation.nextStep && !retired && (
        <p className="hd-info-next">
          <span>{recommendation ? "What Pi suggests" : "Next"}</span>
          {presentation.nextStep}
        </p>
      )}

      {(presentation.url || destinations.length > 0) && (
        <footer className="hd-info-foot">
          {presentation.url && (
            <a
              className="hd-info-open"
              href={presentation.url}
              target="_blank"
              rel="noreferrer"
            >
              Open application
              <ArrowUpRight weight="bold" aria-hidden="true" />
            </a>
          )}
          {onOpen &&
            destinations.map((view) => (
              <button
                type="button"
                className="hd-info-go"
                key={view.id}
                onClick={() => onOpen(view.id)}
              >
                {view.label}
              </button>
            ))}
        </footer>
      )}

      {record.evidence.length > 0 && (
        <details className="hd-info-evidence">
          <summary>
            What this rests on
            <em>{record.evidence.length}</em>
          </summary>
          <ul>
            {record.evidence.map((item, index) => (
              <li key={index}>
                {item.type === "url" ? (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    The page it answered with
                    <ArrowUpRight weight="bold" aria-hidden="true" />
                  </a>
                ) : item.type === "execution" ? (
                  <a
                    href={`/applications/${record.applicationId}?execution=${item.id}#logs`}
                  >
                    A command that ran
                  </a>
                ) : (
                  <a
                    href={`/applications/${record.applicationId}?message=${item.id}`}
                  >
                    A moment in the conversation
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );

  // Two reasons a record gives up the room, and neither hides anything.
  //
  // Superseded: it is already shown in full earlier in this conversation, so
  // this is the same record mentioned again.
  //
  // Routine: it went well, nothing is waiting on the reader, and it is being
  // read in a transcript rather than on the destination it belongs to. A
  // conversation is mostly results that went well; at 726px each they bury
  // the one that needs attention.
  const passed = presentation.checks.filter(
    (check) => check.status === "passed",
  ).length;
  const routine =
    !currentView &&
    !superseded &&
    tone === "verified" &&
    !presentation.nextStep &&
    !recommendation;

  if (superseded || routine || retired)
    return (
      <article
        /* The first appearance carries the anchor even when it is compact.
           This branch serves both cases, and setting no id at all meant a
           record whose first appearance was routine never mounted the target
           its later copies link to — every "see it in full above" on such a
           record went nowhere, including after a reload. A superseded copy
           must not claim it either, or the link would scroll to itself. */
        id={superseded ? undefined : `record-${record.id}`}
        className="hd-result"
        data-tone={tone}
        data-quiet=""
        data-information-id={record.id}
      >
        <div className="hd-result-head">
          {retired ? (
            /* The tag rather than the dot: "No longer current" is the whole
               point of this card, and a grey dot does not say it. */
            <Tag tone={tone}>{word}</Tag>
          ) : (
            <span
              className="hd-result-dot"
              data-tone={tone}
              aria-hidden="true"
            />
          )}
          <h3 title={record.title}>{record.title}</h3>
          {/* Three reasons not to offer it: the record is history, the way
              in has stopped working, or there is no address. */}
          {routine &&
            !retired &&
            presentation.url &&
            reachable !== "closed" && (
              <a
                className="hd-result-open"
                href={presentation.url}
                target="_blank"
                rel="noreferrer"
              >
                Open <ArrowUpRight aria-hidden="true" weight="bold" />
              </a>
            )}
          {routine && presentation.url && reachable === "closed" && (
            <span className="hd-result-shut">Tunnel closed</span>
          )}
          <span className="hd-result-then">
            <LocalTime value={established} variant="compact" />
          </span>
        </div>
        {superseded ? (
          /* A repeat of a record already shown. It used to link to that first
             appearance with an anchor — which is right only when the first
             appearance holds something more. Often it does not: a record
             mentioned twice in a conversation that went well is compact both
             times, so "see it in full above" scrolled the reader into the
             middle of history and showed them the same one line again.
             The place that renders this record in full is its destination,
             which the record already names in `views` — the same list the
             full card's pills come from — so that is where the repeat goes.
             Without a view, or without a shell to switch, the anchor is
             still the best there is. */
          <p className="hd-result-alone">
            {onOpen && elsewhere ? (
              <button
                type="button"
                className="hd-result-elsewhere"
                onClick={() => onOpen(elsewhere.id)}
              >
                {word} · open {elsewhere.label}
              </button>
            ) : (
              <a href={`#record-${record.id}`}>{word} · see it in full above</a>
            )}
          </p>
        ) : (
          <details className="hd-result-more hd-result-alone">
            <summary>
              {passed > 0
                ? `${passed} check${passed === 1 ? "" : "s"} passed · details`
                : "Details"}
            </summary>
            <div className="hd-result-inside">{body}</div>
          </details>
        )}
      </article>
    );

  return (
    <article
      id={`record-${record.id}`}
      className="hd-info"
      data-tone={tone}
      data-role={presentation.role}
      data-information-id={record.id}
    >
      <header className="hd-info-head">
        <Tag tone={tone}>{word}</Tag>
        <h3>{record.title}</h3>
        <span className="hd-info-when">
          {record.establishedAt ? "Established" : "Saved"}{" "}
          <LocalTime value={established} variant="compact" />
        </span>
      </header>
      {body}
    </article>
  );
}
