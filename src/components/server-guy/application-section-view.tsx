"use client";

import { ArrowSquareOut } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { ApplicationFacts, ViewAction } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import type { OperatorView } from "@/server/types";

import { ApplicationOverview } from "./application-overview";
import {
  applicationSections,
  type ApplicationSection,
} from "./application-sections";
import { ArchitectureCanvas } from "./architecture-canvas";
import { ArchitecturePrototype } from "./architecture-prototype";
import { DestinationActivity } from "./destination-activity";
import { BackupsView } from "./views/backups-view";
import { CacheView } from "./views/cache-view";
import { CdnView } from "./views/cdn-view";
import { DatabaseView } from "./views/database-view";
import { DeploymentView } from "./views/deployment-view";
import { DomainsView } from "./views/domains-view";
import { HistoryView } from "./views/history-view";
import { JobsView } from "./views/jobs-view";
import { LogsView } from "./views/logs-view";
import { MonitoringView } from "./views/monitoring-view";
import { ProcessesView } from "./views/processes-view";
import { SecurityView } from "./views/security-view";
import { StorageView } from "./views/storage-view";
import { VariablesView } from "./views/variables-view";
import type { ViewProps } from "./views/bits";
import { Loading } from "./views/visuals";

const descriptions: Record<ApplicationSection, string> = {
  history:
    "Every operation across your conversations and automatic work, in one record.",
  overview:
    "What is running, what needs you, what changed, and how fresh the evidence is.",
  architecture: "How your source, application, host and data fit together.",
  deployment:
    "What is serving, what could be released next, and how it was prepared.",
  processes:
    "The web and worker processes that make up your application on its instance.",
  database:
    "The database your application depends on, and where its data lives.",
  cache:
    "The cache or broker your application relies on, and the queue its workers consume.",
  jobs: "Scheduled commands and queued work, and the processes that run them.",
  storage: "Volumes and files that must survive container replacement.",
  backups: "Off-host copies of your data, with a restore you can trust.",
  logs: "Inspect the latest collected output from your application host.",
  monitoring:
    "Health, issues and resource usage, and how you hear about problems.",
  domains: "The name your application answers on, and the HTTPS behind it.",
  cdn: "Cached copies of eligible files, served closer to your visitors.",
  security: "What can reach this application, and over which ports.",
  variables: "Configuration your application needs to build and run.",
};

/**
 * One stable destination, full width. Live activity that touches it comes
 * first, above facts that only change once work is verified. Views read
 * the recorded stack and the facts each capability records; a resource the
 * application does not have never gets an empty control.
 */
export function ApplicationSectionView({
  section,
  view,
  deployment,
  stack,
  facts = {},
  operations,
  now,
  onRefresh,
  onOpenDestination,
  onOpenConversation,
  onAsk,
  onRevealStack,
  onAction,
  busy,
  loading,
  bar,
  children,
  decisionFor,
}: {
  section: ApplicationSection;
  view: OperatorView;
  deployment: DeploymentRecord | null;
  stack: ApplicationStack;
  facts?: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
  onRefresh: () => Promise<void>;
  onOpenDestination: (destination: ApplicationSection) => void;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  /** Drafts a message; null asks in the current conversation. */
  onAsk: (chatId: string | null, draft: string) => void;
  /** Shows the hidden stack destinations in navigation. */
  onRevealStack?: () => void;
  /** Starts a view action when the product can; absent hides the control. */
  onAction?: (action: ViewAction) => void;
  busy?: string | null;
  /** The record has not been read yet; the view shows its shape, not "none". */
  loading?: boolean;
  /** The bar above the header: the way back to the conversation. */
  bar?: ReactNode;
  children?: ReactNode;
  decisionFor?: (operation: ApplicationOperation) => ReactNode;
}) {
  const app = view.application;
  if (!app) return null;
  const live = deployment?.status === "live";
  const address = facts.domains?.address ?? deployment?.url ?? null;
  const viewProps: ViewProps = {
    stack,
    facts,
    deployment,
    operations,
    chats: view.chats,
    now,
    onOpenDestination,
    onOpenConversation,
    onAsk,
    onAction,
    busy,
  };
  const activity = section !== "overview" && section !== "history" && (
    <DestinationActivity
      section={section}
      operations={operations}
      chats={view.chats}
      now={now}
      onOpenConversation={onOpenConversation}
      onAsk={(draft) => onAsk(null, draft)}
      onInvestigate={(operation) => {
        const issue = facts.monitoring?.issues.find(
          (item) =>
            item.operationId === operation.id && item.state !== "recovered",
        );
        if (!issue || !onAction) return false;
        onAction({ type: "investigate-issue", issue: issue.id });
        return true;
      }}
    />
  );
  let content: ReactNode;
  if (loading && !deployment)
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        {bar}
        <header className="sg-section-header">
          <div>
            <h1>
              {applicationSections.find((item) => item.id === section)?.label}
            </h1>
            <p>{descriptions[section]}</p>
          </div>
        </header>
        <div className="sg-section-content">
          <Loading rows={5} label="Reading the recorded facts" />
        </div>
      </div>
    );
  switch (section) {
    case "overview":
      content = (
        <ApplicationOverview
          view={view}
          deployment={deployment}
          stack={stack}
          facts={facts}
          operations={operations}
          now={now}
          onOpenDestination={onOpenDestination}
          onOpenConversation={onOpenConversation}
          onAsk={onAsk}
          onRevealStack={onRevealStack}
          onAction={onAction}
          busy={busy}
        />
      );
      break;
    case "history":
      content = <HistoryView {...viewProps} decisionFor={decisionFor} />;
      break;
    case "deployment":
      content = <DeploymentView {...viewProps}>{children}</DeploymentView>;
      break;
    case "processes":
      content = <ProcessesView {...viewProps} />;
      break;
    case "database":
      content = <DatabaseView {...viewProps} />;
      break;
    case "cache":
      content = <CacheView {...viewProps} />;
      break;
    case "jobs":
      content = <JobsView {...viewProps} />;
      break;
    case "storage":
      content = <StorageView {...viewProps} />;
      break;
    case "backups":
      content = <BackupsView {...viewProps} />;
      break;
    case "logs":
      content = (
        <LogsView {...viewProps} applicationId={app.id} onRefresh={onRefresh} />
      );
      break;
    case "monitoring":
      content = <MonitoringView {...viewProps} />;
      break;
    case "domains":
      content = <DomainsView {...viewProps} />;
      break;
    case "cdn":
      content = <CdnView {...viewProps} />;
      break;
    case "security":
      content = (
        <>
          {children}
          <SecurityView {...viewProps} />
        </>
      );
      break;
    case "variables":
      content = <VariablesView {...viewProps} />;
      break;
    case "architecture":
      content = null;
      break;
  }
  return (
    <div className={`sg-section-page sg-section-${section}`}>
      {bar}
      <header className="sg-section-header">
        <div>
          <h1>
            {applicationSections.find((item) => item.id === section)?.label}
          </h1>
          <p>{descriptions[section]}</p>
        </div>
        {(live || facts.releases?.serving) && address && (
          <div className="sg-open-application">
            <a
              className="sg-section-open-app"
              href={address}
              target="_blank"
              rel="noreferrer"
            >
              Open application <ArrowSquareOut aria-hidden="true" />
            </a>
            {deployment?.plan?.httpAccess === "controller" && (
              <small>Restricted to the controller’s network</small>
            )}
          </div>
        )}
      </header>
      {section === "architecture" ? (
        <>
          {activity && <div className="sg-section-activity">{activity}</div>}
          {/* PROTOTYPE (claude/architecture-directions): three directions
              for this destination, development builds only. */}
          {process.env.NODE_ENV !== "production" ? (
            <ArchitecturePrototype
              application={app}
              deployment={deployment}
              facts={facts}
              operations={operations}
              onOpenDestination={onOpenDestination}
              onAsk={(draft) => onAsk(null, draft)}
              current={
                <ArchitectureCanvas
                  application={app}
                  deployment={deployment}
                  stack={stack}
                  facts={facts}
                  onOpenDestination={onOpenDestination}
                />
              }
            />
          ) : (
            <ArchitectureCanvas
              application={app}
              deployment={deployment}
              stack={stack}
              facts={facts}
              onOpenDestination={onOpenDestination}
            />
          )}
        </>
      ) : (
        <div className="sg-section-content">
          {activity}
          {content}
        </div>
      )}
    </div>
  );
}
