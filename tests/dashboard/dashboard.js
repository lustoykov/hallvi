const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="testing-token"]').content;
let state = null;
let selectedRun = "";
let selectedCase = "";
let selectedLog = "";
let pendingRun = null;
let formKey = "";
let stateSignature = "";
const reviewDrafts = new Map();
const keyOf = (record) => `${record.caseId}:${record.repetition}`;
function element(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
function report() { return state?.reports.find((r) => r.run === selectedRun); }
function record() { return report()?.results.find((r) => keyOf(r) === selectedCase); }
function latest(type) { return report()?.reviews.filter((r) => r.key === selectedCase && r.type === type).at(-1); }
function failure(error) { $("error").textContent = error.message; $("error").hidden = false; }
async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: { "X-SG-Testing-Token": token, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error); return value;
}
async function refresh() {
  try {
    const nextState = await api("/api/state");
    const signature = JSON.stringify(nextState);
    if (signature === stateSignature) return; // Preserve keyboard focus and open selects between polls.
    stateSignature = signature; state = nextState;
    $("active").hidden = !state.active;
    $("active-text").textContent = state.active ? `Running ${state.active.suite} · started ${new Date(state.active.startedAt).toLocaleTimeString()}` : "";
    $("suites").replaceChildren(...state.suites.map((suite) => {
      const row = document.createElement("tr"); const name = document.createElement("td");
      name.append(element("strong", suite.name), element("small", suite.scope)); row.append(name, element("td", suite.cost), element("td", suite.ci));
      const action = document.createElement("td"); const button = element("button", suite.id === "live" ? "Configure run…" : "Run", suite.id === "live" ? "secondary" : "primary");
      button.disabled = Boolean(state.active); button.addEventListener("click", () => requestRun({ suite: suite.id })); action.append(button); row.append(action); return row;
    }));
    $("empty-runs").hidden = state.history.length > 0;
    $("history").replaceChildren(...state.history.map((run) => {
      const row = element("div", "", "history-item"); const button = element("button", `${run.suite} · ${run.commit}${run.dirty ? " + local changes" : ""}`);
      button.addEventListener("click", () => { selectedLog = run.id; $("log-details").open = true; renderLog(); });
      row.append(button, element("span", new Date(run.startedAt).toLocaleString()), element("span", run.finishedAt ? `${Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000)} seconds` : "In progress"), element("span", run.status, `badge ${run.status === "passed" ? "pass" : run.status === "running" ? "pending" : "fail"}`)); return row;
    })); renderLog();
    const pending = state.reports.reduce((count, r) => count + r.results.filter((c) => c.reply && !r.reviews.some((v) => v.key === keyOf(c) && v.type === "human")).length, 0);
    $("pending").textContent = pending ? `${pending} unreviewed` : "";
    if (!state.reports.some((r) => r.run === selectedRun)) selectedRun = state.reports[0]?.run || "";
    $("report").replaceChildren(...state.reports.map((r) => { const option = element("option", `${new Date(r.startedAt).toLocaleString()} · ${r.model} / ${r.effort}`); option.value = r.run; return option; }));
    $("report").value = selectedRun; $("report").disabled = !state.reports.length;
    $("empty-reviews").hidden = state.reports.length > 0; $("review-content").hidden = !state.reports.length;
    renderReview();
  } catch (error) { failure(error); }
}
function renderLog() { const run = state.history.find((r) => r.id === selectedLog); $("log-details").hidden = !run; if (run) $("log").textContent = run.log; }
function renderReview() {
  const saved = report(); if (!saved) return;
  if (!saved.results.some((c) => keyOf(c) === selectedCase)) selectedCase = saved.results[0] ? keyOf(saved.results[0]) : "";
  const current = record(); if (!current) return;
  $("report-meta").textContent = `${saved.results.length} saved cases · evaluated by ${saved.model} / ${saved.effort} · commit ${saved.commit.slice(0, 8)}${saved.dirty ? " + local changes" : ""}. Reviewing does not run a model.`;
  const focusedCase = document.activeElement?.dataset.caseKey;
  $("cases").replaceChildren(...saved.results.map((c) => {
    const li = document.createElement("li"); const button = element("button", `${c.caseId} / ${c.repetition}`);
    button.dataset.caseKey = keyOf(c);
    const human = saved.reviews.filter((r) => r.type === "human" && r.key === keyOf(c)).at(-1);
    button.append(element("small", human ? `Human: ${human.verdict}` : "Human: pending"));
    button.setAttribute("aria-current", String(keyOf(c) === selectedCase)); button.addEventListener("click", () => { selectedCase = keyOf(c); renderReview(); }); li.append(button); return li;
  }));
  if (focusedCase) Array.from($("cases").querySelectorAll("button")).find((button) => button.dataset.caseKey === focusedCase)?.focus();
  $("case-title").textContent = `${current.caseId} · ${current.repetition}`;
  $("automatic").textContent = `Automatic: ${current.outcome}`; $("automatic").className = `badge ${current.outcome === "checks-passed" ? "pass" : "fail"}`;
  $("rubric").textContent = current.rubric; $("input").textContent = current.input?.userMessage || "Not run";
  $("answer").textContent = current.reply?.message || current.error || "No accepted answer";
  $("proposals").textContent = JSON.stringify(current.reply?.decisionProposals || [], null, 2);
  $("state").textContent = JSON.stringify({ before: current.before, after: current.after }, null, 2);
  $("checks").replaceChildren(...Object.entries(current.checks).map(([name, pass]) => element("li", `${pass ? "Passed" : "Failed"}: ${name}`)));
  const human = latest("human"); const judge = latest("llm");
  $("judge-result").textContent = judge ? `LLM advice: ${judge.verdict}\n${judge.reason}\n${judge.model} / ${judge.effort} · ${new Date(judge.createdAt).toLocaleString()}` : "No LLM judgment for this answer.";
  const nextKey = `${saved.run}:${saved.hash}:${selectedCase}`;
  if (formKey !== nextKey) {
    formKey = nextKey; const draft = reviewDrafts.get(formKey);
    $("reviewer").value = draft?.reviewer ?? human?.reviewer ?? localStorage.getItem("sg-testing-reviewer") ?? "";
    $("verdict").value = draft?.verdict ?? human?.verdict ?? "pass"; $("reason").value = draft?.reason ?? human?.reason ?? "";
    $("saved").textContent = draft ? "Unsaved changes" : human ? `Saved ${new Date(human.createdAt).toLocaleString()}` : "Not reviewed";
    $("judge-model").value = state.defaults.model; $("judge-effort").value = state.defaults.effort;
  }
  $("judge").disabled = Boolean(state.active) || !current.reply;
  $("human-form").querySelector("button").disabled = !current.reply;
}
async function start(input) { try { await api("/api/start", input); $("error").hidden = true; await refresh(); } catch (error) { failure(error); } }
function requestRun(input) {
  if (input.suite !== "live" && input.suite !== "judge") { void start(input); return; }
  const model = input.model || state.defaults.model; const effort = input.effort || state.defaults.effort;
  pendingRun = { ...input, model, effort };
  $("confirm-description").textContent = input.suite === "judge" ? `Ask ${model} / ${effort} to judge one saved answer (${input.key}). Uses the login configured in Server Guy. No application turn will be rerun. Judge retries are disabled.` : `Run 8 real Server Guy agent turns using ${model} / ${effort} and your configured login. Tool calls and Pi’s built-in retries can make multiple requests per turn. Temporary app data only; GitHub is simulated. The runner does not rerun failed cases.`;
  $("consent").checked = false; $("confirm-run").disabled = true; $("confirm").showModal();
}
$("consent").addEventListener("change", () => { $("confirm-run").disabled = !$("consent").checked; });
$("cancel").addEventListener("click", () => { pendingRun = null; $("confirm").close(); });
$("confirm-run").addEventListener("click", () => { if (!$("consent").checked || !pendingRun) return; const input = { ...pendingRun, consent: true }; pendingRun = null; $("confirm").close(); void start(input); });
$("stop").addEventListener("click", () => { void api("/api/stop", {}).then(refresh).catch(failure); });
for (const tab of ["runs", "reviews"]) $(`${tab}-tab`).addEventListener("click", () => {
  for (const name of ["runs", "reviews"]) { $(`${name}-tab`).setAttribute("aria-pressed", String(name === tab)); $(`${name}-panel`).hidden = name !== tab; }
});
$("report").addEventListener("change", () => { selectedRun = $("report").value; selectedCase = ""; renderReview(); });
$("judge").addEventListener("click", () => requestRun({ suite: "judge", run: selectedRun, hash: report().hash, key: selectedCase, model: $("judge-model").value.trim(), effort: $("judge-effort").value }));
$("human-form").addEventListener("input", () => {
  reviewDrafts.set(formKey, { reviewer: $("reviewer").value, verdict: $("verdict").value, reason: $("reason").value });
  $("saved").textContent = "Unsaved changes";
});
$("human-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/review", { run: selectedRun, hash: report().hash, key: selectedCase,
      review: { reviewer: $("reviewer").value, verdict: $("verdict").value, reason: $("reason").value } });
    localStorage.setItem("sg-testing-reviewer", $("reviewer").value); reviewDrafts.delete(formKey); formKey = ""; await refresh(); $("error").hidden = true;
  } catch (error) { failure(error); }
});
void refresh(); setInterval(() => { if (!document.hidden) void refresh(); }, 2500);
