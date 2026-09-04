#!/usr/bin/env node
// Fake gh executable, used only on the disposable QA app's PATH.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (!process.env.SERVER_GUY_QA_ROOT) throw new Error("QA root required; this is not a real gh command.");
const endpoint = process.argv[3];
if (process.argv[2] !== "api") throw new Error("Only fixture gh api commands are supported.");
if (endpoint === "user") {
  console.log(JSON.stringify({ login: "qa-fixture-user" }));
} else {
  const [, owner, name, action] = endpoint.split("/");
  if (!owner || !name) throw new Error("Expected repos/owner/name.");
  if (name.includes("slow-create") && !action) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  if (name.includes("missing")) { console.error("HTTP 404: repository not found (QA fixture)"); process.exit(1); }
  if (name.includes("offline")) { console.error("network unavailable (QA fixture)"); process.exit(1); }
  if (name.includes("recovering") && !action) {
    const flag = join(process.env.SERVER_GUY_QA_ROOT, `retried-${owner}-${name}`);
    if (!existsSync(flag)) { writeFileSync(flag, "1"); console.error("network unavailable on first inspection (QA fixture)"); process.exit(1); }
  }
  const fullName = `${owner}/${name}`;
  const sha = "1234567890abcdef1234567890abcdef12345678";
  console.log(JSON.stringify(action === "commits"
    ? { sha, html_url: `https://github.com/${fullName}/commit/${sha}` }
    : { full_name: fullName, html_url: `https://github.com/${fullName}`, visibility: "private", default_branch: "main", permissions: { pull: true, push: false, admin: false } }));
}
