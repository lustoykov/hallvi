// Builds deterministic Phase 3 tool calls from what a synthetic model has
// seen: the brief, the files it read and the routes it found. It mirrors a
// careful model's choices for the fixture repositories so the deterministic
// tests and the disposable browser app exercise the real tools. No imports
// beyond siblings, so it can be copied into the disposable app.
import type { SeenRead } from "./contract-builder";

export interface SeenBrief {
  brief: {
    baseSha: string;
    requiredChanges: Array<{ field: string; label: string; change: string }>;
  };
  savedProposal: { id: string; status: string } | null;
  acceptedBehavior: { id: string; version: number } | null;
  proposedBehavior: { id: string; version: number } | null;
  stagedInThisRequest: { changes: unknown; acceptanceChecks: number | null };
  executionEnvironment: { state: string; summary: string };
}

/** Files the synthetic model reads before proposing, when the tree has them. */
export const CONFORMANCE_READ_ORDER = [
  "app/main.py",
  "Dockerfile",
  "app/routes/todos.py",
  "app/config.py",
];

const HEALTH_ROUTE = [
  "",
  "",
  '@app.get("/health")',
  "def health() -> dict[str, str]:",
  '    return {"status": "ok"}',
  "",
].join("\n");

/**
 * The source change that resolves the brief's required changes: a health
 * route appended to app/main.py, a 0.0.0.0 bind in the Dockerfile. Options
 * produce the deliberate mistakes the validator must catch.
 */
export function buildSourceChanges(
  brief: SeenBrief,
  reads: SeenRead[],
  options: {
    scopeViolation?: boolean;
    unmapped?: boolean;
    requestApproval?: boolean;
  } = {},
) {
  const read = (path: string) =>
    reads.find((item) => item.path === path && item.status === "read");
  const changes: Array<{ path: string; content: string }> = [];
  const mapping: Array<{
    field: string;
    paths: string[];
    explanation: string;
  }> = [];
  for (const item of brief.brief.requiredChanges) {
    if (item.field === "health.path") {
      const main = read("app/main.py");
      if (!main?.content) continue;
      changes.push({
        path: "app/main.py",
        content: `${main.content.replace(/\n+$/, "")}${HEALTH_ROUTE}`,
      });
      mapping.push({
        field: "health.path",
        paths: ["app/main.py"],
        explanation:
          "Adds GET /health returning 200 beside the existing routes.",
      });
    } else if (item.field === "network.bindHost") {
      const dockerfile = read("Dockerfile");
      if (!dockerfile?.content) continue;
      changes.push({
        path: "Dockerfile",
        content: dockerfile.content.replace(
          '"--host", "127.0.0.1"',
          '"--host", "0.0.0.0"',
        ),
      });
      mapping.push({
        field: "network.bindHost",
        paths: ["Dockerfile"],
        explanation:
          "Starts uvicorn on 0.0.0.0 so the container port is reachable.",
      });
    }
  }
  if (options.scopeViolation)
    changes.push({
      path: ".github/workflows/ci.yml",
      content: "name: ci\non: [push]\n",
    });
  return {
    summary: `Resolve ${brief.brief.requiredChanges.map((item) => item.label).join(", ") || "nothing"} against ${brief.brief.baseSha.slice(0, 8)}.`,
    changes,
    mapping: options.unmapped ? [] : mapping,
    ...(options.requestApproval !== undefined
      ? { requestApproval: options.requestApproval }
      : {}),
  };
}

/** Behavior checks derived from the todos router the model read. */
export function buildAcceptanceChecks(
  reads: SeenRead[],
  options: { invented?: boolean; weak?: boolean } = {},
) {
  const router = reads.find(
    (item) => item.path === "app/routes/todos.py" && item.status === "read",
  );
  const snippet = router?.content
    ?.split("\n")
    .find((line) => line.startsWith("router = APIRouter("));
  const evidence =
    router && snippet
      ? [{ observationId: router.observationId!, path: router.path, snippet }]
      : [];
  const steps = options.invented
    ? [
        {
          name: "invented",
          method: "GET" as const,
          path: "/invented",
          expectStatus: 200,
          expectBodyIncludes: ["x"],
        },
      ]
    : options.weak
      ? [
          {
            name: "list todos",
            method: "GET" as const,
            path: "/todos",
            expectStatus: 200,
            expectBodyIncludes: ["["],
          },
        ]
      : [
          {
            name: "create a todo",
            method: "POST" as const,
            path: "/todos",
            body: '{"title":"Buy milk"}',
            expectStatus: 201,
            expectBodyIncludes: ["Buy milk"],
          },
          {
            name: "read it back",
            method: "GET" as const,
            path: "/todos",
            expectStatus: 200,
            expectBodyIncludes: ["Buy milk"],
          },
        ];
  return {
    rationale:
      "app/routes/todos.py declares POST /todos (201) and GET /todos; creating a todo and reading it back proves the write path and persistence.",
    steps,
    evidence,
  };
}
