"use client";

// PROTOTYPE — leaf pieces the three variants arrange differently. Sharing a
// leaf is fine; each variant owns its own layout.
import {
  ArrowSquareOut,
  Check,
  Circle,
  GitPullRequest,
  Minus,
  Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { APPLICATION_PROFILE } from "@/server/application-profile";
import { APPROVAL_MODES } from "@/server/types";
import type {
  ActivityEvent,
  ConformanceProposalRecord,
  ConformanceRunRecord,
  ContractCitation,
  ContractProvenance,
  ExecutionEnvironmentStatus,
  GateCheck,
  Observation,
  OperatorView,
} from "@/server/types";

import { api } from "../api";
import { CheckIcon } from "../inspector";
import { LocalTime } from "../local-time";
import { statusLabel } from "../format";
import {
  contractVersions,
  isDemoRepository,
  type Stage,
  type StepAction,
} from "./phase-copy";
import p from "./prototype.module.css";
import { usePrototypeAction } from "./switcher";

export const short = (sha: string | null | undefined) =>
  sha?.slice(0, 8) ?? "unknown";

// "Source", never "Provenance", in the interface.
export const SOURCE_LABELS: Record<ContractProvenance["kind"], string> = {
  "repository-declared": "From the repository",
  "profile-rule": "Profile rule",
  "user-confirmed": "Your choice",
  inferred: "Inferred",
  unresolved: "Unresolved",
};

/** Current proposal first, then replaced or withdrawn ones, newest first. */
export function orderedProposals(view: OperatorView) {
  const conformance = view.conformance;
  if (!conformance) return [];
  const currentId = conformance.proposal?.id;
  return [...conformance.proposals].sort((a, b) =>
    a.id === currentId
      ? -1
      : b.id === currentId
        ? 1
        : b.createdAt.localeCompare(a.createdAt),
  );
}

export function policyLabel(view: OperatorView) {
  const mode = view.application?.approvalMode;
  return mode ? APPROVAL_MODES[mode].label : "";
}
export function policyHint(view: OperatorView) {
  const mode = view.application?.approvalMode;
  return mode ? APPROVAL_MODES[mode].hint : "";
}

/** A link that refuses to send anyone to an invented GitHub page. */
export function DemoAwareLink({
  view,
  href,
  children,
}: {
  view: OperatorView;
  href: string;
  children: React.ReactNode;
}) {
  if (isDemoRepository(view.application))
    return (
      <span
        className={p.demoLink}
        title="Demo repository: this GitHub URL is synthetic and does not exist"
      >
        {children} <em>demo · not a real link</em>
      </span>
    );
  return (
    <a href={href} rel="noreferrer" target="_blank">
      {children} <ArrowSquareOut aria-hidden="true" />
    </a>
  );
}

export function DemoBanner({ view }: { view: OperatorView }) {
  if (!isDemoRepository(view.application)) return null;
  return (
    <p className={p.demoBanner}>
      Demo repository{" "}
      <code>
        {view.application?.repositoryOwner}/{view.application?.repositoryName}
      </code>
      : Pi replies, GitHub and the runner are synthetic. Evidence links open
      local records; GitHub links are shown but not followed.
    </p>
  );
}

export function ActionButtons({
  actions,
  compact = false,
  onLink,
}: {
  actions: StepAction[];
  compact?: boolean;
  onLink?: (action: StepAction) => void;
}) {
  const act = usePrototypeAction();
  if (!actions.length) return null;
  return (
    <div className={`${p.actions} ${compact ? p.actionsCompact : ""}`}>
      {actions.map((action) => {
        if (action.kind === "link" && action.href && !action.demo)
          return action.href.startsWith("/") ? (
            <Link className={p.linkButton} href={action.href} key={action.key}>
              {action.label}
            </Link>
          ) : (
            <a
              className={p.linkButton}
              href={action.href}
              key={action.key}
              rel="noreferrer"
              target="_blank"
            >
              {action.label} <ArrowSquareOut aria-hidden="true" />
            </a>
          );
        if (action.kind === "link" && action.demo)
          return (
            <span
              className={p.demoLink}
              key={action.key}
              title={action.explanation}
            >
              {action.label} <em>demo · not a real link</em>
            </span>
          );
        return (
          <button
            className={
              action.kind === "primary"
                ? "sg-primary-button"
                : action.kind === "secondary"
                  ? "sg-secondary-button"
                  : "sg-text-button"
            }
            key={action.key}
            onClick={() => {
              act(action.label);
              onLink?.(action);
            }}
            title={action.explanation}
            type="button"
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

export function WaitingPill({
  waitingOn,
}: {
  waitingOn: "you" | "server-guy" | "github" | "none";
}) {
  const label =
    waitingOn === "you"
      ? "Waiting for you"
      : waitingOn === "server-guy"
        ? "Server Guy is working"
        : waitingOn === "github"
          ? "Waiting for GitHub"
          : "Nothing waiting";
  return (
    <span className={`${p.waiting} ${p[`waiting_${waitingOn}`]}`}>{label}</span>
  );
}

export function StageList({
  stages,
  horizontal = false,
}: {
  stages: Stage[];
  horizontal?: boolean;
}) {
  if (!stages.length) return null;
  return (
    <ol
      className={`${p.stages} ${horizontal ? p.stagesRow : ""}`}
      aria-label="Phase 3 stages"
    >
      {stages.map((stage, index) => (
        <li className={p[`stage_${stage.state}`]} key={stage.key}>
          <span className={p.stageMark} aria-hidden="true">
            {stage.state === "done" ? (
              <Check weight="bold" />
            ) : stage.state === "skipped" ? (
              <Minus weight="bold" />
            ) : (
              index + 1
            )}
          </span>
          <span className={p.stageCopy}>
            <strong>{stage.label}</strong>
            {stage.note && <small>{stage.note}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function CheckRows({
  checks,
  onOpen,
  numbered = true,
}: {
  checks: GateCheck[];
  onOpen: (key: string) => void;
  numbered?: boolean;
}) {
  return (
    <ul className={p.checkRows}>
      {checks.map((check, index) => (
        <li key={check.key}>
          <button onClick={() => onOpen(check.key)} type="button">
            <CheckIcon status={check.status} />
            <span>
              <strong>
                {numbered ? `${index + 1}. ` : ""}
                {check.label}
              </strong>
              <small>{check.result}</small>
            </span>
            <em className={p[`status_${check.status}`]}>
              {statusLabel(check.status)}
            </em>
          </button>
        </li>
      ))}
    </ul>
  );
}

function sourceHref(
  view: OperatorView,
  commitSha: string,
  citation: ContractCitation,
) {
  const url = view.application?.repositoryUrl ?? "";
  if ("absent" in citation) return `${url}/tree/${commitSha}`;
  return `${url}/blob/${commitSha}/${citation.path}${citation.line ? `#L${citation.line}` : ""}`;
}

function SourceDetail({
  view,
  provenance,
  commitSha,
}: {
  view: OperatorView;
  provenance: ContractProvenance;
  commitSha: string;
}) {
  if (provenance.kind === "profile-rule")
    return (
      <small>
        Rule {provenance.ruleId} of {APPLICATION_PROFILE.label} v
        {APPLICATION_PROFILE.version}
      </small>
    );
  if (provenance.kind === "user-confirmed")
    return (
      <small>
        {provenance.source.type === "decision" ? (
          <a
            href={`/api/decisions/${provenance.source.decisionId}`}
            rel="noreferrer"
            target="_blank"
          >
            Saved requirement <ArrowSquareOut aria-hidden="true" />
          </a>
        ) : (
          <>You said: “{provenance.source.quote}”</>
        )}
      </small>
    );
  if (provenance.kind === "unresolved")
    return (
      <small>
        {provenance.blocker === "policy"
          ? `Open policy ${provenance.dependency}: ${provenance.reason}`
          : `${provenance.blocker}: ${provenance.reason}`}
      </small>
    );
  const citation = provenance.citation;
  const label =
    "absent" in citation
      ? `${citation.absent} absent from tree`
      : `${citation.path}${citation.line ? `:${citation.line}` : ""}`;
  return (
    <small>
      {"snippet" in citation && <code>{citation.snippet.trim()}</code>}{" "}
      <DemoAwareLink view={view} href={sourceHref(view, commitSha, citation)}>
        {label}
      </DemoAwareLink>
    </small>
  );
}

/**
 * The Application Contract grouped by responsibility, every group collapsed
 * to a one-line preview until opened, "Source" instead of "Provenance", and
 * version history beside the heading.
 */
export function ContractCompact({
  view,
  open = false,
  showVersions = true,
}: {
  view: OperatorView;
  open?: boolean;
  showVersions?: boolean;
}) {
  const contract = view.contract;
  const [versionsOpen, setVersionsOpen] = useState(false);
  if (!contract)
    return (
      <p className={p.muted}>
        No Application Contract yet. Server Guy proposes it from the inspected
        repository.
      </p>
    );
  const versions = contractVersions(view);
  const groups = Object.entries(APPLICATION_PROFILE.groups) as Array<
    [keyof typeof APPLICATION_PROFILE.groups, string]
  >;
  return (
    <div className={p.contract}>
      <div className={p.contractHead}>
        <div>
          <strong>
            Application Contract v{contract.version} · commit{" "}
            {short(contract.commitSha)}
          </strong>
          <small>
            {APPLICATION_PROFILE.label} v{contract.profileVersion} ·{" "}
            <LocalTime value={contract.createdAt} variant="compact" /> ·{" "}
            <a
              href={`/api/contracts/${contract.id}`}
              rel="noreferrer"
              target="_blank"
            >
              Saved record <ArrowSquareOut aria-hidden="true" />
            </a>
          </small>
        </div>
        {showVersions && versions.length > 0 && (
          <button
            className="sg-text-button"
            onClick={() => setVersionsOpen((value) => !value)}
            type="button"
          >
            {versions.length === 1
              ? "Version history (1)"
              : `Version history (${versions.length})`}
          </button>
        )}
      </div>
      {versionsOpen && <VersionHistory view={view} />}
      <p className={p.contractSummary}>{contract.body.summary}</p>
      {contract.gaps.blockers.length > 0 && (
        <div className={`${p.gap} ${p.gapBlocked}`}>
          <strong>Needs your decision</strong>
          <ul>
            {contract.gaps.blockers.map((gap) => (
              <li key={gap.field}>
                <b>{gap.label}</b> · {gap.blocker}: {gap.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {contract.gaps.conformance.length > 0 && (
        <div className={`${p.gap} ${p.gapWork}`}>
          <strong>
            Required changes for Phase 3 ({contract.gaps.conformance.length})
          </strong>
          <ul>
            {contract.gaps.conformance.map((gap) => (
              <li key={gap.field}>
                <b>{gap.label}</b> · now: {gap.observed} · change: {gap.change}
              </li>
            ))}
          </ul>
        </div>
      )}
      {contract.gaps.policies.length > 0 && (
        <details className={p.gapDetails}>
          <summary>
            {contract.gaps.policies.length} open product polic
            {contract.gaps.policies.length === 1 ? "y" : "ies"} for later gates
          </summary>
          <ul>
            {contract.gaps.policies.map((gap) => (
              <li key={gap.field}>
                <b>{gap.label}</b> · required before phase{" "}
                {gap.requiredBeforePhase}
              </li>
            ))}
          </ul>
        </details>
      )}
      {groups.map(([group, label]) => {
        const fields = contract.body.fields.filter(
          (field) =>
            APPLICATION_PROFILE.fields.find((item) => item.key === field.key)
              ?.group === group,
        );
        if (!fields.length) return null;
        const preview = fields
          .slice(0, 3)
          .map((field) => field.value ?? "unresolved")
          .join(" · ");
        return (
          <details className={p.contractGroup} key={group} open={open}>
            <summary>
              <strong>{label}</strong>
              <small>
                {fields.length} field{fields.length === 1 ? "" : "s"} ·{" "}
                {preview}
              </small>
            </summary>
            <dl>
              {fields.map((field) => {
                const definition = APPLICATION_PROFILE.fields.find(
                  (item) => item.key === field.key,
                );
                return (
                  <div className={p.contractField} key={field.key}>
                    <dt title={definition?.definition}>
                      {definition?.label ?? field.key}
                    </dt>
                    <dd>
                      <span className={p.fieldValue}>
                        {field.value ?? <em>Unresolved</em>}
                      </span>
                      <span
                        className={`${p.source} ${p[`source_${field.provenance.kind}`]}`}
                      >
                        {SOURCE_LABELS[field.provenance.kind]}
                      </span>
                      {field.conformance && (
                        <span className={`${p.source} ${p.sourceWork}`}>
                          Phase 3 work
                        </span>
                      )}
                      <SourceDetail
                        view={view}
                        provenance={field.provenance}
                        commitSha={contract.commitSha}
                      />
                      {field.conformance && (
                        <small>
                          Now: {field.conformance.observed} · Change:{" "}
                          {field.conformance.change}
                        </small>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </details>
        );
      })}
    </div>
  );
}

export function VersionHistory({ view }: { view: OperatorView }) {
  const versions = contractVersions(view);
  const phaseThree = view.workspace?.phaseKey === "make-launch-ready";
  return (
    <ol className={p.versions} aria-label="Saved contract versions">
      {versions.map((version) => (
        <li
          key={version.version}
          className={version.current ? p.versionCurrent : ""}
        >
          <strong>
            v{version.version}
            {version.current ? " · current" : " · read-only"}
          </strong>
          <small>
            commit {short(version.commitSha)} ·{" "}
            <LocalTime value={version.when} variant="compact" />
          </small>
          <span>{version.why}</span>
          {!version.current && (
            <a
              href={`/api/contracts/${view.contract?.id ?? ""}`}
              rel="noreferrer"
              target="_blank"
            >
              Open saved version <ArrowSquareOut aria-hidden="true" />
            </a>
          )}
        </li>
      ))}
      {phaseThree && (
        <li className={p.muted}>
          Earlier versions from Inspect app are not loaded here yet: this
          prototype reads only the viewed phase’s Activity. Production needs a
          contract-history read.
        </li>
      )}
    </ol>
  );
}

type HistoryEntry =
  | { kind: "event"; at: string; event: ActivityEvent }
  | { kind: "source"; at: string; observation: Observation };

export type HistoryFilter = "all" | "changes" | "checks" | "sources";

function eventTone(kind: string) {
  if (
    /passed|completed|established|published|recorded|granted|accepted|approved/.test(
      kind,
    )
  )
    return p.toneGood;
  if (/failed|unavailable|invalidated|withdrawn|incomplete/.test(kind))
    return p.toneBad;
  return "";
}

/** Activity and source reads in one list. Ordinary replies are not here. */
export function HistoryList({
  view,
  filter = "all",
  limit,
}: {
  view: OperatorView;
  filter?: HistoryFilter;
  limit?: number;
}) {
  const entries: HistoryEntry[] = [
    ...view.activity
      .filter((event) =>
        filter === "all"
          ? true
          : filter === "changes"
            ? /contract|change|acceptance|publication|candidate|decision/.test(
                event.kind,
              )
            : filter === "checks"
              ? /repository|conformance|inspect|phase/.test(event.kind)
              : false,
      )
      .map((event) => ({ kind: "event" as const, at: event.createdAt, event })),
    ...(filter === "all" || filter === "sources"
      ? view.observations.map((observation) => ({
          kind: "source" as const,
          at: observation.observedAt,
          observation,
        }))
      : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const shown = limit ? entries.slice(0, limit) : entries;
  if (!shown.length) return <p className={p.muted}>Nothing recorded yet.</p>;
  return (
    <ol className={p.history}>
      {shown.map((entry) =>
        entry.kind === "event" ? (
          <li key={entry.event.id} className={eventTone(entry.event.kind)}>
            <span className={p.historyDot} aria-hidden="true" />
            <div>
              <strong>{entry.event.summary}</strong>
              <p>{entry.event.detail}</p>
              <LocalTime value={entry.event.createdAt} variant="compact" />
            </div>
          </li>
        ) : (
          <li key={entry.observation.id} className={p.historySource}>
            <span className={p.historyDot} aria-hidden="true" />
            <div>
              <strong>
                Source read · {entry.observation.sourceLabel}
                <em className={p[`status_${entry.observation.status}`]}>
                  {" "}
                  {entry.observation.status}
                </em>
              </strong>
              <p>{entry.observation.summary}</p>
              <span className={p.historyLinks}>
                <a
                  href={`/api/observations/${entry.observation.id}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Saved record <ArrowSquareOut aria-hidden="true" />
                </a>
                {entry.observation.sourceUrl && (
                  <DemoAwareLink view={view} href={entry.observation.sourceUrl}>
                    Open on GitHub
                  </DemoAwareLink>
                )}
                <LocalTime
                  value={entry.observation.observedAt}
                  variant="compact"
                />
              </span>
            </div>
          </li>
        ),
      )}
      {limit && entries.length > limit && (
        <li className={p.muted}>{entries.length - limit} earlier entries</li>
      )}
    </ol>
  );
}

const PROPOSAL_STATUS: Record<ConformanceProposalRecord["status"], string> = {
  proposed: "Waiting for your approval",
  approved: "Approved · not published yet",
  published: "Published",
  withdrawn: "Withdrawn",
  superseded: "Replaced by a newer proposal",
};

export function ProposalCard({
  view,
  proposal,
  showActions = true,
  compact = false,
}: {
  view: OperatorView;
  proposal: ConformanceProposalRecord;
  showActions?: boolean;
  compact?: boolean;
}) {
  const act = usePrototypeAction();
  const conformance = view.conformance;
  const current = conformance?.proposal?.id === proposal.id;
  const replaced =
    proposal.status === "superseded" ||
    (!current && proposal.status !== "withdrawn");
  const preview = conformance?.runs.find(
    (run) =>
      run.kind === "preview" &&
      run.source.overlayDigest === proposal.filesDigest,
  );
  const pull =
    proposal.publication?.pullRequestUrl ??
    proposal.external?.pullRequestUrl ??
    null;
  const pullNumber =
    proposal.publication?.pullRequestNumber ??
    proposal.external?.pullRequestNumber ??
    null;
  const pullState =
    proposal.publication?.state ?? proposal.external?.state ?? null;
  const [showDiff, setShowDiff] = useState(false);
  return (
    <article
      className={`${p.card} ${replaced ? p.cardReplaced : ""} ${compact ? p.cardCompact : ""}`}
      data-proposal-status={proposal.status}
      aria-label={`Proposed change ${short(proposal.id)}`}
    >
      <header>
        <GitPullRequest aria-hidden="true" />
        <span>
          <strong>
            {proposal.origin === "no-change"
              ? "No change required"
              : proposal.origin === "external"
                ? "Returned change"
                : "Proposed change"}
          </strong>
          <small>
            base {short(proposal.baseSha)} · contract v
            {proposal.contractVersion} ·{" "}
            <LocalTime value={proposal.createdAt} variant="compact" />
          </small>
        </span>
        <em
          className={replaced ? p.badgeReplaced : p[`badge_${proposal.status}`]}
        >
          {replaced ? "Replaced" : PROPOSAL_STATUS[proposal.status]}
        </em>
      </header>
      {replaced && (
        <p className={p.replacedNote}>
          <Warning aria-hidden="true" weight="bold" /> This proposal was
          replaced. Its approval no longer applies; review the current proposal
          instead.
        </p>
      )}
      <p>{proposal.summary}</p>
      {proposal.changes.length > 0 && (
        <ul className={p.files}>
          {proposal.changes.map((change) => (
            <li key={change.path}>
              <code>{change.path}</code>
              {change.content === null ? (
                <small>deleted</small>
              ) : change.baseObservationId ? null : (
                <small>new</small>
              )}
            </li>
          ))}
        </ul>
      )}
      {proposal.origin === "server-guy" && !compact && (
        <p
          className={`${p.preview} ${preview ? p[`preview_${preview.status}`] : p.preview_untested}`}
        >
          {preview
            ? `Preview ${preview.status} over this exact change (tree ${short(preview.source.treeDigest)}) · worker evidence, not the gate`
            : "Untested since the last edit: no preview ran over this exact change."}
        </p>
      )}
      {pull && (
        <p className={p.pull}>
          <DemoAwareLink view={view} href={pull}>
            {proposal.publication
              ? `${proposal.publication.branch} · pull request #${pullNumber}`
              : `pull request #${pullNumber}`}
          </DemoAwareLink>
          {pullState ? ` · ${pullState}` : ""}
          {pullState === "open" ? " · merge on GitHub, then refresh" : ""}
        </p>
      )}
      {proposal.candidate && (
        <p className={p.candidate}>
          <Check aria-hidden="true" weight="bold" /> Candidate{" "}
          {short(proposal.candidate.sha)} on {proposal.candidate.defaultBranch}{" "}
          ·{" "}
          {proposal.candidate.source === "merged-pull-request"
            ? `pull request #${proposal.candidate.merge?.pullRequestNumber} merged (${proposal.candidate.merge?.method})`
            : proposal.candidate.source === "external"
              ? "returned change merged"
              : "the contract commit"}
        </p>
      )}
      <div className={p.cardActions}>
        {proposal.changes.length > 0 && (
          <button
            className="sg-text-button"
            onClick={() => setShowDiff((value) => !value)}
            type="button"
          >
            {showDiff
              ? "Hide diff"
              : `Show diff (${proposal.changes.length} file${proposal.changes.length === 1 ? "" : "s"})`}
          </button>
        )}
        <a
          href={`/api/conformance/proposals/${proposal.id}`}
          rel="noreferrer"
          target="_blank"
        >
          Saved record <ArrowSquareOut aria-hidden="true" />
        </a>
        {showActions && current && proposal.status === "proposed" && (
          <button
            className={`sg-secondary-button ${p.smallButton}`}
            onClick={() => act("Approve change")}
            type="button"
          >
            <Check aria-hidden="true" weight="bold" /> Approve change
          </button>
        )}
        {showActions &&
          current &&
          proposal.status === "approved" &&
          proposal.origin === "server-guy" && (
            <button
              className={`sg-secondary-button ${p.smallButton}`}
              onClick={() =>
                act(
                  conformance?.grant
                    ? "Publish branch and pull request"
                    : "Allow publishing",
                )
              }
              type="button"
            >
              <GitPullRequest aria-hidden="true" />{" "}
              {conformance?.grant
                ? "Publish branch and pull request"
                : "Allow publishing"}
            </button>
          )}
        {showActions && current && pull && !proposal.candidate && (
          <button
            className="sg-secondary-button"
            onClick={() => act("Refresh from GitHub")}
            type="button"
          >
            Refresh from GitHub
          </button>
        )}
      </div>
      {showDiff && <ProposalDiff proposalId={proposal.id} />}
    </article>
  );
}

function ProposalDiff({ proposalId }: { proposalId: string }) {
  const [diffs, setDiffs] = useState<Array<{
    path: string;
    hunks: string[];
  }> | null>(null);
  if (diffs === null) {
    fetch(`/api/conformance/proposals/${proposalId}`)
      .then((response) => response.json())
      .then((body) => setDiffs(body.diffs ?? []))
      .catch(() => setDiffs([]));
    return <p className={p.muted}>Loading diff…</p>;
  }
  return (
    <div className={p.diffs}>
      {diffs.map((diff) => (
        <div key={diff.path}>
          <code>{diff.path}</code>
          {diff.hunks.map((hunk, index) => (
            <pre className={p.hunk} key={index}>
              {hunk.split("\n").map((line, lineIndex) => (
                <span
                  key={lineIndex}
                  className={
                    line[0] === "+" ? p.added : line[0] === "-" ? p.removed : ""
                  }
                >
                  {line}
                  {"\n"}
                </span>
              ))}
            </pre>
          ))}
        </div>
      ))}
    </div>
  );
}

export function AcceptanceCard({
  view,
  compact = false,
}: {
  view: OperatorView;
  compact?: boolean;
}) {
  const act = usePrototypeAction();
  const conformance = view.conformance;
  if (!conformance) return null;
  const record = conformance.proposedAcceptance ?? conformance.acceptance;
  if (!record) return null;
  const accepted = record.status === "accepted";
  return (
    <article
      className={`${p.card} ${compact ? p.cardCompact : ""}`}
      aria-label="Application behavior checks"
    >
      <header>
        <Circle aria-hidden="true" weight="fill" />
        <span>
          <strong>Behavior checks v{record.version}</strong>
          <small>
            {record.steps.length} step{record.steps.length === 1 ? "" : "s"} ·
            proposed from cited routes ·{" "}
            <LocalTime value={record.createdAt} variant="compact" />
          </small>
        </span>
        <em className={accepted ? p.badge_approved : p.badge_proposed}>
          {accepted
            ? `Accepted ${record.acceptedBy === "engineer" ? "by you" : "by policy"}`
            : "Waiting for your acceptance"}
        </em>
      </header>
      <p>{record.rationale}</p>
      <ul className={p.steps}>
        {record.steps.map((step) => (
          <li key={step.name}>
            <code>
              {step.method} {step.path}
            </code>{" "}
            → {step.expectStatus}
            {step.expectBodyIncludes
              ? ` containing ${step.expectBodyIncludes.map((item) => JSON.stringify(item)).join(", ")}`
              : ""}{" "}
            <small>{step.name}</small>
          </li>
        ))}
      </ul>
      {!accepted && (
        <div className={p.cardActions}>
          <span className={p.muted}>
            Accepting the test plan is separate from approving the code.
          </span>
          <button
            className={`sg-secondary-button ${p.smallButton}`}
            onClick={() => act(`Accept behavior checks v${record.version}`)}
            type="button"
          >
            <Check aria-hidden="true" weight="bold" /> Accept behavior checks v
            {record.version}
          </button>
        </div>
      )}
    </article>
  );
}

export function RunRows({
  runs,
  definitions,
}: {
  runs: ConformanceRunRecord[];
  definitions: { key: string; proves: string; limits: string }[];
}) {
  if (!runs.length) return <p className={p.muted}>No runs yet.</p>;
  return (
    <ul className={p.runs}>
      {runs.map((run) => (
        <li key={run.id} className={p[`run_${run.status}`]} data-run={run.kind}>
          <div>
            <em>{run.status}</em>
            <strong>
              {run.kind === "candidate"
                ? "Conformance run over the candidate"
                : run.kind === "preview"
                  ? "Preview run (worker evidence)"
                  : "Command run (worker evidence)"}
            </strong>
            <small>
              {run.kind === "candidate" ? "commit" : "tree"}{" "}
              {short(
                run.kind === "candidate"
                  ? run.source.commitSha
                  : run.source.treeDigest,
              )}{" "}
              · contract v{run.contractVersion} · check set v
              {run.definitionVersion}
              {run.acceptanceChecksVersion
                ? ` · behavior v${run.acceptanceChecksVersion}`
                : " · no behavior checks"}{" "}
              ·{" "}
              <LocalTime
                value={run.finishedAt ?? run.startedAt ?? run.createdAt}
                variant="compact"
              />
            </small>
          </div>
          <p>{run.summary}</p>
          {run.results.length > 0 && (
            <details>
              <summary>
                {run.results.filter((item) => item.outcome === "passed").length}{" "}
                passed ·{" "}
                {run.results.filter((item) => item.outcome === "failed").length}{" "}
                failed ·{" "}
                {
                  run.results.filter(
                    (item) => item.outcome === "not-applicable",
                  ).length
                }{" "}
                not applicable ·{" "}
                {
                  run.results.filter((item) => item.outcome === "not-run")
                    .length
                }{" "}
                not run
              </summary>
              <ul className={p.results}>
                {run.results.map((result) => {
                  const definition = definitions.find(
                    (item) => item.key === result.key,
                  );
                  return (
                    <li
                      key={result.key}
                      className={p[`outcome_${result.outcome}`]}
                    >
                      <em>{result.outcome}</em> <strong>{result.label}</strong>{" "}
                      <span>{result.summary}</span>
                      {definition && (
                        <small>
                          Proves: {definition.proves} Limits:{" "}
                          {definition.limits}
                        </small>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          <a
            href={`/api/conformance/runs/${run.id}`}
            rel="noreferrer"
            target="_blank"
          >
            Raw run <ArrowSquareOut aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Docker: compact when healthy, recovery-first when not. */
export function EnvironmentLine({ view }: { view: OperatorView }) {
  const act = usePrototypeAction();
  const phaseThree = view.workspace?.phaseKey === "make-launch-ready";
  const saved = view.conformance?.environment ?? null;
  // Like the production Record: check the engine once when this opens rather
  // than trusting another process's stale answer.
  const [checked, setChecked] = useState<ExecutionEnvironmentStatus | null>(
    null,
  );
  useEffect(() => {
    if (!phaseThree || saved) return;
    let active = true;
    api
      .executionSetup("check")
      .then((status) => {
        if (active) setChecked(status.environment);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [phaseThree, saved]);
  const environment = saved ?? checked;
  if (!phaseThree) return null;
  if (!environment)
    return (
      <p className={p.environment}>
        <span className={p.dotUnknown} aria-hidden="true" /> Docker on this
        machine: not checked yet.{" "}
        <button
          className="sg-text-button"
          onClick={() => act("Check Docker")}
          type="button"
        >
          Check now
        </button>
      </p>
    );
  if (environment.ready)
    return (
      <p className={p.environment}>
        <span className={p.dotGood} aria-hidden="true" /> Docker ready on{" "}
        {environment.host.hostname} · checked{" "}
        <LocalTime value={environment.checkedAt} variant="compact" />
        {environment.verified
          ? " · runner images prepared"
          : " · images pulled on first run"}{" "}
        ·{" "}
        <button
          className="sg-text-button"
          onClick={() => act("Refresh Docker status")}
          type="button"
        >
          Refresh
        </button>
      </p>
    );
  return (
    <div className={`${p.environment} ${p.environmentBad}`}>
      <strong>
        <Warning aria-hidden="true" weight="bold" />{" "}
        {environment.recovery.label}
      </strong>
      <p>{environment.summary}</p>
      <ol>
        {environment.recovery.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className={p.cardActions}>
        <button
          className="sg-secondary-button"
          onClick={() => act("Check Docker again")}
          type="button"
        >
          Check again
        </button>
        {environment.recovery.href && (
          <a href={environment.recovery.href} rel="noreferrer" target="_blank">
            Docker instructions <ArrowSquareOut aria-hidden="true" />
          </a>
        )}
        <Link className="sg-text-button" href="/setup/execution">
          Execution settings
        </Link>
      </div>
    </div>
  );
}

export function PublishingLine({ view }: { view: OperatorView }) {
  const act = usePrototypeAction();
  const conformance = view.conformance;
  if (!conformance || !view.application) return null;
  const grant = conformance.grant;
  return (
    <p className={p.environment}>
      <span className={grant ? p.dotGood : p.dotUnknown} aria-hidden="true" />
      {grant ? (
        <>
          Publishing to {view.application.repositoryOwner}/
          {view.application.repositoryName} allowed with the current{" "}
          {grant.mechanism === "app" ? "GitHub App" : "GitHub CLI"} connection
          since <LocalTime value={grant.grantedAt} variant="compact" /> ·{" "}
          <button
            className="sg-text-button"
            onClick={() => act("Stop allowing publishing")}
            type="button"
          >
            Stop allowing
          </button>
        </>
      ) : (
        <>
          Publishing to {view.application.repositoryOwner}/
          {view.application.repositoryName}: not allowed yet. The connection
          stays read-only until you allow it.{" "}
          <button
            className="sg-text-button"
            onClick={() => act("Allow publishing")}
            type="button"
          >
            Allow publishing
          </button>
        </>
      )}
    </p>
  );
}
