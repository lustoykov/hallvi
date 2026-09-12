// Healthchecks workflow driver for the trial, run against the disposable local
// instance only. Steps post Healthchecks' own forms with a cookie session and
// CSRF token, as a browser would, and ping the check through its public ping
// route. Redirects are never followed (their targets derive from SITE_ROOT).
// Evidence is appended to evidence.jsonl.
// Usage: node healthchecks.mjs <base-url> setup|verify [label]
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Per-run state (test credentials for the disposable instance, evidence) stays
// in ignored results, never beside the committed scripts.
const here =
  process.env.SG_RIG_WORKFLOW ??
  join(dirname(fileURLToPath(import.meta.url)), "../../results/rig/workflow");
mkdirSync(here, { recursive: true });
const [base, mode, label = mode] = process.argv.slice(2);
if (!base || !["setup", "verify"].includes(mode))
  throw new Error(
    "Usage: node healthchecks.mjs <base-url> setup|verify [label]",
  );
const MARKER = "SG-AUDIT-CHECK-7c41e2";
const NAME = `Nightly export ${MARKER}`;
const stateFile = join(here, "healthchecks-state.json");
const inputs = JSON.parse(
  readFileSync(join(here, "owner-inputs.json"), "utf8"),
);
const owner = {
  email: inputs.HEALTHCHECKS_ADMIN_EMAIL,
  password: inputs.HEALTHCHECKS_ADMIN_PASSWORD,
};

function record(step, details) {
  const entry = { at: new Date().toISOString(), label, step, ...details };
  appendFileSync(join(here, "evidence.jsonl"), JSON.stringify(entry) + "\n");
  console.log(JSON.stringify(entry));
}

class Session {
  jar = new Map();
  async request(path, init = {}) {
    const headers = new Headers(init.headers ?? {});
    if (this.jar.size)
      headers.set(
        "Cookie",
        [...this.jar].map(([key, value]) => `${key}=${value}`).join("; "),
      );
    headers.set("Referer", new URL(path, base).toString());
    const response = await fetch(new URL(path, base), {
      ...init,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const at = pair.indexOf("=");
      this.jar.set(pair.slice(0, at).trim(), pair.slice(at + 1));
    }
    return response;
  }
  async csrf(path) {
    const response = await this.request(path);
    const html = await response.text();
    const match = /name="csrfmiddlewaretoken"\s+value="([^"]+)"/.exec(html);
    if (!match)
      throw new Error(`No CSRF token on ${path} (HTTP ${response.status})`);
    return { token: match[1], html, status: response.status };
  }
  async form(path, fields, from = path) {
    const { token } = await this.csrf(from);
    return this.request(path, {
      method: "POST",
      body: new URLSearchParams({ csrfmiddlewaretoken: token, ...fields }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }
}

const location = (response) =>
  new URL(response.headers.get("location") ?? "/", base).pathname;

async function login() {
  const session = new Session();
  const response = await session.form("/accounts/login/", {
    action: "login",
    email: owner.email,
    password: owner.password,
  });
  // Authenticated only if the session lands on its own project's checks,
  // either straight from the login or through the checks index.
  const projectOf = (path) =>
    /^\/projects\/([0-9a-f-]+)\/checks\/$/.exec(path)?.[1] ?? null;
  let project = projectOf(location(response));
  if (!project) {
    const checks = await session.request("/checks/");
    project = checks.status === 302 ? projectOf(location(checks)) : null;
  }
  return {
    session,
    authenticated: Boolean(project),
    loginStatus: response.status,
    loginTarget: location(response),
    project,
  };
}

async function setup() {
  const { session, authenticated, loginStatus, loginTarget, project } =
    await login();
  record("owner-login", { authenticated, loginStatus, loginTarget });
  if (!authenticated) throw new Error("The owner cannot sign in.");
  // The project's own "Add Check" form, with its default simple period.
  const added = await session.form(
    `/projects/${project}/checks/add/`,
    {
      name: NAME,
      slug: "",
      tags: "audit",
      kind: "simple",
      timeout: "86400",
      grace: "3600",
      schedule: "* * * * *",
      tz: "UTC",
    },
    `/projects/${project}/checks/`,
  );
  // The form returns to the project's list; the new check is the row that
  // carries the marker name.
  const listed = await session.request(`/projects/${project}/checks/`);
  const rows = listed.status === 200 ? await listed.text() : "";
  const row = [...rows.matchAll(/<tr[\s\S]*?<\/tr>/g)]
    .map((match) => match[0])
    .find((markup) => markup.includes(NAME));
  const code = row
    ? /\/checks\/([0-9a-f-]+)\/details\//.exec(row)?.[1]
    : undefined;
  if (!code)
    throw new Error(
      `Adding a check returned HTTP ${added.status} and no row named for it.`,
    );
  const ping = await session.request(`/ping/${code}`);
  const pingBody = (await ping.text()).trim();
  const state = { project, code, name: NAME, marker: MARKER };
  writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  record("content", {
    checkCode: code,
    addStatus: added.status,
    pingStatus: ping.status,
    pingBody,
  });
  record("verify", await verify(state, session));
}

async function verify(state, session) {
  const details = await session.request(`/checks/${state.code}/details/`);
  const html = details.status === 200 ? await details.text() : "";
  const log = await session.request(`/checks/${state.code}/log/`);
  const logHtml = log.status === 200 ? await log.text() : "";
  // Each recorded ping is an "ok" row in the check's own log.
  const pings = (logHtml.match(/<tr class="ok"/g) ?? []).length;
  return {
    detailsStatus: details.status,
    detailsHasName: html.includes(NAME),
    detailsHasMarker: html.includes(MARKER),
    logStatus: log.status,
    loggedPings: pings,
  };
}

if (mode === "setup") await setup();
else {
  if (!existsSync(stateFile)) throw new Error("Run setup first.");
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  const { session, authenticated, loginStatus } = await login();
  record("owner-login", { authenticated, loginStatus });
  if (!authenticated) throw new Error("The owner cannot sign in.");
  record("verify", await verify(state, session));
}
