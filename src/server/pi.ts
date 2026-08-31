import type { ChatMessage, DecisionRecord, PiDecision, PiReply } from "./types";

const SYSTEM_PROMPT = `You are Pi inside Server Guy, an operator product for individual engineers.

You are collaborating on Phase 1, Start. The deliverable is a Launch Brief. The checks are:
1. Application identity recorded.
2. Repository readable at an exact identity.
3. Target environment explicit.
4. Permission policy and launch authority explicit.
5. Launch priorities and known prerequisites recorded.

The durable Operator Record in the user prompt is authoritative. Do not claim that an external system was checked unless its Observation says so. Do not claim to have changed code, infrastructure, DNS, or accounts. Phase 1 is read-only apart from Server Guy's local records.

Answer the engineer directly and concisely. If they state a durable decision, extract only supported decisions. Return strict JSON with this shape and no markdown fence:
{"message":"Your response","decisions":[{"key":"launch_priority","value":"..."}]}

Allowed decision keys:
- approval_mode: pi-decides, always-ask, or full-autonomy
- target_environment: production
- launch_priority: a concise user-stated operating priority
- domain_starting_state: already-owned, needs-acquisition, or unknown

An empty decisions array is valid. Never invent a decision.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Pi returned a response Server Guy could not parse.");
  }
}

export function parsePiReply(text: string): PiReply {
  const candidate = extractJson(text) as { message?: unknown; decisions?: unknown };
  if (typeof candidate.message !== "string" || !candidate.message.trim()) {
    throw new Error("Pi returned no user-facing message.");
  }

  const allowedKeys = new Set([
    "approval_mode",
    "target_environment",
    "launch_priority",
    "domain_starting_state",
  ]);
  const decisions: PiDecision[] = [];

  if (Array.isArray(candidate.decisions)) {
    for (const item of candidate.decisions) {
      if (!item || typeof item !== "object") continue;
      const { key, value } = item as { key?: unknown; value?: unknown };
      if (!allowedKeys.has(String(key)) || typeof value !== "string" || !value.trim()) continue;
      if (key === "approval_mode" && !["pi-decides", "always-ask", "full-autonomy"].includes(value)) {
        continue;
      }
      if (key === "target_environment" && value !== "production") continue;
      if (
        key === "domain_starting_state" &&
        !["already-owned", "needs-acquisition", "unknown"].includes(value)
      ) {
        continue;
      }
      decisions.push({ key: key as PiDecision["key"], value: value.trim().slice(0, 300) });
    }
  }

  return { message: candidate.message.trim(), decisions };
}

function lastAssistantOutcome(messages: unknown[]): { text: string; error: string | null } {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as {
      role?: string;
      content?: Array<{ type?: string; text?: string }>;
      errorMessage?: string;
    };
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    const text = message.content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    return { text, error: message.errorMessage ?? null };
  }
  return { text: "", error: null };
}

function buildPrompt(input: {
  userMessage: string;
  messages: ChatMessage[];
  decisions: DecisionRecord[];
  recordSummary: string;
}) {
  const transcript = input.messages
    .filter((message) => message.role !== "system")
    .map((message) => `${message.role.toUpperCase()}: ${message.body}`)
    .join("\n");
  const decisions = input.decisions.map((decision) => `${decision.label}: ${decision.value}`).join("\n");

  return `OPERATOR RECORD\n${input.recordSummary}\n\nDECISIONS\n${decisions || "None yet"}\n\nCURRENT CHAT\n${transcript || "No previous messages"}\n\nENGINEER\n${input.userMessage}`;
}

export async function askPi(input: {
  userMessage: string;
  messages: ChatMessage[];
  decisions: DecisionRecord[];
  recordSummary: string;
}): Promise<PiReply> {
  const {
    createAgentSession,
    DefaultResourceLoader,
    getAgentDir,
    SessionManager,
  } = await import("@earendil-works/pi-coding-agent");

  const cwd = process.cwd();
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    systemPromptOverride: () => SYSTEM_PROMPT,
    appendSystemPromptOverride: () => [],
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    promptsOverride: () => ({ prompts: [], diagnostics: [] }),
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd,
    noTools: "all",
    tools: [],
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(cwd),
  });

  let response = "";
  let timedOut = false;
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      response += event.assistantMessageEvent.delta;
    }
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    void session.abort();
  }, 45_000);

  try {
    await session.prompt(buildPrompt(input), { expandPromptTemplates: false, source: "rpc" });
    if (timedOut) throw new Error("The configured model did not respond within 45 seconds.");
    const outcome = lastAssistantOutcome(session.messages);
    if (outcome.error) throw new Error(outcome.error);
    const finalText = outcome.text || response;
    try {
      return parsePiReply(finalText);
    } catch {
      if (finalText.trim()) return { message: finalText.trim(), decisions: [] };
      throw new Error("Pi returned no readable response.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pi is unavailable.";
    throw new Error(`Pi is unavailable: ${message}`);
  } finally {
    clearTimeout(timeout);
    unsubscribe();
    session.dispose();
  }
}
