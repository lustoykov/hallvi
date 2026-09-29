import { beforeEach, expect, it, vi } from "vitest";
import { record } from "../fixtures/records";
const mocks = vi.hoisted(() => ({
  records: vi.fn(),
  privateOpen: vi.fn(),
  publicOpen: vi.fn(),
  server: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@/server/saved-information", () => ({
  listInformation: mocks.records,
}));
vi.mock("@/server/private-access", () => ({
  privateAccessOpen: mocks.privateOpen,
  privateAccessPortAllowed: () => true,
}));
vi.mock("@/server/public-access", () => ({
  publicUrlReachable: mocks.publicOpen,
}));
vi.mock("@/server/operator-execution", () => ({
  operatorSettings: mocks.settings,
}));
vi.mock("@/server/pulse", () => ({ serverBeat: mocks.server }));
vi.mock("@/server/http", () => ({
  handle: async (work: () => unknown) => Response.json(await work()),
}));
import { GET } from "@/app/api/applications/[applicationId]/access/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue({ host: { address: "host" } });
  mocks.server.mockResolvedValue("answering");
  mocks.privateOpen.mockResolvedValue(true);
  mocks.publicOpen.mockResolvedValue(false);
});
const read = async () =>
  (
    await GET(new Request("http://localhost/api/access"), {
      params: Promise.resolve({ applicationId: "app-1" }),
    })
  ).json();

it("checks exactly the current private route and reports tunnel evidence without HTTP or app-health claims", async () => {
  const saved = record({
    url: "http://127.0.0.1:18000",
    content: {
      kind: "application-access",
      mode: "private",
      server: "host",
      localPort: 18000,
      remotePort: 8080,
    },
  });
  mocks.records.mockResolvedValue([saved]);
  expect(await read()).toMatchObject({
    mode: "private",
    reconnectable: true,
    open: true,
    server: "answering",
    routeIdentity: expect.stringContaining(saved.id),
  });
  expect(mocks.privateOpen).toHaveBeenCalledWith("app-1", 8080, 18000);
  expect(mocks.publicOpen).not.toHaveBeenCalled();
  mocks.records.mockResolvedValue([]);
  expect(await read()).toEqual({
    mode: null,
    routeIdentity: null,
    server: "answering",
  });
});

it("preserves the public HTTP check and negative response", async () => {
  mocks.records.mockResolvedValue([
    record({
      url: "https://app.example",
      content: { kind: "application-access", mode: "public", server: "host" },
    }),
  ]);
  expect(await read()).toMatchObject({
    mode: "public",
    open: false,
    server: "answering",
  });
  expect(mocks.publicOpen).toHaveBeenCalledWith("https://app.example");
  expect(mocks.privateOpen).not.toHaveBeenCalled();
});
