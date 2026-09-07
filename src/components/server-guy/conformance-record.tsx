"use client";

import {
  ArrowSquareOut,
  Check,
  Copy,
  GitPullRequest,
  SpinnerGap,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type { ExecutionSetupStatus } from "@/server/execution-setup";
import type {
  ApplicationRecord,
  ApprovalMode,
  ConformanceCheckResult,
  ConformanceProposalRecord,
  ConformanceRunRecord,
  ConformanceView,
} from "@/server/types";

import { api } from "./api";
import { ExecutionEnvironmentCard } from "./execution-setup-screen";
import { ExternalLink } from "./external-link";
import { LocalTime } from "./local-time";

/** Every Phase 3 operation the shell can run; the current-step bar and the
 * Record both dispatch these, never a second store. */
export type ConformanceAction =
  | { type: "continue" }
  | { type: "return"; reference: string }
  | { type: "select-current" }
  | { type: "refresh" }
  | { type: "verify" }
  | { type: "approve"; proposalId: string }
  | { type: "publish"; proposalId: string }
  | { type: "withdraw"; proposalId: string }
  | { type: "accept-checks"; acceptanceId: string }
  | { type: "cancel-run"; runId: string }
  | { type: "grant" }
  | { type: "revoke" };

const OUTCOME_LABELS: Record<ConformanceCheckResult["outcome"], string> = {
  passed: "Passed",
  failed: "Failed",
  "not-run": "Not run",
  "not-applicable": "Not applicable",
};

export const PROPOSAL_STATUS_LABELS: Record<
  ConformanceProposalRecord["status"],
  string
> = {
  proposed: "Waiting for your approval",
  approved: "Approved · not published yet",
  published: "Published",
  withdrawn: "Withdrawn",
  superseded: "Replaced",
};

function short(sha: string | null | undefined) {
  return sha?.slice(0, 8) ?? "unknown";
}

type Definitions = NonNullable<
  ConformanceView["brief"]
>["acceptance"]["checks"];

function CheckResults({
  results,
  definitions,
}: {
  results: ConformanceCheckResult[];
  definitions: Definitions;
}) {
  return (
    <ul className="sg-check-results">
      {results.map((result) => {
        const definition = definitions.find((item) => item.key === result.key);
        return (
          <li key={result.key} data-check={result.key}>
            <div className="sg-check-result-row">
              <span className={`sg-outcome ${result.outcome}`}>
                {OUTCOME_LABELS[result.outcome]}
              </span>
              <strong>{result.label}</strong>
              <span className="sg-check-result-summary">{result.summary}</span>
            </div>
            {result.steps && (
              <ul className="sg-check-steps">
                {result.steps.map((step) => (
                  <li
                    key={step.name}
                    className={step.passed ? "passed" : "failed"}
                  >
                    {step.passed ? (
                      <Check aria-hidden="true" weight="bold" />
                    ) : (
                      <X aria-hidden="true" weight="bold" />
                    )}
                    {step.name} · {step.request} →{" "}
                    {step.status ?? "no response"} · {step.detail}
                  </li>
                ))}
              </ul>
            )}
            {(definition || result.evidence || result.output) && (
              <details className="sg-check-result-details">
                <summary>Details</summary>
                {definition && (
                  <p>
                    <b>Proves:</b> {definition.proves} <b>Limits:</b>{" "}
                    {definition.limits}
                  </p>
                )}
                {result.evidence && (
                  <p>
                    <b>Evidence:</b> {result.evidence}
                  </p>
                )}
                {result.output && (
                  <pre className="sg-check-output">
                    {result.outputTruncated ? "… output truncated\n" : ""}
                    {result.output}
                  </pre>
                )}
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RunCard({
  run,
  title,
  definitions,
}: {
  run: ConformanceRunRecord;
  title: string;
  definitions: Definitions;
}) {
  const active = run.status === "queued" || run.status === "running";
  return (
    <article className={`sg-run-card ${run.status}`} data-run={run.kind}>
      <div className="sg-run-card-heading">
        <span
          className={`sg-outcome ${run.status === "passed" ? "passed" : active ? "running" : "failed"}`}
        >
          {active && <SpinnerGap className="spin" aria-hidden="true" />}
          {run.status}
        </span>
        <strong>{title}</strong>
        <small>
          {run.kind === "candidate" ? "commit" : "tree"}{" "}
          {short(
            run.kind === "candidate"
              ? run.source.commitSha
              : run.source.treeDigest,
          )}{" "}
          · check set v{run.definitionVersion} · contract v{run.contractVersion}{" "}
          ·{" "}
          {run.acceptanceChecksVersion
            ? `behavior v${run.acceptanceChecksVersion}`
            : "no behavior checks"}
          {run.imageDigest ? ` · image ${run.imageDigest.slice(-12)}` : ""} ·{" "}
          <LocalTime
            value={run.finishedAt ?? run.startedAt ?? run.createdAt}
            variant="compact"
          />
        </small>
      </div>
      <p className="sg-run-card-summary" role={active ? "status" : undefined}>
        {run.summary}
      </p>
      {run.error && <p className="sg-error">{run.error}</p>}
      {run.results.length > 0 && (
        <CheckResults results={run.results} definitions={definitions} />
      )}
      <div className="sg-run-card-actions">
        <a
          href={`/api/conformance/runs/${run.id}`}
          rel="noreferrer"
          target="_blank"
        >
          Raw run <ArrowSquareOut aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

function ProposalDiff({ proposalId }: { proposalId: string }) {
  const [diffs, setDiffs] = useState<Array<{
    path: string;
    deleted: boolean;
    created: boolean;
    added: number;
    removed: number;
    hunks: string[];
  }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/conformance/proposals/${proposalId}`)
      .then((response) => response.json())
      .then((body) => {
        if (active) setDiffs(body.diffs ?? []);
      })
      .catch(() => {
        if (active) setError("Could not load the diff.");
      });
    return () => {
      active = false;
    };
  }, [proposalId]);
  if (error) return <p className="sg-error">{error}</p>;
  if (!diffs) return <p>Loading diff…</p>;
  return (
    <div className="sg-diffs">
      {diffs.map((diff) => (
        <details className="sg-diff" key={diff.path} open={diffs.length <= 3}>
          <summary>
            <code>{diff.path}</code>{" "}
            <small>
              {diff.deleted
                ? "deleted"
                : diff.created
                  ? "new file"
                  : `+${diff.added} −${diff.removed}`}
            </small>
          </summary>
          {diff.hunks.map((hunk, index) => (
            <pre className="sg-diff-hunk" key={index}>
              {hunk.split("\n").map((line, lineIndex) => (
                <span
                  key={lineIndex}
                  className={
                    line[0] === "+" ? "added" : line[0] === "-" ? "removed" : ""
                  }
                >
                  {line}
                  {"\n"}
                </span>
              ))}
            </pre>
          ))}
        </details>
      ))}
    </div>
  );
}

function ProposalBlock({
  application,
  conformance,
  proposal,
  current,
}: {
  application: ApplicationRecord;
  conformance: ConformanceView;
  proposal: ConformanceProposalRecord;
  current: boolean;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const previewFor = conformance.runs.find(
    (run) =>
      run.kind === "preview" &&
      run.source.overlayDigest === proposal.filesDigest,
  );
  const pullUrl =
    proposal.publication?.pullRequestUrl ??
    proposal.external?.pullRequestUrl ??
    null;
  const pullState =
    proposal.publication?.state ?? proposal.external?.state ?? null;
  const replaced = !current || proposal.status === "superseded";
  return (
    <div
      className={`sg-conformance-proposal${replaced ? " replaced" : ""}`}
      data-proposal-status={proposal.status}
      data-proposal-origin={proposal.origin}
    >
      <div className="sg-contract-heading">
        <strong>
          {proposal.origin === "no-change"
            ? "No change required"
            : proposal.origin === "external"
              ? "Returned change"
              : "Proposed change"}{" "}
          · {replaced ? "Replaced" : PROPOSAL_STATUS_LABELS[proposal.status]}
        </strong>
        <span>
          base {short(proposal.baseSha)} · contract v{proposal.contractVersion}{" "}
          · <LocalTime value={proposal.createdAt} variant="compact" /> ·{" "}
          <a
            href={`/api/conformance/proposals/${proposal.id}`}
            rel="noreferrer"
            target="_blank"
          >
            Record <ArrowSquareOut aria-hidden="true" />
          </a>
        </span>
      </div>
      {replaced && (
        <p className="sg-conformance-replaced">
          <Warning aria-hidden="true" weight="bold" /> This proposal was
          replaced. Its approval no longer applies; the current proposal is
          reviewed instead.
        </p>
      )}
      <p className="sg-contract-summary">{proposal.summary}</p>
      {proposal.changes.length > 0 && (
        <>
          <ul className="sg-changed-files">
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
          <button
            className="sg-text-button"
            onClick={() => setShowDiff((value) => !value)}
            type="button"
          >
            {showDiff
              ? "Hide diff"
              : `Show complete diff (${proposal.changes.length} file${proposal.changes.length === 1 ? "" : "s"})`}
          </button>
          {showDiff && <ProposalDiff proposalId={proposal.id} />}
        </>
      )}
      {proposal.mapping.length > 0 && (
        <div className="sg-conformance-mapping">
          <span className="sg-eyebrow">Required change → files</span>
          <ul>
            {proposal.mapping.map((entry) => (
              <li key={entry.field}>
                <b>{entry.field}</b> → {entry.paths.join(", ")}{" "}
                <i>{entry.explanation}</i>
              </li>
            ))}
          </ul>
          {proposal.origin === "external" && (
            <small>
              Mapping for a returned change is established by the conformance
              run, not by the worker&apos;s report.
            </small>
          )}
        </div>
      )}
      {proposal.origin === "server-guy" && current && (
        <p
          className={`sg-conformance-preview ${previewFor ? previewFor.status : "untested"}`}
          data-preview={previewFor ? previewFor.status : "untested"}
        >
          {previewFor ? (
            <>
              Preview {previewFor.status} over this exact change (tree{" "}
              {short(previewFor.source.treeDigest)}) ·{" "}
              <LocalTime
                value={previewFor.finishedAt ?? previewFor.createdAt}
                variant="compact"
              />{" "}
              · worker evidence, not the gate
            </>
          ) : (
            <>
              Untested since last edit: no preview ran over this exact change.
            </>
          )}
        </p>
      )}
      {proposal.verification && !proposal.verification.scope.ok && (
        <div className="sg-contract-gaps blocked">
          <strong>Out of scope</strong>
          <ul>
            {proposal.verification.scope.violations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {proposal.verification &&
        proposal.candidate &&
        !proposal.verification.changesComplete && (
          <div className="sg-contract-gaps blocked">
            <strong>The candidate differs from the reviewed change</strong>
            <ul>
              {proposal.verification.differences.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      {proposal.publicationError && (
        <p className="sg-error" role="alert">
          Publication did not complete: {proposal.publicationError}
        </p>
      )}
      {pullUrl && (
        <p className="sg-conformance-pull">
          <GitPullRequest aria-hidden="true" />{" "}
          <ExternalLink href={pullUrl}>
            {proposal.publication
              ? `${proposal.publication.branch} · pull request #${proposal.publication.pullRequestNumber}`
              : `pull request #${proposal.external?.pullRequestNumber}`}
          </ExternalLink>{" "}
          {pullState ? `· ${pullState}` : ""}
          {proposal.publication?.adopted
            ? " · adopted from an earlier attempt"
            : ""}
          {pullState === "open"
            ? " · merge it on GitHub, then refresh; an unmerged head gets preview results only"
            : ""}
        </p>
      )}
      {proposal.external && !pullUrl && (
        <p className="sg-conformance-pull">
          Returned {proposal.external.reference} →{" "}
          {short(proposal.external.headSha)}
          {proposal.external.branch ? ` (${proposal.external.branch})` : ""}
        </p>
      )}
      {proposal.candidate && (
        <p
          className="sg-conformance-candidate"
          data-candidate={proposal.candidate.sha}
        >
          <Check aria-hidden="true" weight="bold" /> Candidate revision{" "}
          <ExternalLink
            href={`${application.repositoryUrl}/commit/${proposal.candidate.sha}`}
          >
            {short(proposal.candidate.sha)}
          </ExternalLink>{" "}
          on {proposal.candidate.defaultBranch} ·{" "}
          {proposal.candidate.source === "contract-commit"
            ? "the contract commit"
            : proposal.candidate.merge
              ? `pull request #${proposal.candidate.merge.pullRequestNumber} merged (${proposal.candidate.merge.method})`
              : "returned change on the default branch"}{" "}
          ·{" "}
          <LocalTime value={proposal.candidate.resolvedAt} variant="compact" />
        </p>
      )}
    </div>
  );
}

/**
 * The change and its behavior checks as they stand: the brief and its
 * required changes, the behavior checks and their acceptance, the current
 * proposal with its diff, publication and candidate, earlier proposals marked
 * as replaced, and the other ways to do the work. Decisions are taken in the
 * current-step bar; everything here renders from records.
 */
export function ConformanceChange({
  application,
  conformance,
  approvalMode,
  busy,
  readOnly,
  onAction,
}: {
  application: ApplicationRecord;
  conformance: ConformanceView;
  approvalMode: ApprovalMode;
  busy: string | null;
  readOnly: boolean;
  onAction: (action: ConformanceAction) => void;
}) {
  const { brief, proposal, acceptance, proposedAcceptance } = conformance;
  const [exported, setExported] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reference, setReference] = useState("");
  const disabled = busy !== null || readOnly;

  async function exportBrief() {
    try {
      setExportError(null);
      const { text } = await api.conformance(application.id).exportBrief();
      setExported(text);
    } catch (caught) {
      setExportError(
        caught instanceof Error
          ? caught.message
          : "Could not export the brief.",
      );
    }
  }

  if (!brief)
    return (
      <section className="sg-record-section-inner sg-conformance">
        <p className="sg-contract-empty">
          {conformance.contractBlocked ??
            "Complete Inspect app before conformance work can start."}
        </p>
      </section>
    );

  const earlier = conformance.proposals.filter(
    (item) => item.id !== proposal?.id,
  );

  return (
    <section
      className="sg-record-section-inner sg-conformance"
      aria-label="Change and behavior checks"
    >
      {conformance.contractBlocked && (
        <div className="sg-contract-gaps blocked">
          <strong>Contract revision needs a decision</strong>
          <p>{conformance.contractBlocked}</p>
        </div>
      )}

      <div className="sg-conformance-brief">
        <div className="sg-contract-heading">
          <strong>Conformance brief · base {short(brief.baseSha)}</strong>
          <span>
            <ExternalLink
              href={`${application.repositoryUrl}/tree/${brief.baseSha}`}
            >
              {brief.repository.owner}/{brief.repository.name}
            </ExternalLink>{" "}
            · Application Contract v{brief.contract.version} ·{" "}
            {brief.contract.profileLabel} v{brief.contract.profileVersion}
          </span>
        </div>
        {brief.requiredChanges.length ? (
          <div className="sg-contract-gaps conformance">
            <strong>Required changes ({brief.requiredChanges.length})</strong>
            <ul>
              {brief.requiredChanges.map((item) => (
                <li key={item.field} data-required={item.field}>
                  <b>{item.label}</b> · required: {item.required} · now:{" "}
                  {item.observed} · change: {item.change}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="sg-conformance-note">
            The contract records no required changes. The current revision still
            needs current conformance evidence: no change is not no
            verification.
          </p>
        )}
        {brief.blockers.length > 0 && (
          <div className="sg-contract-gaps blocked">
            <strong>
              Blocked until decided (never converted into changes)
            </strong>
            <ul>
              {brief.blockers.map((item) => (
                <li key={item.field}>
                  <b>{item.label}</b> · {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <details className="sg-conformance-details">
          <summary>
            Acceptance bar · check set v{brief.acceptance.definitionVersion} ·{" "}
            {brief.acceptance.checks.length} profile checks · scope and
            exclusions
          </summary>
          <ul className="sg-conformance-checks">
            {brief.acceptance.checks.map((check) => (
              <li key={check.key}>
                <b>{check.label}.</b> {check.proves}{" "}
                <i>Limits: {check.limits}</i>
              </li>
            ))}
          </ul>
          <p>
            <b>Runner configuration:</b> port{" "}
            {brief.acceptance.configuration.port}, health{" "}
            {brief.acceptance.configuration.healthPath}, database{" "}
            {brief.acceptance.configuration.database === "postgresql"
              ? "disposable PostgreSQL with synthetic credentials"
              : "none"}
            , migrations{" "}
            {brief.acceptance.configuration.migrationTool ?? "none"}, variables{" "}
            {Object.keys(brief.acceptance.configuration.environment).join(
              ", ",
            ) || "none"}
            .
          </p>
          <p>
            <b>Allowed scope:</b> {brief.scope.allowed} <b>Never:</b>{" "}
            {brief.scope.forbidden.join("; ")}.
          </p>
          <ul>
            {brief.exclusions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      </div>

      <div
        className="sg-conformance-acceptance"
        data-acceptance-status={
          acceptance ? "accepted" : proposedAcceptance ? "proposed" : "missing"
        }
      >
        <span className="sg-eyebrow">Application behavior checks</span>
        {acceptance ? (
          <p>
            <span className="sg-outcome passed">
              Accepted v{acceptance.version}
            </span>{" "}
            {acceptance.acceptedBy === "approval-mode"
              ? "by the Full autonomy policy"
              : "by you"}{" "}
            · {acceptance.steps.length} step
            {acceptance.steps.length === 1 ? "" : "s"} ·{" "}
            <LocalTime
              value={acceptance.acceptedAt ?? acceptance.createdAt}
              variant="compact"
            />
          </p>
        ) : (
          <p className="sg-conformance-warning">
            <Warning aria-hidden="true" weight="bold" /> No accepted
            application-behavior check yet. A health response alone cannot
            satisfy Check 3.
          </p>
        )}
        {(acceptance ?? proposedAcceptance) && (
          <ul className="sg-acceptance-steps">
            {(proposedAcceptance ?? acceptance)!.steps.map((step) => (
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
        )}
        {proposedAcceptance && (
          <p className="sg-conformance-note">
            Proposed v{proposedAcceptance.version}:{" "}
            {proposedAcceptance.rationale} Accepting the test plan is separate
            from approving the code; accept it above the chat.
          </p>
        )}
      </div>

      {proposal && (
        <ProposalBlock
          application={application}
          conformance={conformance}
          proposal={proposal}
          current
        />
      )}
      {earlier.length > 0 && (
        <details className="sg-conformance-earlier">
          <summary>
            Earlier proposals ({earlier.length}) · replaced or withdrawn
          </summary>
          {earlier.map((item) => (
            <ProposalBlock
              application={application}
              conformance={conformance}
              current={false}
              key={item.id}
              proposal={item}
            />
          ))}
        </details>
      )}
      {proposal && (
        <p className="sg-conformance-note">
          Server Guy publishes a reviewable branch and pull request under the{" "}
          <b>
            {approvalMode === "always-ask"
              ? "Always ask"
              : approvalMode === "full-autonomy"
                ? "Full autonomy"
                : "Let Server Guy decide"}
          </b>{" "}
          policy; merging is yours on GitHub in every policy. After the merge,
          Refresh records the exact merged revision as the candidate.
        </p>
      )}

      {(!proposal || proposal.origin === "no-change") && !readOnly && (
        <div className="sg-conformance-choice">
          <span className="sg-eyebrow">Other ways to do the work</span>
          <p>
            {proposal?.origin === "no-change"
              ? "No source change is required. Server Guy proposes the behavior checks from the routes it reads and previews the current revision; or return a change made elsewhere."
              : "Continue with Server Guy above the chat, or export the same brief for Codex, Claude, another harness or manual work, then return the change here."}
          </p>
          <div className="sg-conformance-actions">
            <button
              className="sg-secondary-button"
              disabled={disabled}
              onClick={() => void exportBrief()}
              type="button"
            >
              Export brief for external work
            </button>
          </div>
          {exportError && (
            <p className="sg-error" role="alert">
              {exportError}
            </p>
          )}
          {exported && (
            <div className="sg-conformance-export">
              <textarea
                aria-label="Exported conformance brief"
                readOnly
                rows={8}
                value={exported}
              />
              <button
                className="sg-text-button"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(exported)
                    .then(() => setCopied(true))
                    .catch(() => undefined);
                }}
                type="button"
              >
                <Copy aria-hidden="true" /> {copied ? "Copied" : "Copy brief"}
              </button>
            </div>
          )}
          <form
            className="sg-conformance-return"
            onSubmit={(event) => {
              event.preventDefault();
              if (reference.trim())
                onAction({ type: "return", reference: reference.trim() });
            }}
          >
            <label htmlFor="conformance-return">
              Return a change made elsewhere
            </label>
            <div>
              <input
                id="conformance-return"
                disabled={disabled}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Pull request URL or number, branch, or commit SHA"
                value={reference}
              />
              <button
                className="sg-secondary-button"
                disabled={disabled || !reference.trim()}
                type="submit"
              >
                {busy === "return" ? (
                  <SpinnerGap className="spin" aria-hidden="true" />
                ) : (
                  <GitPullRequest aria-hidden="true" />
                )}
                Return change
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

/** Every run's per-check evidence: the one in progress, the latest candidate
 * run, and the most recent previews. Cancelling is a current-step action. */
export function ConformanceRuns({
  conformance,
}: {
  conformance: ConformanceView;
}) {
  const definitions = conformance.brief?.acceptance.checks ?? [];
  const running =
    conformance.runs.find(
      (run) => run.status === "running" || run.status === "queued",
    ) ?? null;
  const latest = conformance.latestCandidateRun;
  if (!conformance.runs.length)
    return (
      <p className="sg-conformance-note">
        No run yet. Previews are worker evidence; only a conformance run over
        the exact candidate can pass the gate.
      </p>
    );
  return (
    <section
      className="sg-record-section-inner sg-conformance"
      aria-label="Runs"
    >
      {running && (
        <RunCard
          run={running}
          title={
            running.kind === "candidate"
              ? "Conformance run in progress"
              : `${running.kind} in progress`
          }
          definitions={definitions}
        />
      )}
      {latest && latest.id !== running?.id && (
        <RunCard
          run={latest}
          title="Conformance run over the candidate"
          definitions={definitions}
        />
      )}
      {conformance.runs
        .filter((run) => run.kind !== "candidate" && run.id !== running?.id)
        .slice(0, 3)
        .map((run) => (
          <RunCard
            key={run.id}
            run={run}
            title={
              run.kind === "preview"
                ? "Preview run (worker evidence)"
                : "Command run (worker evidence)"
            }
            definitions={definitions}
          />
        ))}
      {conformance.runs.length > 4 && (
        <p className="sg-conformance-note">
          Earlier runs stay in the raw records; every attempt is retained as
          history.
        </p>
      )}
    </section>
  );
}

/**
 * The execution environment on the machine running Server Guy, compact while
 * healthy and recovery-first when not, and the publishing grant for this
 * repository. The prerequisite is checked once when this opens, never trusting
 * another process's stale answer.
 */
export function ConformanceEnvironment({
  application,
  conformance,
  busy,
  readOnly,
  offerGrant,
  onAction,
}: {
  application: ApplicationRecord;
  conformance: ConformanceView;
  busy: string | null;
  readOnly: boolean;
  /** The current-step bar already offers "Allow publishing". */
  offerGrant: boolean;
  onAction: (action: ConformanceAction) => void;
}) {
  const [environment, setEnvironment] = useState<ExecutionSetupStatus | null>(
    conformance.environment
      ? {
          environment: conformance.environment,
          preparation: {
            running: false,
            message: null,
            error: null,
            finishedAt: null,
          },
          images: { runner: "", database: "" },
          docs: { install: "", getDocker: "" },
        }
      : null,
  );
  const [environmentBusy, setEnvironmentBusy] = useState<
    "check" | "prepare" | null
  >(null);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const disabled = busy !== null || readOnly;
  const grant = conformance.grant;

  async function checkEnvironment(action: "check" | "prepare") {
    setEnvironmentBusy(action);
    setEnvironmentError(null);
    try {
      setEnvironment(await api.executionSetup(action));
    } catch (caught) {
      setEnvironmentError(
        caught instanceof Error
          ? caught.message
          : "Could not check the execution environment.",
      );
    } finally {
      setEnvironmentBusy(null);
    }
  }
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setEnvironmentBusy("check");
      api
        .executionSetup("check")
        .then((status) => {
          if (active) setEnvironment(status);
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setEnvironmentBusy(null);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // Only when this opens.
  }, []);
  useEffect(() => {
    if (!environment?.preparation.running) return;
    const timer = window.setTimeout(() => {
      api
        .executionSetup()
        .then(setEnvironment)
        .catch(() => undefined);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [environment]);

  return (
    <section
      className="sg-record-section-inner sg-conformance"
      aria-label="Environment"
    >
      <div className="sg-conformance-environment">
        {environment ? (
          <ExecutionEnvironmentCard
            status={environment}
            busy={environmentBusy}
            compact
            onCheck={() => void checkEnvironment("check")}
            onPrepare={() => void checkEnvironment("prepare")}
          />
        ) : (
          <p className="sg-conformance-note">
            Execution environment not checked yet.{" "}
            <button
              className="sg-text-button"
              disabled={environmentBusy !== null}
              onClick={() => void checkEnvironment("check")}
              type="button"
            >
              Check Docker Engine on this machine
            </button>
          </p>
        )}
        {environmentError && (
          <p className="sg-error" role="alert">
            {environmentError}
          </p>
        )}
      </div>

      <div
        className="sg-conformance-grant"
        data-grant={grant ? "granted" : "none"}
      >
        <span className="sg-eyebrow">
          Publishing to {application.repositoryOwner}/
          {application.repositoryName}
        </span>
        {grant ? (
          <p>
            <Check aria-hidden="true" weight="bold" /> Allowed with the current{" "}
            {grant.mechanism === "app" ? "GitHub App" : "GitHub CLI"} connection
            since <LocalTime value={grant.grantedAt} variant="compact" />; a
            replaced connection ends it.{" "}
            {!readOnly && (
              <button
                className="sg-text-button"
                disabled={disabled}
                onClick={() => onAction({ type: "revoke" })}
                type="button"
              >
                Stop allowing
              </button>
            )}
          </p>
        ) : (
          <p>
            Not allowed yet: the GitHub connection stays read-only until you
            allow publishing. Server Guy then verifies push and pull-request
            permission for this repository and records the grant. A broadly
            scoped token is not a grant.{" "}
            {!offerGrant && !readOnly && (
              <button
                className="sg-secondary-button"
                disabled={disabled}
                onClick={() => onAction({ type: "grant" })}
                type="button"
              >
                {busy === "grant" ? (
                  <SpinnerGap className="spin" aria-hidden="true" />
                ) : null}
                Allow publishing
              </button>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
