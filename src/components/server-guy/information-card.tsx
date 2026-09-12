"use client";
import type { SavedInformation } from "@/server/operator-data";
import { Markdown } from "./markdown";
import { LocalTime } from "./local-time";
import {
  applicationSections,
  type ApplicationSection,
} from "./application-sections";
import "./information-card.css";

export function InformationCard({
  record,
  onOpen,
}: {
  record: SavedInformation;
  onOpen?: (view: ApplicationSection) => void;
}) {
  const presentation = record.presentation;
  if (!presentation) return null;
  const destinations = applicationSections.filter((s) =>
    presentation.views.includes(s.id),
  );
  return (
    <article
      className={`sg-information-card ${presentation.status}`}
      data-information-id={record.id}
    >
      <header>
        <span className="sg-information-status">
          {record.retiredAt ? "Retired" : presentation.status}
        </span>
        <strong>{record.title}</strong>
        <LocalTime
          value={record.establishedAt ?? record.updatedAt}
          variant="compact"
        />
      </header>
      <Markdown source={record.body} />
      {presentation.checks.length > 0 && (
        <ul className="sg-information-checks">
          {presentation.checks.map((check, i) => (
            <li key={i} data-status={check.status}>
              <span aria-hidden="true">
                {check.status === "passed"
                  ? "✓"
                  : check.status === "failed"
                    ? "!"
                    : "·"}
              </span>{" "}
              {check.label}
            </li>
          ))}
        </ul>
      )}
      {presentation.nextStep && (
        <p className="sg-information-next">Next: {presentation.nextStep}</p>
      )}
      <footer>
        {presentation.url && (
          <a href={presentation.url} target="_blank" rel="noreferrer">
            Open application ↗
          </a>
        )}
        {onOpen &&
          destinations.map((view) => (
            <button type="button" key={view.id} onClick={() => onOpen(view.id)}>
              Open {view.label} →
            </button>
          ))}
      </footer>
      <small>
        {record.establishedAt ? "Last established" : "Saved"}:{" "}
        <LocalTime value={record.establishedAt ?? record.updatedAt} />
      </small>
      {record.evidence.length > 0 && (
        <details>
          <summary>Evidence ({record.evidence.length})</summary>
          <ul>
            {record.evidence.map((e, i) => (
              <li key={i}>
                {e.type === "url" ? (
                  <a href={e.url} target="_blank" rel="noreferrer">
                    Source ↗
                  </a>
                ) : e.type === "execution" ? (
                  <a
                    href={`/applications/${record.applicationId}?execution=${e.id}#logs`}
                  >
                    Execution details
                  </a>
                ) : (
                  <a
                    href={`/applications/${record.applicationId}?message=${e.id}`}
                  >
                    Conversation message
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
