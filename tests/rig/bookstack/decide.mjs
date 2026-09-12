// The owner's decision on a proposed operation, posted to the same route and
// payload as the operation card's Approve/Cancel buttons (used because the
// Browser pane is hidden and cannot dispatch clicks). No protected inputs.
// Usage: node decide.mjs <base> <applicationId> <operationId|title>
//   approve|cancel|retry
const [base, applicationId, target, action] = process.argv.slice(2);
const { operations } = await (
  await fetch(`${base}/api/applications/${applicationId}/deployment`)
).json();
const matches = operations.filter(
  (item) => item.id === target || item.title === target,
);
// Approve a proposal; retry a stopped operation; cancel a proposal, a
// queued operation or a stopped one (the card offers Cancel for those).
const wanted =
  action === "retry"
    ? ["failed"]
    : action === "cancel"
      ? ["proposed", "queued", "failed"]
      : ["proposed"];
const operation =
  matches.find((item) => wanted.includes(item.state)) ?? matches.at(-1);
if (!operation) throw new Error(`No operation matches ${target}.`);
console.log(
  JSON.stringify({
    id: operation.id,
    title: operation.title,
    state: operation.state,
    summary: operation.summary,
    decision: operation.decision ?? null,
  }),
);
if (!wanted.includes(operation.state))
  throw new Error(`Operation is ${operation.state}, not ${wanted.join("/")}.`);
const response = await fetch(
  `${base}/api/applications/${applicationId}/operations/${operation.id}/decision`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, updatedAt: operation.updatedAt }),
  },
);
const body = await response.json();
console.log(
  JSON.stringify({
    status: response.status,
    state: body.operation?.state ?? null,
    error: body.error ?? null,
  }),
);
