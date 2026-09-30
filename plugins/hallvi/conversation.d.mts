export interface ConversationStep {
  id: string;
  kind: "tool" | "said";
  [field: string]: unknown;
}
export interface ConversationTurn {
  request: { id: string; requestKey: string; body: string } | null;
  reply: {
    id: string;
    status: string;
    steps: ConversationStep[];
    [field: string]: unknown;
  } | null;
}
export function projectConversation(
  snapshot: Record<string, unknown>,
  options?: { turns?: number },
): {
  status: string | null;
  worker: { alive: boolean };
  turns: ConversationTurn[];
  turnsOmitted: number;
  revision: string;
};
export function projectTraffic(
  history: Record<string, unknown>,
): Record<string, unknown>;
