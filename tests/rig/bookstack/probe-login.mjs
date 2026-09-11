// Read-only credential probe for the disposable BookStack instance: which of
// the published default and the owner-supplied administrator can log in.
// Prints only booleans and status codes, never credential values.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Per-run state (test credentials for the disposable instance, evidence) stays
// in ignored results, never beside the committed scripts.
const here =
  process.env.SG_RIG_WORKFLOW ??
  join(dirname(fileURLToPath(import.meta.url)), "../../results/rig/workflow");
mkdirSync(here, { recursive: true });
const [base, label = "probe"] = process.argv.slice(2);
const inputs = JSON.parse(
  readFileSync(join(here, "owner-inputs.json"), "utf8"),
);
const candidates = {
  publishedDefault: { email: "admin@admin.com", password: "password" },
  ownerSupplied: {
    email: inputs.BOOKSTACK_ADMIN_EMAIL,
    password: inputs.BOOKSTACK_ADMIN_PASSWORD,
  },
};
async function login({ email, password }) {
  const jar = new Map();
  const request = async (path, init = {}) => {
    const headers = new Headers(init.headers ?? {});
    if (jar.size)
      headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const response = await fetch(new URL(path, base), {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const at = pair.indexOf("=");
      jar.set(pair.slice(0, at).trim(), pair.slice(at + 1));
    }
    return response;
  };
  const html = await (await request("/login")).text();
  const token = /name="_token"\s+value="([^"]+)"/.exec(html)?.[1];
  const posted = await request("/login", {
    method: "POST",
    body: new URLSearchParams({ _token: token, email, password }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const probe = await request("/my-account/profile");
  const body = probe.status === 200 ? await probe.text() : "";
  return {
    loginStatus: posted.status,
    redirect: posted.headers.get("location"),
    authenticated: probe.status === 200 && body.includes(email),
  };
}
const result = {};
for (const [name, credential] of Object.entries(candidates))
  result[name] = await login(credential);
const entry = {
  at: new Date().toISOString(),
  label,
  step: "credential-probe",
  ...result,
};
appendFileSync(join(here, "evidence.jsonl"), JSON.stringify(entry) + "\n");
console.log(JSON.stringify(entry, null, 2));
