"use client";

import { ArrowSquareOut, FileMagnifyingGlass } from "@phosphor-icons/react";

import { APPLICATION_PROFILE } from "@/server/application-profile";
import type {
  ApplicationContractView,
  ApplicationRecord,
  ContractCitation,
  ContractField,
  ContractProvenance,
  RepositoryInspectionSummary,
} from "@/server/types";

import { ContractVersions } from "./contract-versions";
import { ExternalLink } from "./external-link";
import { SOURCE_LABELS } from "./format";
import { LocalTime } from "./local-time";

const PROVENANCE_LABELS = SOURCE_LABELS;

function citationOf(provenance: ContractProvenance): ContractCitation | null {
  if ("citation" in provenance && provenance.citation)
    return provenance.citation;
  return null;
}

function sourceHref(
  application: ApplicationRecord,
  commitSha: string,
  citation: ContractCitation,
) {
  if ("absent" in citation)
    return `${application.repositoryUrl}/tree/${commitSha}`;
  return `${application.repositoryUrl}/blob/${commitSha}/${citation.path}${
    citation.line ? `#L${citation.line}` : ""
  }`;
}

function SourceLink({
  application,
  commitSha,
  citation,
}: {
  application: ApplicationRecord;
  commitSha: string;
  citation: ContractCitation;
}) {
  const label =
    "absent" in citation
      ? `${citation.absent} absent from tree`
      : `${citation.path}${citation.line ? `:${citation.line}` : ""}`;
  return (
    <ExternalLink
      className="sg-contract-source"
      href={sourceHref(application, commitSha, citation)}
      title={"absent" in citation ? "Open the inspected tree" : "Open source"}
    >
      {label}
    </ExternalLink>
  );
}

function ProvenanceDetail({
  field,
  application,
  commitSha,
}: {
  field: ContractField;
  application: ApplicationRecord;
  commitSha: string;
}) {
  const { provenance } = field;
  if (provenance.kind === "profile-rule")
    return (
      <span className="sg-contract-note">
        Rule {provenance.ruleId} of {APPLICATION_PROFILE.label} v
        {APPLICATION_PROFILE.version}
      </span>
    );
  if (provenance.kind === "user-confirmed")
    return (
      <span className="sg-contract-note">
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
      </span>
    );
  if (provenance.kind === "unresolved")
    return (
      <span className="sg-contract-note">
        {provenance.blocker === "policy"
          ? `Open policy ${provenance.dependency}: ${provenance.reason}`
          : `${provenance.blocker}: ${provenance.reason}${provenance.observed ? ` Observed: ${provenance.observed}` : ""}`}
        {provenance.blocker !== "policy" && provenance.citation && (
          <>
            {" "}
            <SourceLink
              application={application}
              commitSha={commitSha}
              citation={provenance.citation}
            />
          </>
        )}
      </span>
    );
  const citation = citationOf(provenance);
  return citation ? (
    <span className="sg-contract-note">
      {"snippet" in citation && (
        <code className="sg-contract-snippet">{citation.snippet.trim()}</code>
      )}
      <SourceLink
        application={application}
        commitSha={commitSha}
        citation={citation}
      />
    </span>
  ) : null;
}

/**
 * The Application Contract grouped by responsibility, with one provenance
 * badge per field, source links to the exact commit, conformance work for
 * Phase 3, blockers that need a decision and open policies for later gates.
 */
export function ContractRecord({
  application,
  contract,
  inspection,
}: {
  application: ApplicationRecord;
  contract: ApplicationContractView | null;
  inspection: RepositoryInspectionSummary | null;
}) {
  return (
    <section
      className="sg-record-section sg-contract"
      aria-label="Application Contract"
    >
      {inspection && (
        <p className="sg-contract-inspection">
          <FileMagnifyingGlass aria-hidden="true" />
          <span>
            {inspection.status === "passed" && inspection.commitSha ? (
              <>
                Inspected {inspection.defaultBranch} ·{" "}
                <ExternalLink
                  href={`${application.repositoryUrl}/tree/${inspection.commitSha}`}
                >
                  {inspection.commitSha.slice(0, 8)}
                </ExternalLink>{" "}
                · {inspection.filesRead} file
                {inspection.filesRead === 1 ? "" : "s"} read ·{" "}
                <LocalTime value={inspection.observedAt} variant="compact" />
                {!inspection.current && " · previous GitHub login"}
              </>
            ) : (
              inspection.summary
            )}
          </span>
        </p>
      )}
      {!contract ? (
        <p className="sg-contract-empty">
          No Application Contract yet. Server Guy proposes it from the inspected
          repository; you can correct any field in chat.
        </p>
      ) : (
        <>
          <div className="sg-contract-heading">
            <strong>
              Application Contract v{contract.version} ·{" "}
              {contract.commitSha.slice(0, 8)}
            </strong>
            <span>
              {APPLICATION_PROFILE.label} v{contract.profileVersion} ·{" "}
              <LocalTime value={contract.createdAt} variant="compact" /> ·{" "}
              <a
                href={`/api/contracts/${contract.id}`}
                rel="noreferrer"
                target="_blank"
              >
                Record <ArrowSquareOut aria-hidden="true" />
              </a>
            </span>
          </div>
          <p className="sg-contract-summary">{contract.body.summary}</p>
          <ContractVersions
            applicationId={application.id}
            currentVersion={contract.version}
          />
          {contract.gaps.blockers.length > 0 && (
            <div className="sg-contract-gaps blocked">
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
            <div className="sg-contract-gaps conformance">
              <strong>Conformance work for Phase 3</strong>
              <ul>
                {contract.gaps.conformance.map((gap) => (
                  <li key={gap.field}>
                    <b>{gap.label}</b> · now: {gap.observed} · change:{" "}
                    {gap.change}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {contract.gaps.policies.length > 0 && (
            <div className="sg-contract-gaps policy">
              <strong>Open product policies for later gates</strong>
              <ul>
                {contract.gaps.policies.map((gap) => (
                  <li key={gap.field}>
                    <b>{gap.label}</b> · {gap.dependency} · required before
                    phase {gap.requiredBeforePhase}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {contract.provenanceIssues.length > 0 && (
            <div className="sg-contract-gaps blocked">
              <strong>Sources no longer current</strong>
              <ul>
                {contract.provenanceIssues.map((issue) => (
                  <li key={issue.field}>
                    <b>{issue.field}</b> · {issue.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(
            Object.entries(APPLICATION_PROFILE.groups) as Array<
              [keyof typeof APPLICATION_PROFILE.groups, string]
            >
          ).map(([group, label]) => {
            const fields = contract.body.fields.filter(
              (field) =>
                APPLICATION_PROFILE.fields.find(
                  (item) => item.key === field.key,
                )?.group === group,
            );
            if (!fields.length) return null;
            // A group opens on its own only when something in it needs
            // attention; otherwise its values preview on one line.
            const attention = fields.some(
              (field) =>
                field.provenance.kind === "unresolved" || field.conformance,
            );
            const preview = fields
              .slice(0, 3)
              .map((field) => field.value ?? "unresolved")
              .join(" · ");
            return (
              <details
                className="sg-contract-group"
                key={group}
                open={attention}
              >
                <summary>
                  <span className="sg-eyebrow">{label}</span>
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
                      <div
                        className="sg-contract-field"
                        data-field={field.key}
                        key={field.key}
                      >
                        <dt title={definition?.definition}>
                          {definition?.label ?? field.key}
                        </dt>
                        <dd>
                          <span className="sg-contract-value">
                            {field.value ?? (
                              <em>
                                {field.provenance.kind === "unresolved" &&
                                field.provenance.blocker === "policy"
                                  ? "Open policy"
                                  : "Unresolved"}
                              </em>
                            )}
                          </span>
                          <span
                            className={`sg-provenance ${field.provenance.kind}`}
                          >
                            {PROVENANCE_LABELS[field.provenance.kind]}
                          </span>
                          {field.conformance && (
                            <span className="sg-provenance conformance">
                              Phase 3 work
                            </span>
                          )}
                          <ProvenanceDetail
                            field={field}
                            application={application}
                            commitSha={contract.commitSha}
                          />
                          {field.conformance && (
                            <span className="sg-contract-note">
                              Now: {field.conformance.observed} · Change:{" "}
                              {field.conformance.change}
                              {field.conformance.citation && (
                                <>
                                  {" "}
                                  <SourceLink
                                    application={application}
                                    commitSha={contract.commitSha}
                                    citation={field.conformance.citation}
                                  />
                                </>
                              )}
                            </span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </details>
            );
          })}
        </>
      )}
    </section>
  );
}
