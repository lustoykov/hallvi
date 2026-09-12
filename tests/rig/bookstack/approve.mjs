// The owner's approval of the first-deployment card, posted to the same route
// and payload the card uses. Private values are generated here and written to
// a 0600 file; they never appear in command text or output. Owner choices:
// APP_URL is the address the local provider stand-in assigns (127.0.0.1),
// admin email is a test address, secrets are random.
// Usage: node approve.mjs <base> <applicationId> [--dry-run]
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Per-run state (test credentials for the disposable instance, evidence) stays
// in ignored results, never beside the committed scripts.
const here =
  process.env.SG_RIG_WORKFLOW ??
  join(dirname(fileURLToPath(import.meta.url)), "../../results/rig/workflow");
mkdirSync(here, { recursive: true });
const [base, applicationId, flag] = process.argv.slice(2);
const inputsFile = join(here, "owner-inputs.json");
const { deployment } = await (
  await fetch(`${base}/api/applications/${applicationId}/deployment`)
).json();
if (deployment?.status !== "awaiting-approval")
  throw new Error(
    `Deployment is ${deployment?.status ?? "missing"}, not awaiting approval.`,
  );
// The controller generates declared random values itself; the card asks
// only for the rest.
const generated = Object.keys(deployment.native.inputGenerators ?? {});
const names = deployment.native.inputs.filter(
  (name) => !generated.includes(name),
);
const reasons = deployment.native.inputReasons ?? {};
const value = (name) =>
  /APP_URL|PUBLIC_URL|BASE_URL/.test(name)
    ? "http://127.0.0.1"
    : /APP_KEY/.test(name)
      ? `base64:${randomBytes(32).toString("base64")}`
      : /EMAIL/.test(name)
        ? "owner@bookstack-audit.invalid"
        : randomBytes(24).toString("base64url");
const existing = existsSync(inputsFile)
  ? JSON.parse(readFileSync(inputsFile, "utf8"))
  : {};
const inputs = Object.fromEntries(
  names.map((name) => [name, existing[name] ?? value(name)]),
);
console.log(
  JSON.stringify(
    {
      deploymentId: deployment.id,
      recommendationId: deployment.recommendationId,
      offer: deployment.offer,
      requested: names.map((name) => ({ name, reason: reasons[name] ?? null })),
      nonSecretChoices: Object.fromEntries(
        names
          .filter((name) => /APP_URL|PUBLIC_URL|BASE_URL|EMAIL/.test(name))
          .map((name) => [name, inputs[name]]),
      ),
    },
    null,
    2,
  ),
);
if (flag === "--dry-run") process.exit(0);
writeFileSync(inputsFile, JSON.stringify(inputs, null, 2), { mode: 0o600 });
const response = await fetch(
  `${base}/api/applications/${applicationId}/deployment`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "approve",
      deploymentId: deployment.id,
      recommendationId: deployment.recommendationId,
      maxMonthly: deployment.offer.monthly,
      inputs,
    }),
  },
);
const body = await response.json();
console.log(
  JSON.stringify({
    status: response.status,
    deploymentStatus: body.deployment?.status ?? null,
    error: body.error ?? null,
  }),
);
