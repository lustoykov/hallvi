"use client";

import { currentFacts } from "@/server/release-facts";
import { ArrowSquareOut } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { ApplicationFacts, ViewAction } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import type { OperatorView } from "@/server/types";

import { InformationCard } from "./information-card";
import { LocalTime } from "./local-time";
import { rank } from "./presentation";
import { RecordOverview } from "./record-overview";
import { ApplicationOverview } from "./application-overview";
import {
  applicationSections,
  type ApplicationSection,
} from "./application-sections";
import { ArchitectureCanvas } from "./architecture-canvas";
import { ArchitecturePage } from "./architecture-page";
import { OverviewPage } from "./overview-page";
import { DeploymentPage } from "./deployment-page";
import { HistoryPage } from "./history-page";
import { LogsPage } from "./logs-page";
import { BackupsPage } from "./backups-page";
import { DatabasePage } from "./database-page";
import { MonitoringPage } from "./monitoring-page";
import { ProcessesPage } from "./processes-page";
import { ReachPageView } from "./reach-pages";
import { SupplyPageView, type SupplyPage } from "./supply-pages";
import { StoragePage } from "./storage-page";
import { ArchitecturePrototype } from "./architecture-prototype";
import { BackupPrototype } from "./backup-prototype";
import { DataPrototype } from "./data-prototype";
import { OverviewPrototype } from "./overview-prototype";
import { ReachPrototype } from "./reach-prototype";
import { SupplyPrototype } from "./supply-prototype";
import { DeploymentPrototype } from "./deployment-prototype";
import { DestinationActivity } from "./destination-activity";
import { HistoryPrototype } from "./history-prototype";
import { SignalPrototype } from "./signal-prototype";
import { StackPrototype } from "./stack-prototype";
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
  reachable = true,
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
  /** Whether a private way in still answers; see PageHead. */
  reachable?: boolean;
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
  // The live operator reads shared information. Older layouts below remain
  // available only to the isolated visual-reference scenarios.
  //
  // A destination with a designed component uses it for whatever the records
  // hold — a complete picture, a partly observed one, or nothing at all, in
  // which case the design draws its own empty state. Only a destination that
  // has not been ported yet falls through to the card list; going back to
  // cards when records are thin would mean the page a reader learns is the
  // one they see least.
  if (view.information !== undefined) {
    if (section === "overview")
      return (
        <OverviewPage
          reachable={reachable}
          records={view.information}
          executions={view.executions ?? []}
          application={app}
          chats={view.chats}
          now={now}
          reduced={false}
          chrome={{
            bar,
            header: (
              <header className="sg-section-header">
                <div>
                  <h1>Overview</h1>
                  <p>{descriptions.overview}</p>
                </div>
              </header>
            ),
            activity: null,
          }}
          onOpenConversation={onOpenConversation}
          onOpenDestination={onOpenDestination}
          onAsk={(draft) => onAsk(null, draft)}
        />
      );
    if (section === "logs")
      return (
        <LogsPage
          executions={view.executions ?? []}
          now={now}
          bar={bar}
          onAsk={(draft) => onAsk(null, draft)}
          onOpenDestination={onOpenDestination}
        />
      );
    if (section === "history")
      return (
        <HistoryPage
          records={view.information}
          executions={view.executions ?? []}
          chats={view.chats}
          applicationName={app.name}
          now={now}
          chrome={{ bar, header: null, activity: null }}
          onOpenConversation={onOpenConversation}
          onOpenDestination={onOpenDestination}
        />
      );
    if (section === "deployment")
      return (
        <DeploymentPage
          reachable={reachable}
          records={view.information}
          executions={view.executions ?? []}
          applicationName={app.name}
          now={now}
          chrome={{
            bar,
            header: null,
            activity: null,
          }}
          panel={children}
          onOpenConversation={onOpenConversation}
          onOpenDestination={onOpenDestination}
          onAsk={(draft) => onAsk(null, draft)}
        />
      );
    if (section === "processes")
      return (
        <ProcessesPage
          reachable={reachable}
          records={view.information}
          applicationId={app.id}
          applicationName={app.name}
          now={now}
          chrome={{ bar, header: null, activity: null }}
          onOpenConversation={onOpenConversation}
          onOpenDestination={onOpenDestination}
          onAsk={(draft) => onAsk(null, draft)}
        />
      );
    if (section === "storage")
      return (
        <StoragePage
          reachable={reachable}
          records={view.information}
          applicationId={app.id}
          applicationName={app.name}
          now={now}
          chrome={{ bar, header: null, activity: null }}
          onAsk={(draft) => onAsk(null, draft)}
        />
      );
    if (section === "domains" || section === "security")
      return (
        <ReachPageView
          reachable={reachable}
          page={section}
          records={view.information}
          applicationId={app.id}
          applicationName={app.name}
          now={now}
          chrome={{ bar, header: null, activity: null }}
          panel={section === "security" ? children : null}
          onOpenDestination={onOpenDestination}
          onAsk={(draft) => onAsk(null, draft)}
        />
      );
    if (section === "backups")
      return (
        <BackupsPage
          reachable={reachable}
          records={view.information}
          applicationId={app.id}
          applicationName={app.name}
          now={now}
          chrome={{ bar, header: null, activity: null }}
          onAsk={(draft) => onAsk(null, draft)}
        />
      );
    if (section === "monitoring")
      return (
        <MonitoringPage
          reachable={reachable}
          records={view.information}
          applicationId={app.id}
          applicationName={app.name}
          now={now}
          chrome={{ bar, header: null, activity: null }}
          onAsk={(draft) => onAsk(null, draft)}
        />
      );
    if (section === "database")
      return (
        <DatabasePage
          reachable={reachable}
          records={view.information}
          applicationId={app.id}
          applicationName={app.name}
          now={now}
          chrome={{ bar, header: null, activity: null }}
          onOpenDestination={onOpenDestination}
          onAsk={(draft) => onAsk(null, draft)}
        />
      );
    if (
      section === "cache" ||
      section === "jobs" ||
      section === "variables" ||
      section === "cdn"
    )
      return (
        <SupplyPageView
          reachable={reachable}
          page={section as SupplyPage}
          records={view.information}
          applicationId={app.id}
          applicationName={app.name}
          secrets={view.secrets ?? []}
          now={now}
          chrome={{ bar, header: null, activity: null }}
          onOpenDestination={onOpenDestination}
          onAsk={(draft) => onAsk(null, draft)}
        />
      );
    if (section === "architecture")
      return (
        <ArchitecturePage
          reachable={reachable}
          records={view.information}
          applicationId={app.id}
          applicationName={app.name}
          now={now}
          chrome={{
            bar,
            header: (
              <header className="sg-section-header">
                <div>
                  <h1>Architecture</h1>
                  <p>{descriptions.architecture}</p>
                </div>
              </header>
            ),
            activity: null,
          }}
          onOpenDestination={onOpenDestination}
          onAsk={(draft) => onAsk(null, draft)}
        />
      );
    const records = view.information
      .filter((r) => !r.retiredAt && r.presentation?.views.includes(section))
      // What needs you comes first, what is simply true next, what Pi
      // suggests last; within a group, the most recently established.
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          (a.presentation?.content?.kind === "application-access"
            ? 0
            : a.presentation?.content?.kind === "deployment"
              ? 1
              : 2) -
            (b.presentation?.content?.kind === "application-access"
              ? 0
              : b.presentation?.content?.kind === "deployment"
                ? 1
                : 2) ||
          Date.parse(b.establishedAt ?? b.updatedAt) -
            Date.parse(a.establishedAt ?? a.updatedAt),
      );
    const freshest = records
      .map((r) => r.establishedAt ?? r.updatedAt)
      .sort()
      .at(-1);
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        {bar}
        <header className="sg-section-header">
          <div>
            <h1>{applicationSections.find((s) => s.id === section)?.label}</h1>
            <p>{descriptions[section]}</p>
          </div>
          {freshest && (
            <span className="sg-section-fresh">
              Last established <LocalTime value={freshest} variant="compact" />
            </span>
          )}
        </header>
        <div className="sg-section-content">
          {records.map((record) => (
            <InformationCard
              key={record.id}
              record={record}
              onOpen={onOpenDestination}
              currentView={section}
            />
          ))}
          {/* Logs has its own page and its own empty state now. */}
          {!records.length && (
            <div className="sg-section-none">
              <h2>Nothing has been established here yet.</h2>
              <p>
                That is not a claim that there is nothing to find — only that Pi
                has not looked, or has not saved what it found. Ask in the
                conversation and whatever it establishes will be kept here.
              </p>
            </div>
          )}
          {children}
        </div>
      </div>
    );
  }
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
      content = (
        <HistoryView
          {...viewProps}
          decisions={view.decisions}
          activity={view.activity}
          decisionFor={decisionFor}
        />
      );
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
      content = <BackupsView {...viewProps} onRefresh={onRefresh} />;
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
  const header = (
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
          {currentFacts(deployment ?? null)?.httpAccess === "controller" && (
            <small>Restricted to the controller’s network</small>
          )}
        </div>
      )}
    </header>
  );
  // The Overview and Architecture chosen on claude/architecture-directions
  // are the default experience; their bar still switches to the shipped
  // page. They receive the page's chrome so they can draw their own header.
  if (section === "overview")
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        <OverviewPrototype
          application={app}
          deployment={deployment}
          facts={facts}
          operations={operations}
          chats={view.chats}
          onOpenConversation={onOpenConversation}
          onOpenDestination={onOpenDestination}
          onAsk={(draft) => onAsk(null, draft)}
          chrome={{ bar, header, activity: null }}
          current={<div className="sg-section-content">{content}</div>}
        />
      </div>
    );
  if (section === "architecture")
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        <ArchitecturePrototype
          application={app}
          deployment={deployment}
          facts={facts}
          operations={operations}
          chats={view.chats}
          onOpenConversation={onOpenConversation}
          onOpenDestination={onOpenDestination}
          onAsk={(draft) => onAsk(null, draft)}
          chrome={{
            bar,
            header,
            activity: activity ? (
              <div className="sg-section-activity">{activity}</div>
            ) : null,
          }}
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
      </div>
    );
  // Deployment and History chosen on claude/deployment-history (Transit)
  // are the default the same way. The product's panel still handles the
  // actions it owns.
  if (section === "deployment")
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        <DeploymentPrototype
          record={deployment}
          operations={operations}
          facts={facts}
          chats={view.chats}
          now={now}
          onOpenConversation={onOpenConversation}
          onOpenDestination={onOpenDestination}
          onAsk={(draft) => onAsk(null, draft)}
          chrome={{
            bar,
            header,
            activity: activity ? (
              <div className="sg-section-activity">{activity}</div>
            ) : null,
          }}
          panel={children}
          current={
            <div className="sg-section-content">
              {activity}
              {content}
            </div>
          }
        />
      </div>
    );
  if (section === "history")
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        <HistoryPrototype
          record={deployment}
          facts={facts}
          operations={operations}
          chats={view.chats}
          now={now}
          onOpenConversation={onOpenConversation}
          onOpenDestination={onOpenDestination}
          decisionFor={decisionFor}
          decisions={view.decisions}
          activity={view.activity}
          chrome={{ bar, header, activity: null }}
          current={<div className="sg-section-content">{content}</div>}
        />
      </div>
    );
  // Storage in Flow and Backups in Calendar, chosen on opus-ui-improvements,
  // are the default the same way.
  if (section === "storage" || section === "backups")
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        <BackupPrototype
          page={section}
          record={deployment}
          stack={stack}
          facts={facts}
          operations={operations}
          now={now}
          onAsk={(draft) => onAsk(null, draft)}
          chrome={{
            bar,
            header,
            activity: activity ? (
              <div className="sg-section-activity">{activity}</div>
            ) : null,
          }}
          current={
            <div className="sg-section-content">
              {activity}
              {content}
            </div>
          }
        />
      </div>
    );
  // PROTOTYPE (opus-ui-improvements): the four remaining destinations, each
  // drawn once: configuration, delivery, queued work and schedules.
  if (
    section === "variables" ||
    section === "cdn" ||
    section === "cache" ||
    section === "jobs"
  )
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        <SupplyPrototype
          page={section}
          record={deployment}
          stack={stack}
          facts={facts}
          operations={operations}
          now={now}
          onAsk={(draft) => onAsk(null, draft)}
          onOpenDestination={onOpenDestination}
          chrome={{
            bar,
            header,
            activity: activity ? (
              <div className="sg-section-activity">{activity}</div>
            ) : null,
          }}
          current={
            <div className="sg-section-content">
              {activity}
              {content}
            </div>
          }
        />
      </div>
    );
  // PROTOTYPE (opus-ui-improvements): three directions for Domains and three
  // different ones for Security — the two pages ask different questions —
  // beside the shipped view (0).
  if (section === "domains" || section === "security")
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        <ReachPrototype
          page={section}
          record={deployment}
          stack={stack}
          facts={facts}
          operations={operations}
          now={now}
          onAsk={(draft) => onAsk(null, draft)}
          onOpenDestination={onOpenDestination}
          panel={section === "security" ? children : null}
          onCheck={
            section === "security" && onAction
              ? () => onAction({ type: "check-firewall" })
              : undefined
          }
          checking={busy === "check-firewall"}
          chrome={{
            bar,
            header,
            activity: activity ? (
              <div className="sg-section-activity">{activity}</div>
            ) : null,
          }}
          current={
            <div className="sg-section-content">
              {activity}
              {content}
            </div>
          }
        />
      </div>
    );
  // PROTOTYPE (opus-ui-improvements): directions for Logs and Monitoring,
  // beside the shipped view (0).
  if (section === "logs" || section === "monitoring")
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        <SignalPrototype
          page={section}
          record={deployment}
          stack={stack}
          facts={facts}
          operations={operations}
          now={now}
          onAsk={(draft) => onAsk(null, draft)}
          chrome={{
            bar,
            header,
            activity: activity ? (
              <div className="sg-section-activity">{activity}</div>
            ) : null,
          }}
          current={
            <div className="sg-section-content">
              {activity}
              {content}
            </div>
          }
        />
      </div>
    );
  // Processes in Transit's Line and Database in Overview's Timeline, chosen
  // on opus-ui-improvements, are the default the same way.
  if (section === "database")
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        <DataPrototype
          record={deployment}
          stack={stack}
          facts={facts}
          operations={operations}
          now={now}
          onAsk={(draft) => onAsk(null, draft)}
          onOpenDestination={onOpenDestination}
          chrome={{
            bar,
            header,
            activity: activity ? (
              <div className="sg-section-activity">{activity}</div>
            ) : null,
          }}
          current={
            <div className="sg-section-content">
              {activity}
              {content}
            </div>
          }
        />
      </div>
    );
  if (section === "processes")
    return (
      <div className={`sg-section-page sg-section-${section}`}>
        <StackPrototype
          record={deployment}
          stack={stack}
          facts={facts}
          operations={operations}
          now={now}
          onAsk={(draft) => onAsk(null, draft)}
          onOpenConversation={onOpenConversation}
          onOpenDestination={onOpenDestination}
          chrome={{
            bar,
            header,
            activity: activity ? (
              <div className="sg-section-activity">{activity}</div>
            ) : null,
          }}
          current={
            <div className="sg-section-content">
              {activity}
              {content}
            </div>
          }
        />
      </div>
    );
  return (
    <div className={`sg-section-page sg-section-${section}`}>
      {bar}
      {header}
      <div className="sg-section-content">
        {activity}
        {content}
      </div>
    </div>
  );
}
