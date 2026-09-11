import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  removeApplication: vi.fn(),
  getPiSetupStatus: vi.fn(),
}));
vi.mock("../../../src/server/pi-setup", () => ({
  piLoginCoordinator: { disconnect: mocks.disconnect },
  getPiSetupStatus: mocks.getPiSetupStatus,
}));
vi.mock("../../../src/server/applications", () => ({
  ExistingApplicationConflictError: class extends Error {},
  NotFoundError: class extends Error {},
  removeApplication: mocks.removeApplication,
}));
vi.mock("../../../src/server/operator-view", () => ({
  getOperatorView: vi.fn(),
}));
import { DELETE as disconnect } from "../../../src/app/api/pi/setup/route";
import { DELETE as remove } from "../../../src/app/api/applications/[applicationId]/route";

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/action", {
    method: "DELETE",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const context = { params: Promise.resolve({ applicationId: "selected-app" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPiSetupStatus.mockResolvedValue({ ready: false });
});

describe("confirmed destructive controls", () => {
  it("disconnects only after explicit confirmation", async () => {
    expect((await disconnect(request({}))).status).toBe(400);
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect((await disconnect(request({ confirm: "disconnect" }))).status).toBe(
      200,
    );
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it("passes the exact selected app and repository to removal", async () => {
    mocks.removeApplication.mockReturnValue({
      removedApplicationId: "selected-app",
    });
    const response = await remove(
      request({ repository: "owner/repo" }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.removeApplication).toHaveBeenCalledWith(
      "selected-app",
      "owner/repo",
    );
  });

  it.each([{}, { repository: "owner/repo", all: true }, { repository: 42 }])(
    "rejects invalid removal requests without mutation",
    async (body) => {
      expect((await remove(request(body), context)).status).toBe(400);
      expect(mocks.removeApplication).not.toHaveBeenCalled();
    },
  );

  it("rejects cross-origin disconnect and removal", async () => {
    expect(
      (
        await disconnect(
          request({ confirm: "disconnect" }, "https://elsewhere.test"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await remove(
          request({ repository: "owner/repo" }, "https://elsewhere.test"),
          context,
        )
      ).status,
    ).toBe(400);
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(mocks.removeApplication).not.toHaveBeenCalled();
  });

  it("accepts the actual browser Host when Next normalizes a loopback URL", async () => {
    const local = new Request("http://localhost:3112/api/pi/setup", {
      method: "DELETE",
      headers: { host: "127.0.0.1:3112", origin: "http://127.0.0.1:3112" },
      body: JSON.stringify({ confirm: "disconnect" }),
    });
    expect((await disconnect(local)).status).toBe(200);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it("does not accept a cross-origin request using a spoofed forwarded host", async () => {
    const crossSite = new Request("http://localhost:3112/api/pi/setup", {
      method: "DELETE",
      headers: {
        host: "127.0.0.1:3112",
        origin: "https://elsewhere.test",
        "x-forwarded-host": "elsewhere.test",
      },
      body: JSON.stringify({ confirm: "disconnect" }),
    });
    expect((await disconnect(crossSite)).status).toBe(400);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });
});
