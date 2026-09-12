"use client";

// One saved record, read the way the rest of the workspace reads evidence:
// how certain it is first, then what it says, then what was actually checked,
// then where to look next. The card never invents certainty — every word in
// the header comes from what Pi established and when.

import { ArrowUpRight, CaretDown } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { SavedInformation } from "@/server/operator-data";
import { Markdown } from "./markdown";
import { LocalTime } from "./local-time";
import {
  applicationSections,
  type ApplicationSection,
} from "./application-sections";
import { Tag, toneOf } from "./presentation";
import "./information-card.css";

export function InformationCard({
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
  const body = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);

  // A record can be a sentence or six dense lines. Fold the long ones so a
  // view full of cards stays scannable, and only offer the control when
  // there is something folded away.
  useEffect(() => {
    const element = body.current;
    // Only measurable while folded; unfolded, the answer stays as it was.
    if (!element || open) return;
    const timer = setTimeout(
      () => setLong(element.scrollHeight - element.clientHeight > 4),
      0,
    );
    return () => clearTimeout(timer);
  }, [record.body, open]);

  if (!presentation) return null;
  const { tone, word } = toneOf(record);
  const destinations = applicationSections.filter(
    (section) =>
      presentation.views.includes(section.id) && section.id !== currentView,
  );
  const established = record.establishedAt ?? record.updatedAt;
  const recommendation = presentation.role === "recommendation";

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

      <div
        className="sg-info-body"
        ref={body}
        data-folded={open ? undefined : ""}
      >
        <Markdown source={record.body} />
      </div>
      {long && (
        <button
          type="button"
          className="sg-info-unfold"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <CaretDown weight="bold" aria-hidden="true" />
          {open ? "Show less" : "Read the whole account"}
        </button>
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
