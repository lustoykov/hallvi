import { expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ issue: vi.fn() }));
vi.mock("@/server/terminal-bridge", () => ({
  issueTerminalTicket: calls.issue,
}));
vi.mock("@/server/terminal-session", () => ({
  hostFor: vi.fn(),
  readSize: vi.fn(),
}));
import { POST } from "@/app/api/applications/[applicationId]/terminal/route";

it.each(["http://127.0.0.1:9000", "https://evil.example", "null"])(
  "rejects a ticket request from %s before issuing a capability",
  async (origin) => {
    const response = await POST(
      new Request("http://127.0.0.1:3000/api/applications/app/terminal", {
        method: "POST",
        headers: { origin, host: "127.0.0.1:3000" },
        body: JSON.stringify({ size: { cols: 80, rows: 24 } }),
      }),
      { params: Promise.resolve({ applicationId: "app" }) },
    );
    expect(response.ok).toBe(false);
    expect(calls.issue).not.toHaveBeenCalled();
  },
);
