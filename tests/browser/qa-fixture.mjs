// Isolated browser QA: real app/routes/domain/SQLite, deterministic external
// adapters.
// Never copies .server-guy, .env files, or credentials from the source
// checkout.
import {
  cpSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  renameSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createTemporaryRoot,
  removeTemporaryRoot,
} from "../temporary-root.mjs";

const source = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const parentPid = process.ppid;
const port = Number(process.argv[2] ?? 3111);
const loginMode = process.argv[3] ?? "failure";
if (!["success", "failure"].includes(loginMode))
  throw new Error("Choose success or failure for QA login.");
const initialSetup = process.argv[4] ?? "ready";
if (!["ready", "fresh"].includes(initialSetup))
  throw new Error("Choose ready or fresh for initial QA setup.");
if (!Number.isInteger(port) || port < 3100 || port > 3999)
  throw new Error("Use a QA port from 3100 to 3999.");
const root = createTemporaryRoot("/tmp/server-guy-e2e-");
// Everything under root is disposable. It is deleted whenever this process
// ends: after Next stops on
// SIGTERM/SIGINT from Playwright or the dashboard, after the orphan watch, or
// after a setup failure.
// Only a hard kill (SIGKILL) skips this, because no handler runs then.
let child = null;
let worker = null;
process.on("exit", () => {
  try {
    removeTemporaryRoot(root);
  } catch (error) {
    console.error(`Could not delete ${root}: ${error.message}`);
  }
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (child) {
      child.kill(signal);
      worker?.kill(signal);
    } else process.exit(143);
  });
const app = join(root, "app");
const state = join(root, "state");
const pi = join(root, "pi");
for (const directory of [app, state, pi])
  mkdirSync(directory, { recursive: true });
for (const name of [
  "src",
  "scripts",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "drizzle.config.ts",
]) {
  cpSync(join(source, name), join(app, name), { recursive: true });
}
symlinkSync(join(source, "node_modules"), join(app, "node_modules"), "dir");
renameSync(
  join(app, "src/server/pi-configuration.ts"),
  join(app, "src/server/pi-configuration-real.ts"),
);
cpSync(
  join(source, "tests/browser-fixtures/pi-configuration.ts.txt"),
  join(app, "src/server/pi-configuration.ts"),
);
cpSync(
  join(source, "tests/browser-fixtures/github-api.ts.txt"),
  join(app, "src/server/github-api.ts"),
);
cpSync(
  join(source, "tests/browser-fixtures/login-fixture.ts.txt"),
  join(app, "src/server/qa-login-fixture.ts"),
);
cpSync(
  join(source, "tests/browser-fixtures/login-route.ts.txt"),
  join(app, "src/app/api/pi/setup/login/route.ts"),
);
cpSync(
  join(source, "tests/browser-fixtures/login-attempt-route.ts.txt"),
  join(app, "src/app/api/pi/setup/login/[attemptId]/route.ts"),
);
const model = {
  providerId: "openai-codex",
  modelId: "gpt-5.6-sol",
  reasoningEffort: "high",
};
const auth = {
  "openai-codex": {
    type: "oauth",
    access: "QA-SYNTHETIC-ACCESS",
    refresh: "QA-SYNTHETIC-REFRESH",
    expires: Date.now() + 86_400_000,
  },
};
if (initialSetup === "ready") {
  writeFileSync(
    join(state, "github-connection.json"),
    JSON.stringify({
      id: "00000000-0000-4000-8000-000000000001",
      mode: "cli",
      source: "gh",
      fingerprint: createHash("sha256")
        .update("gh\0QA-GITHUB-TOKEN")
        .digest("hex"),
      account: { id: 42, login: "qa-fixture-user" },
      connectedAt: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );
  writeFileSync(join(state, "pi-auth.json"), JSON.stringify(auth), {
    mode: 0o600,
  });
  writeFileSync(join(pi, "auth.json"), JSON.stringify(auth), { mode: 0o600 });
  writeFileSync(
    join(pi, "settings.json"),
    JSON.stringify({
      defaultProvider: model.providerId,
      defaultModel: model.modelId,
      defaultThinkingLevel: model.reasoningEffort,
    }),
  );
  writeFileSync(
    join(state, "pi-settings.json"),
    JSON.stringify({
      ...model,
      mode: "separate",
      credentialType: "oauth",
      authPath: join(state, "pi-auth.json"),
    }),
    { mode: 0o600 },
  );
}

const env = {
  ...process.env,
  SERVER_GUY_DB_PATH: join(state, "qa.db"),
  SERVER_GUY_CONFIG_DIR: state,
  PI_CODING_AGENT_DIR: pi,
  SERVER_GUY_QA_ROOT: root,
  SERVER_GUY_QA_LOGIN_MODE: loginMode,
  SERVER_GUY_GITHUB_CLIENT_ID: "Iv1.qa",
  SERVER_GUY_GITHUB_APP_SLUG: "qa-server-guy",
  NEXT_TELEMETRY_DISABLED: "1",
};
for (const key of Object.keys(env)) {
  if (
    /(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|GITHUB_TOKEN|GH_TOKEN|OPENAI_API_KEY)$/.test(
      key,
    )
  )
    delete env[key];
}
execFileSync("npm", ["run", "db:push", "--silent"], {
  cwd: app,
  env,
  stdio: "pipe",
});
const manifest = {
  root,
  app,
  state,
  pi,
  port,
  source,
  initialSetup,
  database: env.SERVER_GUY_DB_PATH,
  externalAdapters:
    "Production Pi adapter, native SDK sessions and tools; only model responses and GitHub API/credentials are synthetic. ChatGPT OAuth " +
    loginMode +
    " and GitHub device flow are simulated without provider calls",
};
writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest));
worker = spawn(process.execPath, ["--import", "tsx", "src/worker.ts"], {
  cwd: app,
  env,
  stdio: "inherit",
});
child = spawn(
  process.execPath,
  [
    join(source, "node_modules/next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { cwd: app, env, stdio: "inherit" },
);
// Playwright can die before worker teardown runs. Stop this detached fixture's
// Next child even if the parent disappeared while database setup was running.
const orphanWatch = setInterval(() => {
  if (process.ppid !== parentPid) {
    child.kill("SIGTERM");
    worker?.kill("SIGTERM");
  }
}, 250);
orphanWatch.unref();
worker.on("exit", (code) => {
  if (code) child.kill("SIGTERM");
});
child.on("exit", (code) => {
  if (worker.exitCode !== null || worker.signalCode !== null)
    process.exit(code ?? 0);
  worker.once("exit", () => process.exit(code ?? 0));
  worker.kill("SIGTERM");
});
