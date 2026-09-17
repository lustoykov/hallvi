"use client";

// History, on real records and executions.
//
// Every event with a time, newest first, failures kept. The filters are the
// design's and they work on what the projection produces: changes against
// inspections, work no conversation started, and anything still waiting.

import { useEffect, useMemo, useState } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";
import type { ChatSummary } from "@/server/types";

import type { PageChrome } from "./deployment-prototype/page-head";
import type { ApplicationSection } from "./application-sections";
import { PageHead } from "./deployment-prototype/page-head";
import { historyFromRecords } from "./history-records";
import { buildHistory, type Filter } from "./history-prototype/history-model";
import { TransitHistory } from "./history-prototype/transit";
import {
  HistoryLightPrototype,
  wantedVariant,
} from "./history-light-prototype";
import "./history-prototype/transit.css";

export function HistoryPage({
  records,
  executions,
  chats,
  applicationName,
  now,
  chrome,
  onOpenConversation,
  onOpenDestination,
}: {
  records: SavedInformation[];
  executions: ExecutionRecord[];
  chats: ChatSummary[];
  applicationName: string;
  now: number;
  chrome: PageChrome;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}) {
  // PROTOTYPE · prototype/history-tasks-2. A valid variant keeps this on the
  // real History route and swaps only the page body for invented in-memory
  // facts. Without it, the shipped page remains exactly the default.
  const [prototype, setPrototype] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setPrototype(Boolean(wantedVariant(window.location.search))),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const [filter, setFilter] = useState<Filter>("All");
  const operations = useMemo(
    () => historyFromRecords({ records, executions }),
    [records, executions],
  );
  const history = useMemo(
    () => buildHistory(operations, chats, filter),
    [operations, chats, filter],
  );

  if (prototype) return <HistoryLightPrototype now={now} chrome={chrome} />;

  return (
    <div className="ax-root" data-variant="transit">
      <TransitHistory
        history={history}
        filter={filter}
        onFilter={setFilter}
        now={now}
        head={
          <PageHead
            bar={chrome.bar}
            title="History"
            name={applicationName}
            openUrl={null}
            restricted={false}
          />
        }
        onOpenConversation={onOpenConversation}
        onOpenDestination={onOpenDestination}
      />
    </div>
  );
}
