import { expect, it, vi } from "vitest";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
const mocks = vi.hoisted(() => ({ ssh: vi.fn(), event: vi.fn() }));
vi.mock("../../../src/server/deployment-ssh", () => ({
  deploymentSsh: mocks.ssh,
}));
vi.mock("../../../src/server/release-executor", () => ({
  releaseSecrets: () => ({
    redact: (s: string) => s.replaceAll("synthetic-secret", "[REDACTED]"),
  }),
}));
vi.mock("../../../src/server/deployment-store", () => ({
  deploymentEvent: mocks.event,
}));
import { inspectRelease } from "../../../src/server/release-diagnostics";
it("scopes read-only diagnostics and redacts secrets before persistence or model feedback", async () => {
  const record = {
    id: "0b38e71d-b054-412c-87dd-5c87fae80d08",
  } as DeploymentRecord;
  mocks.ssh.mockResolvedValue("app exited: synthetic-secret");
  const result = await inspectRelease(record, new AbortController().signal);
  expect(result).toMatchObject({
    ok: true,
    evidence: "app exited: [REDACTED]",
  });
  expect(mocks.ssh.mock.calls[0][1]).toContain(
    "label=com.docker.compose.project=sg-0b38e71d",
  );
  expect(mocks.ssh.mock.calls[0][1]).not.toMatch(
    /\.Config.Env|docker (exec|stop|start|restart|rm)/,
  );
  expect(JSON.stringify(mocks.event.mock.calls)).not.toContain(
    "synthetic-secret",
  );
});
