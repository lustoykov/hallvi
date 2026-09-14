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
  const established = record.establishedAt ?? record.updatedAt;
  const recommendation = presentation.role === "recommendation";
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
      <dl className="sg-info-facts">
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
        <p className="sg-info-basis">
          As reported, not measured here: {told.join(", ")}.
        </p>
      )}
      {intended.length > 0 && (
        <p className="sg-info-basis">
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
          <details className="sg-info-more">
            <summary>{facts.length} details</summary>
            {factList}
          </details>
        ) : (
          factList
        ))}

      {presentation.checks.length > 0 && (
        <ul className="sg-info-checks">
          {presentation.checks.map((check, index) => (
            <li key={index} data-status={check.status}>
              <span aria-hidden="true" />
              {check.label}
            </li>
          ))}
        </ul>
      )}

      {presentation.nextStep && (
        <p className="sg-info-next">
          <span>{recommendation ? "What Pi suggests" : "Next"}</span>
          {presentation.nextStep}
        </p>
      )}

      {(presentation.url || destinations.length > 0) && (
        <footer className="sg-info-foot">
          {presentation.url && (
            <a
              className="sg-info-open"
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
                className="sg-info-go"
                key={view.id}
                onClick={() => onOpen(view.id)}
              >
                {view.label}
              </button>
            ))}
        </footer>
      )}

      {record.evidence.length > 0 && (
        <details className="sg-info-evidence">
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

  if (superseded || routine)
    return (
      <article
        /* The first appearance carries the anchor even when it is compact.
           This branch serves both cases, and setting no id at all meant a
           record whose first appearance was routine never mounted the target
           its later copies link to — every "see it in full above" on such a
           record went nowhere, including after a reload. A superseded copy
           must not claim it either, or the link would scroll to itself. */
        id={superseded ? undefined : `record-${record.id}`}
        className="sg-result"
        data-tone={tone}
        data-quiet=""
        data-information-id={record.id}
      >
        <div className="sg-result-head">
          <span className="sg-result-dot" data-tone={tone} aria-hidden="true" />
          <h3 title={record.title}>{record.title}</h3>
          {routine && presentation.url && reachable !== "closed" && (
            <a
              className="sg-result-open"
              href={presentation.url}
              target="_blank"
              rel="noreferrer"
            >
              Open <ArrowUpRight aria-hidden="true" weight="bold" />
            </a>
          )}
          {routine && presentation.url && reachable === "closed" && (
            <span className="sg-result-shut">Tunnel closed</span>
          )}
          <span className="sg-result-then">
            <LocalTime value={established} variant="compact" />
          </span>
        </div>
        {superseded ? (
          /* A repeat of a record already shown. Rather than a second copy of
             the evidence, it links to the one that holds it — an ordinary
             anchor, so it survives a reload and works with browser back. */
          <p className="sg-result-alone">
            <a href={`#record-${record.id}`}>{word} · see it in full above</a>
          </p>
        ) : (
          <details className="sg-result-more sg-result-alone">
            <summary>
              {passed > 0
                ? `${passed} check${passed === 1 ? "" : "s"} passed · details`
                : "Details"}
            </summary>
            <div className="sg-result-inside">{body}</div>
          </details>
        )}
      </article>
    );

  return (
    <article
      id={`record-${record.id}`}
      className="sg-info"
      data-tone={tone}
      data-role={presentation.role}
      data-information-id={record.id}
    >
      <header className="sg-info-head">
        <Tag tone={tone}>{word}</Tag>
        <h3>{record.title}</h3>
        <span className="sg-info-when">
          {record.establishedAt ? "Established" : "Saved"}{" "}
          <LocalTime value={established} variant="compact" />
        </span>
      </header>
      {body}
    </article>
  );
}
