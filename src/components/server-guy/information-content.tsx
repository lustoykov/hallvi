"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Check,
  LockSimple,
  Globe,
  Warning,
} from "@phosphor-icons/react";
import type { SavedInformation } from "@/server/operator-data";
import type { ApplicationSection } from "./application-sections";
import type { Reachability } from "./deployment-prototype/page-head";
import { Tag, toneOf } from "./presentation";
import { recordDestination } from "./application-sections";
import { LocalTime } from "./local-time";
import { InformationBody } from "./information-body";
import "./information-content.css";

export function InformationContent({
  record,
  currentView,
  onOpen,
  superseded,
  reachable,
}: {
  record: SavedInformation;
  currentView?: ApplicationSection;
  onOpen?: (view: ApplicationSection) => void;
  /** Already shown in full earlier in this conversation. */
  superseded?: boolean;
  /**
   * Whether the tunnel behind an access record's URL is still open. The card
   * is a record and keeps every word it was written with; only the anchor is
   * withheld, because a dead link that looks alive costs the reader a click,
   * a wait and a browser error to learn what the page already knew.
   */
  reachable?: Reachability;
}) {
  const presentation = record.presentation!;
  const content = presentation.content!;
  const { tone, word } = toneOf(record);
  const compact = !currentView;
  const access = content.kind === "application-access";
  const primary = access && currentView === "overview";
  const details =
    content.kind === "deployment" ? (
      <>
        <dl className="sg-record-facts">
          <div>
            <dt>Source</dt>
            <dd>
              <a href={content.repositoryUrl} target="_blank" rel="noreferrer">
                {new URL(content.repositoryUrl).pathname.replace(/^\//, "")}
              </a>
            </dd>
          </div>
          <div>
            <dt>Source revision</dt>
            <dd>
              <code title={content.revision}>
                {content.revision.slice(0, 12)}
              </code>
            </dd>
          </div>
          <div>
            <dt>Running image</dt>
            <dd>
              <code>{content.image}</code>
            </dd>
          </div>
          <div>
            <dt>Server</dt>
            <dd>{content.server}</dd>
          </div>
        </dl>
        {content.changes.length > 0 && (
          <div className="sg-record-changes">
            <h4>Changes made for this deployment</h4>
            <ul>
              {content.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </div>
        )}
      </>
    ) : null;
  const checks = presentation.checks.length > 0 && (
    <ul className="sg-record-checks">
      {presentation.checks.map((check, index) => (
        <li key={index} data-status={check.status}>
          {check.status === "passed" ? (
            <Check aria-hidden="true" weight="bold" />
          ) : check.status === "failed" ? (
            <Warning aria-hidden="true" />
          ) : (
            <span aria-hidden="true">—</span>
          )}
          {check.label}
        </li>
      ))}
    </ul>
  );
  // ---- The routine result, said once.
  //
  // A verified access record in the transcript took 408px to report that an
  // application answers on this PC, and said so five times on the way: the
  // Verified badge, the title, the paragraph, the access row and a check all
  // carried the same fact. Three of them in a row — which is what a real
  // conversation contained — spent 1,200px on one sentence.
  //
  // A result that went well is one line, its one qualification, and a way in.
  // Everything that was on the face is still here, one disclosure down. This
  // applies only to a verified record with nothing waiting on the reader: a
  // failure, a warning or a next step keeps the room it needs.
  const routine =
    compact && tone === "verified" && !presentation.nextStep && !primary;
  const elsewhere = recordDestination(presentation.views, currentView);
  const passed = presentation.checks.filter(
    (check) => check.status === "passed",
  ).length;

  if (superseded)
    return (
      <article
        className="sg-result"
        data-kind={content.kind}
        data-tone={tone}
        data-quiet=""
        data-information-id={record.id}
      >
        <div className="sg-result-head">
          <span className="sg-result-dot" data-tone={tone} aria-hidden="true" />
          <h3 title={record.title}>{record.title}</h3>
          <span className="sg-result-then">
            <LocalTime
              value={record.establishedAt ?? record.updatedAt}
              variant="compact"
            />
          </span>
        </div>
        <p className="sg-result-alone">
          {/* The same rule as the generic card: a repeat goes to the page
              that renders the record, because the first appearance is often
              just as compact and "in full" delivered nothing. */}
          {onOpen && elsewhere ? (
            <button
              type="button"
              className="sg-result-elsewhere"
              onClick={() => onOpen(elsewhere.id)}
            >
              {word} · open {elsewhere.label}
            </button>
          ) : (
            <a href={`#record-${record.id}`}>{word} · see it in full above</a>
          )}
        </p>
      </article>
    );

  if (routine)
    return (
      <article
        id={`record-${record.id}`}
        className="sg-result"
        data-kind={content.kind}
        data-context="chat"
        data-tone={tone}
        data-information-id={record.id}
      >
        <div className="sg-result-head">
          <Check className="sg-result-mark" aria-hidden="true" weight="bold" />
          <h3 title={record.title}>{record.title}</h3>
          {access && presentation.url && reachable !== "closed" && (
            <a
              className="sg-result-open"
              href={presentation.url}
              target="_blank"
              rel="noreferrer"
            >
              Open <ArrowUpRight aria-hidden="true" weight="bold" />
            </a>
          )}
          {access && presentation.url && reachable === "closed" && (
            <span className="sg-result-shut">Tunnel closed</span>
          )}
        </div>
        {/* The limitation stays on the face. Compactness must not hide the
            thing that decides whether the link will work tomorrow. */}
        <p className="sg-result-scope">
          {access
            ? content.mode === "private"
              ? "Only on this PC, while the tunnel is open"
              : "Reachable from the internet"
            : content.kind === "deployment"
              ? `${content.server} · ${content.revision.slice(0, 7)}`
              : ""}
        </p>
        <div className="sg-result-meta">
          <span>
            {record.establishedAt ? "Checked" : "Saved"}{" "}
            <LocalTime
              value={record.establishedAt ?? record.updatedAt}
              variant="compact"
            />
            {passed > 0 &&
              ` · ${passed} check${passed === 1 ? "" : "s"} passed`}
          </span>
          <details className="sg-result-more">
            <summary>Details</summary>
            <div className="sg-result-inside">
              <div className="sg-record-body">
                <InformationBody source={record.body} />
              </div>
              {access && presentation.url && (
                <p className="sg-result-url">
                  <code>{presentation.url}</code>
                </p>
              )}
              {details}
              {checks}
              {onOpen && presentation.views.includes("deployment") && (
                <button
                  type="button"
                  className="sg-info-go"
                  onClick={() => onOpen("deployment")}
                >
                  View deployment <ArrowRight aria-hidden="true" />
                </button>
              )}
            </div>
          </details>
        </div>
      </article>
    );

  return (
    <article
      id={`record-${record.id}`}
      className="sg-record"
      data-kind={content.kind}
      data-context={currentView ?? "chat"}
      data-tone={tone}
      data-information-id={record.id}
    >
      <header className="sg-record-head">
        <Tag tone={tone}>{word}</Tag>
        <span>
          {record.establishedAt ? "Established" : "Saved"}{" "}
          <LocalTime
            value={record.establishedAt ?? record.updatedAt}
            variant="compact"
          />
        </span>
      </header>
      <h3>{record.title}</h3>
      <div className="sg-record-body">
        <InformationBody source={record.body} />
      </div>
      {access && (
        <>
          <div className="sg-record-access">
            <span>
              {content.mode === "private" ? (
                <LockSimple aria-hidden="true" />
              ) : (
                <Globe aria-hidden="true" />
              )}
              {content.mode === "private" ? "Only on this PC" : "Public access"}
            </span>
            <code>{presentation.url}</code>
            <a
              className="sg-info-open"
              href={presentation.url}
              target="_blank"
              rel="noreferrer"
            >
              Open application <ArrowUpRight aria-hidden="true" weight="bold" />
            </a>
          </div>
          {!compact && content.mode === "private" && (
            <>
              <div
                className="sg-record-route"
                aria-label="Private access route"
              >
                <div>
                  <strong>Your browser</strong>
                  <span>127.0.0.1:{content.localPort}</span>
                </div>
                <ArrowRight aria-hidden="true" />
                <div>
                  <strong>Encrypted SSH</strong>
                  <span>From this PC</span>
                </div>
                <ArrowRight aria-hidden="true" />
                <div>
                  <strong>{content.server}</strong>
                  <span>Loopback port {content.remotePort}</span>
                </div>
              </div>
              <p className="sg-record-note">
                This link works on the PC running Server Guy while its SSH
                tunnel is open. If it stops working, ask Pi to reopen private
                access.
              </p>
            </>
          )}
        </>
      )}
      {compact && details ? (
        <details className="sg-record-details">
          <summary>Deployment details</summary>
          {details}
          {checks}
        </details>
      ) : (
        <>
          {details}
          {primary ? (
            <details className="sg-record-details">
              <summary>What was verified</summary>
              {checks}
            </details>
          ) : (
            checks
          )}
        </>
      )}
      {presentation.nextStep && (
        <p className="sg-record-next">{presentation.nextStep}</p>
      )}
      {onOpen && compact && presentation.views.includes("deployment") && (
        <button
          type="button"
          className="sg-info-go"
          onClick={() => onOpen("deployment")}
        >
          View deployment <ArrowRight aria-hidden="true" />
        </button>
      )}
      {record.evidence.length > 0 && (
        <details className="sg-record-evidence">
          <summary>Evidence · {record.evidence.length}</summary>
          <ul>
            {record.evidence.map((item, index) => (
              <li key={index}>
                <a
                  href={
                    item.type === "url"
                      ? item.url
                      : `/applications/${record.applicationId}?${item.type === "execution" ? "execution" : "message"}=${item.id}${item.type === "execution" ? "#logs" : ""}`
                  }
                  target={item.type === "url" ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  {item.type === "execution"
                    ? "Recorded command"
                    : item.type === "message"
                      ? "Conversation message"
                      : "Application endpoint"}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
