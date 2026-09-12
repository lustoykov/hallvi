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

export function InformationCard(props: {
  record: SavedInformation;
  onOpen?: (view: ApplicationSection) => void;
  currentView?: ApplicationSection;
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
}: {
  record: SavedInformation;
  onOpen?: (view: ApplicationSection) => void;
  /** The destination this card is already sitting in, so it does not
      offer to open the page you are reading. */
  currentView?: ApplicationSection;
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

  return (
    <article
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

      <InformationBody source={record.body} />

      {facts.length > 0 && (
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
      )}

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
    </article>
  );
}
