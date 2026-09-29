// Where connecting ChatGPT sends the reader afterwards.
//
// The composer that cannot take a message points at Settings, and until this
// change nothing carried the reader home: they finished connecting and landed
// on the applications list, holding a half-typed question about one
// particular application. What this protects is that the way back is built
// from records rather than from whatever the query string says, so no address
// typed into that link can become a redirect off this controller.

import { beforeEach, describe, expect, it, vi } from "vitest";

const records = vi.hoisted(() => ({
  getApplication: vi.fn(),
  getChat: vi.fn(),
}));
vi.mock("../../../src/server/db", () => records);

import { setupReturnDestination } from "../../../src/server/setup-return";

const APPLICATION = "11111111-1111-4111-8111-111111111111";
const CHAT = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  records.getApplication.mockReset();
  records.getChat.mockReset();
  records.getApplication.mockReturnValue({ id: APPLICATION, name: "My app" });
  records.getChat.mockReturnValue({
    id: CHAT,
    applicationId: APPLICATION,
    kind: "main",
    archivedAt: null,
  });
});

describe("the way back from setup", () => {
  it("returns to the exact conversation", async () => {
    expect(
      await setupReturnDestination({ application: APPLICATION, chat: CHAT }),
    ).toEqual({
      href: `/applications/${APPLICATION}?chat=${CHAT}`,
      label: "Back to the conversation",
      query: `?application=${APPLICATION}&chat=${CHAT}`,
    });
  });

  it("refuses a chat that belongs to another application", async () => {
    records.getChat.mockReturnValue({ id: CHAT, applicationId: "elsewhere" });
    expect(
      await setupReturnDestination({ application: APPLICATION, chat: CHAT }),
    ).toBeNull();
  });

  it("refuses a conversation that is not there", async () => {
    records.getChat.mockReturnValue(null);
    expect(
      await setupReturnDestination({ application: APPLICATION, chat: CHAT }),
    ).toBeNull();
    records.getApplication.mockReturnValue(null);
    records.getChat.mockReturnValue({ id: CHAT, applicationId: APPLICATION });
    expect(
      await setupReturnDestination({ application: APPLICATION, chat: CHAT }),
    ).toBeNull();
  });

  it("never takes a destination from the link itself", async () => {
    for (const application of [
      "https://example.invalid/",
      "//example.invalid",
      "../../setup/github",
      "",
      [APPLICATION, APPLICATION],
    ])
      expect(
        await setupReturnDestination({ application, chat: CHAT }),
      ).toBeNull();
    // Nothing is even looked up for an id that is not an id.
    expect(records.getApplication).not.toHaveBeenCalled();
    expect(await setupReturnDestination({ chat: CHAT })).toBeNull();
    expect(
      await setupReturnDestination({ application: APPLICATION }),
    ).toBeNull();
  });
});
