import type { DecisionRecord, OperatorMessage, PiDecision, PiReply } from "./types";

const SYSTEM_PROMPT = `You are Pi inside Server Guy, an operator product for individual engineers.

You are collaborating on Phase 1, Start. The deliverable is a Launch Brief. The checks are:
1. Application identity recorded.
2. Repository readable at an exact identity.
3. Target environment explicit.
4. Permission policy and launch authority explicit.
5. Launch baseline and known prerequisites recorded.

The durable Operator Record in the user prompt is authoritative. Do not claim that an external system was checked unless its Observation says so. Do not claim to have changed code, infrastructure, DNS, or accounts. Phase 1 is read-only apart from Server Guy's local records.

Answer the engineer directly and concisely. If they state a durable decision, extract only supported decisions. Return strict JSON with this shape and no markdown fence:
{"message":"Your response","decisions":[{"kind":"launch-priority","value":"..."}]}

The only Phase 1 decision kind is:
- launch-priority: a concise user-stated operating priority

Application configuration, product rules, future-phase facts, and Approval Mode are not Decision Records. An empty decisions array is valid. Never invent a decision.`;

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

  const decisions: PiDecision[] = [];

  if (Array.isArray(candidate.decisions)) {
    for (const item of candidate.decisions) {
      if (!item || typeof item !== "object") continue;
      const { kind, value } = item as { kind?: unknown; value?: unknown };
      if (kind !== "launch-priority" || typeof value !== "string" || !value.trim()) {
        continue;
      }
      decisions.push({ kind, value: value.trim().slice(0, 300) });
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
      stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted";
    };
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    const text = message.content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    if (message.stopReason && message.stopReason !== "stop") {
      return {
        text,
        error:
          message.errorMessage ??
          `The model response ended with ${message.stopReason} before Server Guy could accept it.`,
      };
    }
    return { text, error: null };
  }
  return { text: "", error: null };
}

function buildPrompt(input: {
  userMessage: string;
  messages: OperatorMessage[];
  decisions: DecisionRecord[];
  recordSummary: string;
}) {
  const transcript = input.messages
    .filter((message) => message.role !== "system")
    .map((message) => `${message.role.toUpperCase()}: ${message.body}`)
    .join("\n");
  const decisions = input.decisions.map((decision) => `${decision.label}: ${decision.value}`).join("\n");

  return `OPERATOR RECORD\n${input.recordSummary}\n\nDECISIONS\n${decisions || "None yet"}\n\nCURRENT OPERATOR SESSION\n${transcript || "No previous messages"}\n\nENGINEER\n${input.userMessage}`;
}

export async function askPi(input: {
  userMessage: string;
  messages: OperatorMessage[];
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
    noContextFiles: true,
    noExtensions: true,
    noPromptTemplates: true,
    noSkills: true,
    noThemes: true,
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
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      response += event.assistantMessageEvent.delta;
    }
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      session.prompt(buildPrompt(input), { expandPromptTemplates: false, source: "rpc" }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("The configured model did not respond within 45 seconds."));
          void session.abort().catch(() => undefined);
        }, 45_000);
      }),
    ]);
    const outcome = lastAssistantOutcome(session.messages);
    if (outcome.error) throw new Error(outcome.error);
    const finalText = outcome.text || response;
    return parsePiReply(finalText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pi is unavailable.";
    throw new Error(`Pi is unavailable: ${message}`);
  } finally {
    if (timeout) clearTimeout(timeout);
    unsubscribe();
    session.dispose();
  }
}
