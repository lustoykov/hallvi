import {
  InMemoryCredentialStore,
  InMemoryModelsStore,
} from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

import {
  PI_BUILTIN_TOOLS,
  type PiBuiltinName,
} from "../../../src/server/pi-workspace";

// Valid, harmless calls. A controller-local implementation would fail on the
// missing README or leave files in the session's scratch cwd.
export const nativeToolCalls: Record<PiBuiltinName, object> = {
  read: { path: "README.md" },
  write: { path: "written.txt", content: "from Pi" },
  edit: { path: "written.txt", edits: [{ oldText: "Pi", newText: "model" }] },
  bash: { command: "touch bash-ran" },
  powershell: { command: "New-Item powershell-ran" },
  grep: { pattern: "model" },
  find: { pattern: "*.txt" },
  ls: { path: "." },
};

/**
 * Registers captured createAgentSession tool options in the actual SDK and
 * calls every native name through the executable tool it offers the model.
 */
export async function callNativeToolsThroughSdk(
  options: { tools?: string[]; customTools?: unknown[] },
  signal?: AbortSignal,
) {
  const sdk = await vi.importActual<
    typeof import("@earendil-works/pi-coding-agent")
  >("@earendil-works/pi-coding-agent");
  const root = mkdtempSync(join(tmpdir(), "haldur-native-tools-"));
  const cwd = join(root, "cwd");
  const agentDir = join(root, "agent");
  mkdirSync(cwd);
  mkdirSync(agentDir);
  try {
    const settingsManager = sdk.SettingsManager.inMemory();
    const resourceLoader = new sdk.DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      noContextFiles: true,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
    });
    await resourceLoader.reload();
    const { session } = await sdk.createAgentSession({
      cwd,
      agentDir,
      settingsManager,
      resourceLoader,
      sessionManager: sdk.SessionManager.inMemory(cwd),
      modelRuntime: await sdk.ModelRuntime.create({
        credentials: new InMemoryCredentialStore(),
        modelsStore: new InMemoryModelsStore(),
        modelsPath: null,
        refreshOnCreate: false,
        allowModelNetwork: false,
      }),
      tools: options.tools,
      customTools: options.customTools as ToolDefinition[],
    });
    try {
      const results: Record<string, unknown> = {};
      for (const name of PI_BUILTIN_TOOLS) {
        const tool = session.agent.state.tools.find(
          (offered) => offered.name === name,
        );
        if (!tool) throw new Error(`The session does not offer ${name}.`);
        results[name] = await tool.execute(
          `call-${name}`,
          nativeToolCalls[name],
          signal,
        );
      }
      return { results, controllerFiles: readdirSync(cwd) };
    } finally {
      session.dispose();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
