import { Type } from "typebox";

import { phaseOneCheckListForPrompt } from "./phase-one-spec";
import { parsePiAssistantMessageValue } from "./schemas";
import type { ChatMessage, Decision, PiDecision, PiTurnResult } from "./types";

export class PiUnavailableError extends Error {}

export const MAX_PI_DECISION_PROPOSALS = 20;

export const proposeDecisionParameters = Type.Object(
  {
    kind: Type.Literal("launch-priority", {
      description: "The only Decision kind supported in Phase 1.",
    }),
    value: Type.String({
      description: "A concise operating priority explicitly stated by the engineer.",
      minLength: 1,
      maxLength: 300,
    }),
    replaces: Type.Optional(
      Type.String({
        description: "The exact UUID of a current Decision this one replaces.",
        format: "uuid",
      }),
    ),
  },
  { additionalProperties: false },
);

const SYSTEM_PROMPT = `You are Pi inside Server Guy, an operator product for individual engineers.

You are collaborating on Phase 1, Start. The deliverable is a Launch Brief. The checks are:
${phaseOneCheckListForPrompt()}

The current Operator View in the user prompt is authoritative. Do not claim that an external system was checked unless its Observation says so. Do not claim to have changed code, infrastructure, DNS, or accounts. Phase 1 is read-only apart from Server Guy's local records.

Answer the engineer directly and concisely in normal text.

If the engineer explicitly states a durable launch priority, call propose_decision. A Decision proposal exists only when that tool call succeeds; conversational text alone never records one. Server Guy decides whether the proposal can be persisted. After any tool call, finish with a normal user-facing response. Do not claim a Decision was recorded when the tool call failed.

The only Phase 1 decision kind is:
- launch-priority: a concise user-stated operating priority

To correct a current Decision, copy its exact ID from CURRENT DECISIONS into replaces. Omit replaces for an additional Decision. Application configuration, product rules, future-phase facts, and Approval Mode are not Decisions. Never invent a Decision or Decision ID.`;

export function collectPiDecisionProposal(
  proposals: PiDecision[],
  input: PiDecision,
): PiDecision {
  if (proposals.length >= MAX_PI_DECISION_PROPOSALS) {
    throw new Error("Pi proposed more than 20 Decisions in one turn.");
  }
  const value = input.value.trim();
  if (!value) {
    throw new Error("Pi returned an empty Decision value.");
  }
  const proposal = { ...input, value };
  proposals.push(proposal);
  return proposal;
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
  messages: ChatMessage[];
  decisions: Decision[];
  viewSummary: string;
}) {
  const transcript = input.messages
    .map((message) => `${message.role.toUpperCase()}: ${message.body}`)
    .join("\n");
  const decisions = input.decisions
    .map((decision) => `${decision.id} · ${decision.label}: ${decision.value}`)
    .join("\n");

  return `CURRENT OPERATOR VIEW\n${input.viewSummary}\n\nCURRENT DECISIONS\n${decisions || "None yet"}\n\nCURRENT CHAT\n${transcript || "No previous messages"}\n\nENGINEER\n${input.userMessage}`;
}

export async function askPi(input: {
  userMessage: string;
  messages: ChatMessage[];
  decisions: Decision[];
  viewSummary: string;
}): Promise<PiTurnResult> {
  const {
    createAgentSession,
    defineTool,
    DefaultResourceLoader,
    getAgentDir,
    SessionManager,
  } = await import("@earendil-works/pi-coding-agent");

  const decisionProposals: PiDecision[] = [];
  const proposeDecisionTool = defineTool({
    name: "propose_decision",
    label: "Propose Decision",
    description:
      "Propose one durable launch-priority Decision explicitly stated by the engineer. This is the only machine-readable path for a Decision proposal.",
    promptSnippet: "Propose a typed Phase 1 Decision",
    promptGuidelines: [
      "Call propose_decision only for an explicit, durable launch priority stated by the engineer.",
      "Use replaces only with an exact UUID from CURRENT DECISIONS.",
      "After a successful call, finish the turn with a normal conversational response.",
    ],
    parameters: proposeDecisionParameters,
    constrainedSampling: { type: "json_schema", strict: "require" },
    async execute(_toolCallId, params) {
      const proposal = collectPiDecisionProposal(decisionProposals, params);
      return {
        content: [
          {
            type: "text",
            text: "Decision proposal accepted for this turn. Continue with the user-facing response.",
          },
        ],
        details: proposal,
      };
    },
  });

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
    tools: ["propose_decision"],
    customTools: [proposeDecisionTool],
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
    return {
      message: parsePiAssistantMessageValue(finalText),
      decisionProposals,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pi is unavailable.";
    throw new PiUnavailableError(`Pi is unavailable: ${message}`);
  } finally {
    if (timeout) clearTimeout(timeout);
    unsubscribe();
    session.dispose();
  }
}
