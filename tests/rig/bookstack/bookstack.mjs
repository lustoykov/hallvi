// BookStack workflow driver for the audit, run against the disposable local
// instance only. Web steps post BookStack's own forms with a cookie session
// and CSRF token, as a browser would; content steps use BookStack's REST API
// with a token created through its own form. Redirects are never followed
// (their targets derive from APP_URL). Evidence is appended to evidence.jsonl.
// Usage: node bookstack.mjs <base-url> setup|verify|reset-default <label>
import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
// Per-run state (test credentials for the disposable instance, evidence) stays
// in ignored results, never beside the committed scripts.
const here =
  process.env.SG_RIG_WORKFLOW ??
  join(dirname(fileURLToPath(import.meta.url)), "../../results/rig/workflow");
mkdirSync(here, { recursive: true });
const [base, mode, label = mode] = process.argv.slice(2);
if (!base || !["setup", "verify", "reset-default"].includes(mode))
  throw new Error(
    "Usage: node bookstack.mjs <base-url> setup|verify|reset-default <label>",
  );
// Test credentials for this disposable instance; never the owner's.
const stateFile = join(here, "bookstack-state.json");
const DEFAULT = { email: "admin@admin.com", password: "password" };
const MARKER = "SG-AUDIT-PAGE-5b2d9a";
const files = {
  attachment: join(fixtures, "sg-audit-attachment.txt"),
  image: join(fixtures, "sg-audit-stripes.png"),
};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expected = {
  attachment: sha(readFileSync(files.attachment)),
  image: sha(readFileSync(files.image)),
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
    const match =
      /name="_token"\s+value="([^"]+)"/.exec(html) ??
      /<meta name="token" content="([^"]+)"/.exec(html);
    if (!match)
      throw new Error(`No CSRF token on ${path} (HTTP ${response.status})`);
    return match[1];
  }
  async form(path, fields, { method = "POST", from = path } = {}) {
    const token = await this.csrf(from);
    return this.request(path, {
      method: "POST",
      body: new URLSearchParams({
        _token: token,
        ...(method === "POST" ? {} : { _method: method }),
        ...fields,
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }
}

async function login({ email, password }) {
  const session = new Session();
  const response = await session.form("/login", { email, password });
  // Authenticated only if this session can open its own profile.
  const probe = await session.request("/my-account/profile");
  const html = probe.status === 200 ? await probe.text() : "";
  return {
    session,
    authenticated: probe.status === 200 && html.includes(email),
    loginStatus: response.status,
    probeStatus: probe.status,
  };
}

function api(state) {
  return async (path, init = {}) => {
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Token ${state.tokenId}:${state.tokenSecret}`);
    headers.set("Accept", "application/json");
    const response = await fetch(new URL(`/api/${path}`, base), {
      ...init,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* non-JSON */
    }
    if (!response.ok)
      throw new Error(
        `API ${path}: HTTP ${response.status} ${text.slice(0, 300)}`,
      );
    return body;
  };
}
const local = (url) => {
  const parsed = new URL(url, base);
  return `${parsed.pathname}${parsed.search}`;
};

async function verify(state, session) {
  const call = api(state);
  const page = await call(`pages/${state.pageId}`);
  const pageView = await session.request(
    `/books/${state.bookSlug}/page/${state.pageSlug}`,
  );
  const pageHtml = await pageView.text();
  const attachmentWeb = Buffer.from(
    await (
      await session.request(`/attachments/${state.attachmentId}`)
    ).arrayBuffer(),
  );
  const attachmentApi = await call(`attachments/${state.attachmentId}`);
  const imageWeb = await session.request(local(state.imageUrl));
  const imageBytes = Buffer.from(await imageWeb.arrayBuffer());
  const imageData = await fetch(
    new URL(`/api/image-gallery/${state.imageId}/data`, base),
    {
      headers: { Authorization: `Token ${state.tokenId}:${state.tokenSecret}` },
      signal: AbortSignal.timeout(60_000),
    },
  );
  const imageDataBytes = Buffer.from(await imageData.arrayBuffer());
  const result = {
    pageApiHasMarker: String(page.html).includes(MARKER),
    pageApiRevisions: page.revision_count,
    pageViewStatus: pageView.status,
    pageViewHasMarker: pageHtml.includes(MARKER),
    pageViewHasImage: pageHtml.includes(new URL(state.imageUrl).pathname),
    attachmentWebSha: sha(attachmentWeb),
    attachmentApiSha: sha(Buffer.from(attachmentApi.content ?? "", "base64")),
    attachmentMatches:
      sha(attachmentWeb) === expected.attachment &&
      sha(Buffer.from(attachmentApi.content ?? "", "base64")) ===
        expected.attachment,
    imagePath: new URL(state.imageUrl).pathname,
    imageWebStatus: imageWeb.status,
    imageWebSha: sha(imageBytes),
    imageDataStatus: imageData.status,
    imageDataSha: sha(imageDataBytes),
    imageMatches: sha(imageBytes) === expected.image,
  };
  return result;
}

if (mode === "setup") {
  if (existsSync(stateFile)) throw new Error("Setup already ran; use verify.");
  // The starting administrator: BookStack's published default, or the one the
  // deployment configured from the owner's approval inputs.
  const inputs = JSON.parse(
    readFileSync(join(here, "owner-inputs.json"), "utf8"),
  );
  const configured = Object.keys(inputs).find((name) =>
    /ADMIN_EMAIL/.test(name),
  );
  const configuredPassword = Object.keys(inputs).find((name) =>
    /ADMIN_PASSWORD/.test(name),
  );
  const first = await login(DEFAULT);
  record("default-login", {
    authenticated: first.authenticated,
    loginStatus: first.loginStatus,
    probeStatus: first.probeStatus,
  });
  let start = first;
  if (!first.authenticated && configured && configuredPassword) {
    start = await login({
      email: inputs[configured],
      password: inputs[configuredPassword],
    });
    record("configured-admin-login", {
      authenticated: start.authenticated,
      loginStatus: start.loginStatus,
      probeStatus: start.probeStatus,
    });
  }
  if (!start.authenticated)
    throw new Error("No starting administrator login succeeded.");
  const session = start.session;
  // Pi's advice after the failed bootstrap: replace the default account with
  // the credentials the owner intended, i.e. those supplied at approval.
  const owner = {
    name: "Audit Owner",
    email: inputs[configured] ?? "owner@bookstack-audit.invalid",
    password:
      inputs[configuredPassword] ?? randomBytes(18).toString("base64url"),
  };
  const profile = await session.form(
    "/my-account/profile",
    { name: owner.name, email: owner.email },
    { method: "PUT" },
  );
  const password = await session.form(
    "/my-account/auth/password",
    { password: owner.password, "password-confirm": owner.password },
    { method: "PUT", from: "/my-account/auth" },
  );
  record("replace-credentials", {
    profileStatus: profile.status,
    passwordStatus: password.status,
    newEmail: owner.email,
  });
  const created = await session.form("/api-tokens/1/create", {
    name: "sg-audit",
    expires_at: "",
  });
  const tokenPage = created.headers.get("location") ?? "";
  const tokenHtml = await (await session.request(local(tokenPage))).text();
  const tokenId =
    /name="token_id"[^>]*value="([^"]+)"/.exec(tokenHtml)?.[1] ??
    /value="([^"]+)"[^>]*name="token_id"/.exec(tokenHtml)?.[1];
  const tokenSecret = /readonly="readonly" value="([^"]+)"/.exec(
    tokenHtml,
  )?.[1];
  if (!tokenId || !tokenSecret)
    throw new Error(
      `API token not shown (HTTP ${created.status} → ${tokenPage}).`,
    );
  const state = { ...owner, tokenId, tokenSecret };
  const call = api(state);
  const book = await call("books", {
    method: "POST",
    body: JSON.stringify({
      name: "Haldur Audit Handbook",
      description: "Created by the Haldur BookStack + MariaDB audit.",
    }),
    headers: { "Content-Type": "application/json" },
  });
  const html = `<h2>MariaDB lifecycle notes</h2><p>Recognizable content: ${MARKER}. Written before recreation, update and restore checks.</p>`;
  const page = await call("pages", {
    method: "POST",
    body: JSON.stringify({
      book_id: book.id,
      name: "MariaDB lifecycle notes",
      html,
    }),
    headers: { "Content-Type": "application/json" },
  });
  const attachmentForm = new FormData();
  attachmentForm.set("name", "sg-audit-attachment.txt");
  attachmentForm.set("uploaded_to", String(page.id));
  attachmentForm.set(
    "file",
    new Blob([readFileSync(files.attachment)], { type: "text/plain" }),
    "sg-audit-attachment.txt",
  );
  const attachment = await call("attachments", {
    method: "POST",
    body: attachmentForm,
  });
  const imageForm = new FormData();
  imageForm.set("type", "gallery");
  imageForm.set("uploaded_to", String(page.id));
  imageForm.set("name", "sg-audit-stripes.png");
  imageForm.set(
    "image",
    new Blob([readFileSync(files.image)], { type: "image/png" }),
    "sg-audit-stripes.png",
  );
  const image = await call("image-gallery", {
    method: "POST",
    body: imageForm,
  });
  await call(`pages/${page.id}`, {
    method: "PUT",
    body: JSON.stringify({
      html: `${html}<p><img src="${image.url}" alt="sg-audit-stripes"></p>`,
    }),
    headers: { "Content-Type": "application/json" },
  });
  Object.assign(state, {
    bookId: book.id,
    bookSlug: book.slug,
    pageId: page.id,
    pageSlug: page.slug,
    attachmentId: attachment.id,
    imageId: image.id,
    imageUrl: image.url,
  });
  writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  record("content", {
    bookId: book.id,
    pageId: page.id,
    attachmentId: attachment.id,
    imageId: image.id,
    imageUrl: image.url,
  });
  record("verify", await verify(state, session));
} else if (mode === "reset-default") {
  // Replay intervention: return the administrator to BookStack's published
  // defaults through its own forms, recreating the audit's first symptom.
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  const current = await login(state);
  if (!current.authenticated)
    throw new Error("The recorded administrator cannot log in.");
  const profile = await current.session.form(
    "/my-account/profile",
    { name: "Admin", email: DEFAULT.email },
    { method: "PUT" },
  );
  const password = await current.session.form(
    "/my-account/auth/password",
    { password: DEFAULT.password, "password-confirm": DEFAULT.password },
    { method: "PUT", from: "/my-account/auth" },
  );
  record("reset-default", {
    profileStatus: profile.status,
    passwordStatus: password.status,
    defaultAuthenticated: (await login(DEFAULT)).authenticated,
    ownerAuthenticated: (await login(state)).authenticated,
  });
} else {
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  const old = await login(DEFAULT);
  const current = await login(state);
  record("credentials", {
    defaultAuthenticated: old.authenticated,
    ownerAuthenticated: current.authenticated,
  });
  if (!current.authenticated) throw new Error("Owner login failed.");
  record("verify", await verify(state, current.session));
}
