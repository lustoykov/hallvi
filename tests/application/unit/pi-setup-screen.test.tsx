import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PiSetupScreen } from "../../../src/components/hallvi/pi-setup-screen";
import type { PiSetupStatus } from "../../../src/server/pi-setup";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const selection = {
  providerId: "openai-codex",
  modelId: "gpt-5.6-sol",
  reasoningEffort: "high" as const,
  provider: "OpenAI Codex",
  model: "GPT-5.6 Sol",
};
const initialStatus: PiSetupStatus = {
  state: "needs-choice",
  ready: false,
  mode: null,
  billing: "subscription",
  detected: null,
  hasSavedConfiguration: false,
  models: [
    {
      id: selection.modelId,
      name: selection.model,
      reasoningEfforts: ["high"],
    },
  ],
  separateAuthPath: "/hallvi/pi-auth.json",
  diagnosticLogPath: "/custom/logs/replies.ndjson",
  localTracePath: "/custom/logs/spans.ndjson",
  traceExport: { mode: "off", destination: null },
  runtime: {
    label: "Bundled Pi SDK",
    detail: "No separate installation required.",
  },
  authentication: {
    configured: false,
    label: "Not connected",
    source: "/hallvi/pi-auth.json",
  },
  selection,
  issue: null,
};

function render(overrides: Partial<PiSetupStatus> = {}) {
  const html = renderToStaticMarkup(
    <PiSetupScreen initialStatus={{ ...initialStatus, ...overrides }} />,
  );
  // Native popover content is hidden until explicitly opened; it doesn't expand
  // the card.
  const defaultView = html.replace(
    /<aside\b[^>]*popover[^>]*>[\s\S]*?<\/aside>/g,
    "",
  );
  return { html, defaultView };
}

describe("account-first setup and progressive disclosure", () => {
  it("keeps storage discoverable and explains the real protection without a security claim", () => {
    const { html, defaultView } = render();
    expect(defaultView).toContain("Settings");
    expect(defaultView).toContain("ChatGPT account and model preferences.");
    expect(defaultView).not.toContain("Login stored where Hallvi runs.");
    expect(defaultView).toContain("Connect ChatGPT");
    expect(defaultView).not.toContain(initialStatus.separateAuthPath);
    expect(defaultView).not.toContain("Bundled Pi SDK");
    expect(html).toContain("Storage &amp; privacy");
    expect(html).toContain("Local diagnostic logs");
    expect(html).toContain(initialStatus.diagnosticLogPath);
    expect(defaultView).not.toContain(initialStatus.diagnosticLogPath);
    expect(html).toContain("Copy log path");
    expect(html).toContain("work without Langfuse");
    expect(html).toContain("tokens are not encrypted");
    expect(html).toContain(
      "Other software running as that same user can read them",
    );
    expect(defaultView).not.toContain("Check for a saved login");
    expect(html).toContain("/hallvi/pi-auth-&lt;login-id&gt;.json");
    expect(html.match(/<aside\b/g)).toHaveLength(1);
    expect(html).not.toContain("Demo state");
    expect(defaultView).toMatch(/<button[^>]*disabled[^>]*>View applications/);
    for (const role of ["Hallvi", "Pi", "ChatGPT"]) {
      expect(html).toContain(`<dt>${role}</dt>`);
    }
  });

  it("explains both storage destinations before consent to reuse", () => {
    const { html, defaultView } = render({
      hasSavedConfiguration: true,
      detected: {
        id: "candidate",
        selection,
        settingsPath: "/pi/settings.json",
        authPath: "/pi/auth.json",
        credentialType: "oauth",
        usesDefaultModel: false,
        billing: "subscription",
        canReuse: true,
        issue: null,
      },
      authentication: {
        configured: true,
        label: "Found",
        source: "/pi/auth.json",
      },
    });
    expect(defaultView).toContain("Existing ChatGPT login found");
    expect(defaultView).toContain("Use existing login");
    expect(defaultView).toContain(
      "Share Pi’s login file and copy its model settings.",
    );
    expect(defaultView).toContain("Connect another account");
    expect(defaultView).not.toContain("Check for a saved login");
    expect(defaultView).toContain("GPT-5.6 Sol / High");
    expect(html).toContain("/pi/auth.json");
    expect(html).toContain(
      "Reuse shares Pi’s login file and copies its model preferences.",
    );
    expect(html).toContain("only after it succeeds");
  });

  it("does not claim provider access was tested when only a saved login was found", () => {
    const { html, defaultView } = render({
      state: "ready",
      ready: true,
      mode: "shared",
      hasSavedConfiguration: true,
      authentication: {
        configured: true,
        label: "Found",
        source: "/approved/pi/auth.json",
      },
    });
    expect(defaultView).toContain("Login saved");
    expect(defaultView).toContain("Sharing the existing Pi login file");
    expect(defaultView).toContain("Disconnect</button>");
    expect(defaultView).toContain("Access is checked when you send a message.");
    expect(html).toContain("/approved/pi/auth.json");
    expect(html).not.toContain(initialStatus.separateAuthPath);
    expect(html).toContain(
      "It does not revoke OAuth tokens or sign you out of ChatGPT or Pi.",
    );
  });

  it("offers direct sign-in without a separate storage-configuration step", () => {
    const { defaultView } = render({
      state: "needs-auth",
      mode: "separate",
      hasSavedConfiguration: true,
    });
    expect(defaultView).toContain("Connect ChatGPT");
    expect(defaultView).not.toContain("Set up a new login");
  });

  it("leaves errors and recovery visible outside the help disclosures", () => {
    const { defaultView } = render({
      state: "auth-error",
      mode: "shared",
      issue: "Login file cannot be read.",
    });
    expect(defaultView).toContain('role="alert"');
    expect(defaultView).toContain("Login file cannot be read.");
    expect(defaultView).toContain("Connect ChatGPT");
  });

  it("shows the automatic scan result when no reusable login exists", () => {
    const { defaultView } = render({
      detected: {
        id: "candidate",
        selection,
        settingsPath: "/pi/settings.json",
        authPath: "/pi/auth.json",
        credentialType: null,
        usesDefaultModel: true,
        billing: "subscription",
        canReuse: false,
        issue: "No credentials found.",
      },
    });
    expect(defaultView).toContain("No reusable ChatGPT login found.");
    expect(defaultView).toContain("Connect ChatGPT");
    expect(defaultView).not.toContain("Use existing login");
    expect(defaultView).not.toContain("Check for a saved login");
  });
});
