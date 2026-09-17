"use client";

import type { ReactNode } from "react";

import type { ApplicationFacts } from "@/server/application-facts";
import type { OperatorView } from "@/server/types";

import type { Reachability } from "./deployment-prototype/page-head";
import { InformationCard } from "./information-card";
import { LocalTime } from "./local-time";
import { rank } from "./presentation";
import {
  applicationSections,
  type ApplicationSection,
} from "./application-sections";
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

// The line under each destination's heading, and the first sentence a reader
// gets about a page. So it may not describe a page that no longer exists.
// Logs promised collected output from the host and nothing collects any;
// Backups promised "a restore you can trust" on a page whose whole argument
// is that a restore is trustworthy only once somebody has run one; Deployment
// offered a next release it has no way to propose; History described every
// operation, when it now keeps what happened and folds the rest underneath.
const descriptions: Record<ApplicationSection, string> = {
  history: "What has happened to this application, and the commands behind it.",
  overview:
    "What is running, what needs you, what changed, and how fresh the evidence is.",
  architecture: "How your source, application, host and data fit together.",
  deployment:
    "What is running, what ran before it, and how the latest attempt went.",
  processes:
    "The web and worker processes that make up your application on its instance.",
  database:
    "The database your application depends on, and where its data lives.",
  cache:
    "The cache or broker your application relies on, and the queue its workers consume.",
  jobs: "Scheduled commands and queued work, and the processes that run them.",
  storage: "Volumes and files that must survive container replacement.",
  backups:
    "Copies of your data off this server, and whether one has been opened.",
  logs: "What Haldur's own commands printed, and where each of them ran.",
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
  facts = {},
  now,
  reachable = "checking",
  onReopen,
  onRefresh,
  onOpenDestination,
  onOpenConversation,
  onAsk,
  bar,
  children,
}: {
  section: ApplicationSection;
  view: OperatorView;
  facts?: ApplicationFacts;
  now: number;
  /** Whether a private way in still answers; see PageHead. */
  reachable?: Reachability;
  /** Asks Pi to reopen private access when it is closed. */
  onReopen?: () => void;
  onRefresh: () => Promise<void>;
  onOpenDestination: (destination: ApplicationSection) => void;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  /** Drafts a message; null asks in the current conversation. */
  onAsk: (chatId: string | null, draft: string) => void;
  /** The bar above the header: the way back to the conversation. */
  bar?: ReactNode;
  children?: ReactNode;
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
  // Every destination is drawn by its designed page from the records behind
  // it. A page with thin records draws its own empty state; a destination
  // with no page yet falls through to the card list at the end, which says
  // nobody has looked. There is no second layout to fall back to.
  //
  // Records the page has not been handed are not records it may call none:
  // "nothing established" is a claim, and a view still loading has not
  // earned it.
  const information = view.information;
  if (information === undefined)
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
          <p className="sg-section-reading">Reading the recorded facts…</p>
        </div>
      </div>
    );
  if (section === "overview")
    return (
      <OverviewPage
        records={information}
        executions={view.executions ?? []}
        application={app}
        chats={view.chats}
        now={now}
        reduced={false}
        reachable={reachable}
        onReopen={onReopen}
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
        records={information}
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
        onReopen={onReopen}
        records={information}
        executions={view.executions ?? []}
        applicationName={app.name}
        now={now}
        chrome={{
          bar,
          header: null,
          activity: null,
        }}
        panel={children}
        onAsk={(draft) => onAsk(null, draft)}
      />
    );
  if (section === "processes")
    return (
      <ProcessesPage
        reachable={reachable}
        onReopen={onReopen}
        records={information}
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
        onReopen={onReopen}
        records={information}
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
        onReopen={onReopen}
        page={section}
        records={information}
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
        onReopen={onReopen}
        records={information}
        applicationId={app.id}
        applicationName={app.name}
        now={now}
        chrome={{ bar, header: null, activity: null }}
        controller={facts.controllerProtection}
        onRefresh={onRefresh}
        onAsk={(draft) => onAsk(null, draft)}
      />
    );
  if (section === "monitoring")
    return (
      <MonitoringPage
        reachable={reachable}
        onReopen={onReopen}
        records={information}
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
        onReopen={onReopen}
        records={information}
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
        onReopen={onReopen}
        page={section as SupplyPage}
        records={information}
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
        records={information}
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
  const records = information
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
