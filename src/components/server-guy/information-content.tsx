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
import { Tag, toneOf } from "./presentation";
import { LocalTime } from "./local-time";
import { InformationBody } from "./information-body";
import "./information-content.css";

export function InformationContent({
  record,
  currentView,
  onOpen,
}: {
  record: SavedInformation;
  currentView?: ApplicationSection;
  onOpen?: (view: ApplicationSection) => void;
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
  return (
    <article
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
