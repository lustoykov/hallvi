// Credential-shaped content must never be stored, shown to the model or
// rendered. Filenames do not guarantee safety, so content is scanned too.

const SECRET_PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

/** Paths that are never read, whatever they contain. */
export function deniedPathReason(path: string): string | null {
  const name = path.split("/").at(-1) ?? path;
  const lower = path.toLowerCase();
  if (
    /^\.env(\..+)?$/.test(name) &&
    !/^\.env\.(example|sample|template|dist)$/.test(name)
  )
    return "environment files can hold real credentials";
  if (/\.(pem|key|p12|pfx|jks|keystore|tfvars|kdbx)$/i.test(name))
    return "key material and credential stores are never read";
  if (/^id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/.test(name) || name === ".netrc")
    return "SSH and netrc credentials are never read";
  if (/^\.(npmrc|pypirc|git-credentials)$/.test(name))
    return "package-registry and git credential files are never read";
  if (/(^|\/)(secrets?|credentials?)(\/|\.|$)/.test(lower))
    return "paths naming secrets or credentials are never read";
  return null;
}

/** Replaces credential-shaped spans; returns the count so a read can say it
 * was redacted rather than pretend the file was verbatim. */
export function redactSecrets(text: string): { text: string; count: number } {
  let count = 0;
  let result = text;
  for (const pattern of SECRET_PATTERNS)
    result = result.replace(pattern, () => {
      count++;
      return "[REDACTED]";
    });
  return { text: result, count };
}

export function looksLikeSecret(value: string) {
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}
