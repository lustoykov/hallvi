import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function verifyR2PrivacyOutputs(devUrl, domains) {
  // Fail closed on unknown output or any attached custom domain.
  if (
    !/^Public access via the r2\.dev URL is disabled\.$/m.test(devUrl) ||
    !/^There are no custom domains connected to this bucket\.$/m.test(domains)
  ) {
    throw new Error("R2 public URL settings were not verified as disabled.");
  }
  return { r2DevEnabled: false, customDomains: 0 };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [account, bucket] = process.argv.slice(2);
  try {
    if (
      !/^[a-f0-9]{32}$/.test(account) ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)
    )
      throw new Error("Invalid R2 destination.");
    const check = (args) =>
      execFileSync(
        "npx",
        ["--yes", "wrangler@4.130.0", "r2", "bucket", ...args, bucket],
        {
          encoding: "utf8",
          timeout: 30000,
          killSignal: "SIGKILL",
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    const result = verifyR2PrivacyOutputs(
      check(["dev-url", "get"]),
      check(["domain", "list"]),
    );
    console.log(
      JSON.stringify({ ...result, checkedAt: new Date().toISOString() }),
    );
  } catch {
    console.error("Could not verify that the R2 bucket has no public URLs.");
    process.exitCode = 1;
  }
}
