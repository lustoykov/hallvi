"use client";

// History, on real records and executions.
//
// Every event with a time, newest first, failures kept. The filters are the
// design's and they work on what the projection produces: changes against
// inspections, work no conversation started, and anything still waiting.

import { useMemo, useState } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";
import type { ChatSummary } from "@/server/types";

import type { PageChrome } from "./architecture-prototype/index";
import type { ApplicationSection } from "./application-sections";
import { PageHead } from "./deployment-prototype/page-head";
import { historyFromRecords } from "./history-records";
import { buildHistory, type Filter } from "./history-prototype/history-model";
import { TransitHistory } from "./history-prototype/transit";
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
  const [filter, setFilter] = useState<Filter>("All");
  const operations = useMemo(
    () => historyFromRecords({ records, executions }),
    [records, executions],
  );
  const history = useMemo(
    () => buildHistory(operations, chats, filter),
    [operations, chats, filter],
  );

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
        // Requirements and separate application events are not part of this
        // slice; the events here are the records and the commands.
        decisions={[]}
        activity={[]}
        onOpenConversation={onOpenConversation}
        onOpenDestination={onOpenDestination}
      />
    </div>
  );
}
