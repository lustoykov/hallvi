import { Type } from "typebox";
import type { SavedCase, Judgment } from "../dashboard/results";
import type { PiSdk } from "../../src/server/pi-configuration";
import { reviewKeysSchema } from "../dashboard/results";
import {
  automaticFailure,
  hasAutomaticEvidence,
  JUDGE_SYSTEM_PROMPT,
} from "./judge-policy";
export { JUDGE_PROMPT_VERSION } from "./judge-policy";

export function judgeCaseKeys(multiple?: string, single?: string) {
  return reviewKeysSchema.parse(
    multiple === undefined ? [single] : JSON.parse(multiple),
  );
}

export async function judgeSelectedAnswers(
  keys: string[],
  review: (key: string) => Promise<void>,
) {
  // No concurrency, automatic retry or continue-after-failure. Earlier saved
  // verdicts remain.
  for (const key of keys) await review(key);
}

export const judgeParameters = Type.Object(
  {
    verdict: Type.Union([
      Type.Literal("pass"),
      Type.Literal("fail"),
      Type.Literal("needs-discussion"),
    ]),
    reason: Type.String({ minLength: 1, maxLength: 5000 }),
  },
  { additionalProperties: false },
);
export function judgePrompt(record: SavedCase) {
  return JSON.stringify({
    rubric: record.rubric,
    input: record.input,
    answer: record.reply,
    automatic: {
      outcome: record.outcome,
      checks: record.checks,
      error: record.error,
    },
    before: record.before,
    after: record.after,
  });
}

/**
 * Judges one saved answer. No application mutation tools, browser, files, or
 * context discovery.
 */
export async function judgeAnswer(
  sdk: PiSdk,
  runtime: Awaited<
    ReturnType<
      typeof import("../../src/server/pi-configuration").configuredPiRuntime
    >
  >,
  record: SavedCase,
) {
  let judgment: Judgment | undefined;
  const tool = sdk.defineTool({
    name: "submit_judgment",
    label: "Review saved answer",
    description:
      "Submit your advisory verdict against the supplied rubric; this is not human approval.",
    parameters: judgeParameters,
    constrainedSampling: { type: "json_schema", strict: "require" },
    async execute(_id, parameters) {
      if (judgment || !parameters.reason.trim())
        throw new Error("One nonempty judgment required");
      judgment = { ...parameters, reason: parameters.reason.trim() };
      return {
        content: [{ type: "text", text: "Advisory judgment collected." }],
        details: judgment,
        terminate: true,
      };
    },
  });
  const cwd = process.cwd();
  const settingsManager = sdk.SettingsManager.inMemory({
    retry: { enabled: false, provider: { maxRetries: 0 } },
  });
  const loader = new sdk.DefaultResourceLoader({
    cwd,
    agentDir: sdk.getAgentDir(),
    settingsManager,
    systemPromptOverride: () => JUDGE_SYSTEM_PROMPT,
    appendSystemPromptOverride: () => [],
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    promptsOverride: () => ({ prompts: [], diagnostics: [] }),
    noContextFiles: true,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await loader.reload();
  const { session } = await sdk.createAgentSession({
    cwd,
    model: runtime.model,
    modelRuntime: runtime.modelRuntime,
    thinkingLevel: runtime.configuration.reasoningEffort,
    settingsManager,
    tools: ["submit_judgment"],
    customTools: [tool],
    resourceLoader: loader,
    sessionManager: sdk.SessionManager.inMemory(cwd),
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      session.prompt(judgePrompt(record), {
        expandPromptTemplates: false,
        source: "rpc",
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          void session.abort().catch(() => undefined);
          reject(new Error("Judge timed out"));
        }, 45_000);
      }),
    ]);
    if (!judgment) throw new Error("Judge did not submit a verdict");
    // The application, not the model, enforces the hard boundary on clearance.
    if (judgment.verdict === "pass") {
      const failure = automaticFailure(record);
      if (failure)
        return {
          verdict: "fail" as const,
          reason:
            `${failure} A model pass cannot override this. Model rationale: ${judgment.reason}`.slice(
              0,
              5000,
            ),
        };
      if (!hasAutomaticEvidence(record))
        return {
          verdict: "needs-discussion" as const,
          reason:
            "Required automatic evidence or the saved input/answer is missing; this answer cannot be LLM-cleared.",
        };
    }
    return judgment;
  } finally {
    if (timeout) clearTimeout(timeout);
    session.dispose();
  }
}
