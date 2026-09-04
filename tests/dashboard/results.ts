import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { automaticFailure, hasAutomaticEvidence, JUDGE_PROMPT_VERSION } from "../evals/judge-policy.ts";

const safeName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}$/);
const caseSchema = z.object({
  caseId: safeName, repetition: z.number().int().positive(), rubric: z.string(),
  outcome: z.enum(["checks-passed", "checks-failed", "run-error", "not-run"]),
  checks: z.record(z.string(), z.boolean()), error: z.string().nullable(),
  input: z.object({ userMessage: z.string() }).passthrough().nullable(),
  reply: z.object({ message: z.string(), decisionProposals: z.array(z.unknown()) }).nullable(),
  before: z.unknown(), after: z.unknown(),
});
export const reportSchema = z.object({
  model: z.string(), effort: z.string(), startedAt: z.string(), commit: z.string(),
  dirty: z.boolean(), sourceFingerprints: z.record(z.string(), z.string()),
  caseIds: z.array(safeName).optional(), repeats: z.number().int().min(1).max(5).optional(),
  plannedCases: z.number().int().nonnegative().optional(),
  results: z.array(caseSchema).max(100),
});
export type SavedCase = z.infer<typeof caseSchema>;
export const verdictSchema = z.enum(["pass", "fail", "needs-discussion"]);
export const humanReviewSchema = z.strictObject({
  verdict: verdictSchema, reason: z.string().trim().min(1).max(5000),
  reviewer: z.string().trim().min(1).max(100),
});
const answerKeysSchema = z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}:[1-9][0-9]*$/))
  .max(100).refine((keys) => new Set(keys).size === keys.length, "Duplicate answers");
export const reviewKeysSchema = answerKeysSchema.min(1);
export const judgmentSchema = z.strictObject({ verdict: verdictSchema, reason: z.string().trim().min(1).max(5000) });
export type Judgment = z.infer<typeof judgmentSchema>;
const reviewFields = { ...judgmentSchema.shape, key: z.string(), sourceHash: z.string(), rubric: z.string(), createdAt: z.string() };
const savedReviewSchema = z.discriminatedUnion("type", [
  z.object({ ...reviewFields, type: z.literal("human"), reviewer: z.string().min(1).max(100) }),
  z.object({ ...reviewFields, type: z.literal("llm"), model: z.string(), effort: z.string(), promptVersion: z.string(), piVersion: z.string() }),
]);
const runStateSchema = z.strictObject({ sourceHash: z.string(), archived: z.boolean() });

export function triageCase(record: SavedCase, reviews: z.infer<typeof savedReviewSchema>[]) {
  const failure = automaticFailure(record);
  if (failure) return { status: "failures", label: "Failed checks", reason: failure };
  const key = caseKey(record);
  const human = reviews.filter((review) => review.key === key && review.type === "human").at(-1);
  if (human) {
    if (human.verdict === "fail") return { status: "failures", label: "Human fail", reason: human.reason };
    if (human.verdict === "needs-discussion") return { status: "needs-review", label: "Needs review", reason: human.reason };
    return { status: "reviewed", label: "Human pass", reason: human.reason };
  }
  const llm = reviews.filter((review) => review.key === key && review.type === "llm").at(-1);
  if (!llm || llm.type !== "llm" || llm.promptVersion !== JUDGE_PROMPT_VERSION) {
    return { status: "needs-judge", label: "Not judged", reason: llm ? "Older judge policy. Judge again to use current triage rules." : "No judgment yet. Run the judge or review this answer yourself." };
  }
  if (llm.verdict === "fail") return { status: "failures", label: "LLM fail", reason: llm.reason };
  if (llm.verdict === "needs-discussion" || !hasAutomaticEvidence(record)) {
    return { status: "needs-review", label: "Needs review", reason: hasAutomaticEvidence(record) ? llm.reason : "Automatic evidence is missing; a model pass cannot clear this answer." };
  }
  return { status: "cleared", label: "LLM-cleared", reason: llm.reason };
}

// The dashboard serves known artifacts, never arbitrary workspace paths or symlinks.
export function directory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) throw new Error("Unsafe artifact directory");
  return path;
}
export function readJson(path: string) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 20_000_000) throw new Error("Invalid artifact file");
  return JSON.parse(readFileSync(path, "utf8"));
}
export function writeJson(path: string, value: unknown) {
  try { if (lstatSync(path).isSymbolicLink()) throw new Error("Unsafe artifact file"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
}
export function loadReport(root: string, run: string) {
  safeName.parse(run);
  const base = directory(join(root, "tests/results/evals"));
  if (!readdirSync(base).includes(run)) throw new Error("Unknown eval run");
  const path = join(base, run);
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) throw new Error("Unknown eval run");
  const raw = readJson(join(path, "results.json"));
  const report = reportSchema.parse(raw);
  const hash = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
  return { path, report, hash };
}
export function caseKey(record: Pick<SavedCase, "caseId" | "repetition">) { return `${record.caseId}:${record.repetition}`; }
export function findCase(root: string, run: string, hash: string, key: string) {
  const saved = loadReport(root, run);
  if (saved.hash !== hash) throw new Error("Results changed. Reload before reviewing.");
  const record = saved.report.results.find((candidate) => caseKey(candidate) === key);
  if (!record || !record.reply || !record.input) throw new Error("This case has no answer to review");
  return { ...saved, record };
}
export function reviewsFor(path: string, hash: string) {
  const reviewDir = directory(join(path, "reviews"));
  return readdirSync(reviewDir).filter((name) => /^[a-f0-9-]+\.json$/.test(name)).flatMap((name) => {
    try {
      const entry = savedReviewSchema.parse(readJson(join(reviewDir, name)));
      return entry.sourceHash === hash ? [entry] : [];
    } catch { return []; }
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function saveReview(root: string, run: string, hash: string, key: string,
  review: { type: "human"; verdict: Judgment["verdict"]; reason: string; reviewer: string }
    | { type: "llm"; verdict: Judgment["verdict"]; reason: string; model: string; effort: string; promptVersion: string; piVersion: string }) {
  const { path, record } = findCase(root, run, hash, key);
  judgmentSchema.parse({ verdict: review.verdict, reason: review.reason });
  const entry = { ...review, key, sourceHash: hash, rubric: record.rubric, createdAt: new Date().toISOString() };
  writeJson(join(directory(join(path, "reviews")), `${randomUUID()}.json`), entry);
  return entry;
}
export function listReports(root: string) {
  return readdirSync(directory(join(root, "tests/results/evals"))).flatMap((run) => {
    try {
      const { report, hash, path } = loadReport(root, run);
      let archived = false; let archiveError = false;
      try { archived = runArchived(path, hash); } catch { archiveError = true; }
      const reviews = reviewsFor(path, hash);
      const triage = Object.fromEntries(report.results.map((record) => [caseKey(record), triageCase(record, reviews)]));
      return [{ run, ...report, hash, reviews, triage, archived, archiveError }];
    } catch { return []; } // Foreign/incomplete directories are not dashboard runs.
  }).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function runArchived(path: string, hash: string): boolean {
  try {
    const state = runStateSchema.parse(readJson(join(path, "run-state.json")));
    return state.sourceHash === hash && state.archived;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function archiveRun(root: string, run: string, hash: string, archived: boolean) {
  const saved = loadReport(root, run);
  if (saved.hash !== hash) throw new Error("Results changed. Reload before archiving.");
  runArchived(saved.path, hash); // Fail closed instead of overwriting corrupt or unsafe metadata.
  writeJson(join(saved.path, "run-state.json"), runStateSchema.parse({ sourceHash: hash, archived }));
  return { archived }; // The entire run moves; evidence and human/LLM verdicts are unchanged.
}

export function saveHumanReviews(root: string, run: string, hash: string, keys: string[], review: z.infer<typeof humanReviewSchema>) {
  reviewKeysSchema.parse(keys); humanReviewSchema.parse(review);
  // Validate the entire selection before the first write. Each verdict remains an independent, append-only record.
  for (const key of keys) findCase(root, run, hash, key);
  const saved: string[] = [];
  for (const key of keys) {
    try { saveReview(root, run, hash, key, { type: "human", ...review }); saved.push(key); }
    catch { break; } // Report partial disk failure honestly; never mark unsaved answers reviewed.
  }
  return { saved, failed: keys.slice(saved.length) };
}
