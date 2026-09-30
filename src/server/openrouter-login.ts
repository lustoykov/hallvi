import { createHash, randomBytes, randomUUID } from "node:crypto";

import { saveOpenRouterKey } from "./pi-configuration";

// Sign in with OpenRouter, the flow OpenRouter publishes for apps like this
// one: the owner approves on openrouter.ai, OpenRouter sends the browser back
// to this controller with a one-time code, and the code and a secret only this
// attempt holds (PKCE) buy a key. A code arriving for anyone else's attempt
// buys nothing. The controller only answers on loopback, which OpenRouter
// accepts on any port.

const AUTHORIZE_URL = "https://openrouter.ai/auth";
const KEY_URL = "https://openrouter.ai/api/v1/auth/keys";
const ATTEMPT_TTL_MS = 15 * 60_000;

export type OpenRouterLoginState = "awaiting-user" | "complete" | "failed";

export interface OpenRouterLogin {
  id: string;
  state: OpenRouterLoginState;
  authorizeUrl: string;
  message: string;
}

interface Attempt {
  public: OpenRouterLogin;
  verifier: string;
  createdAt: number;
}

export class OpenRouterLoginCoordinator {
  private readonly attempts = new Map<string, Attempt>();

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  /** `origin` is the controller as the browser reaches it. */
  start(origin: string): OpenRouterLogin {
    this.cleanup();
    const id = randomUUID();
    const verifier = randomBytes(32).toString("base64url");
    const callback = new URL("/api/pi/setup/openrouter/callback", origin);
    callback.searchParams.set("attempt", id);
    const authorize = new URL(AUTHORIZE_URL);
    authorize.search = new URLSearchParams({
      callback_url: callback.href,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      key_label: "Hallvi",
    }).toString();
    const attempt: Attempt = {
      public: {
        id,
        state: "awaiting-user",
        authorizeUrl: authorize.href,
        message: "Approve Hallvi on OpenRouter, then come back here.",
      },
      verifier,
      createdAt: Date.now(),
    };
    this.attempts.set(id, attempt);
    return { ...attempt.public };
  }

  get(id: string): OpenRouterLogin | null {
    this.cleanup();
    const attempt = this.attempts.get(id);
    return attempt ? { ...attempt.public } : null;
  }

  /** OpenRouter sent the browser back with a code for this attempt. */
  async finish(id: string, code: string | null): Promise<OpenRouterLogin> {
    this.cleanup();
    const attempt = this.attempts.get(id);
    if (!attempt || attempt.public.state !== "awaiting-user")
      throw new Error(
        "This OpenRouter sign-in is no longer open. Start it again from Hallvi.",
      );
    try {
      if (!code) throw new Error("OpenRouter sent no code. Nothing was saved.");
      const response = await this.fetcher(KEY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: attempt.verifier,
          code_challenge_method: "S256",
        }),
        signal: AbortSignal.timeout(20_000),
      });
      // The body holds the key: read it only on success, and never repeat it.
      const key = response.ok
        ? ((await response.json().catch(() => null)) as { key?: unknown })?.key
        : null;
      if (typeof key !== "string" || !key)
        throw new Error(
          `OpenRouter did not issue a key (status ${response.status}). Nothing was saved.`,
        );
      saveOpenRouterKey(key);
      attempt.public = {
        ...attempt.public,
        state: "complete",
        message: "OpenRouter key saved.",
      };
    } catch (error) {
      attempt.public = {
        ...attempt.public,
        state: "failed",
        message:
          error instanceof Error && error.name !== "TimeoutError"
            ? error.message
            : "OpenRouter did not answer. Nothing was saved.",
      };
    }
    return { ...attempt.public };
  }

  private cleanup() {
    const now = Date.now();
    for (const [id, attempt] of this.attempts)
      if (now - attempt.createdAt > ATTEMPT_TTL_MS) this.attempts.delete(id);
  }
}

const globalForOpenRouter = globalThis as typeof globalThis & {
  hallviOpenRouterLogin?: OpenRouterLoginCoordinator;
};

export const openRouterLogin =
  globalForOpenRouter.hallviOpenRouterLogin ?? new OpenRouterLoginCoordinator();

if (process.env.NODE_ENV !== "production") {
  globalForOpenRouter.hallviOpenRouterLogin = openRouterLogin;
}
