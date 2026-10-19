import { randomUUID } from "node:crypto";
import type { Transcript } from "../../src/server/pi-transcript";
import { test, expect } from "./fixtures";
import { exchange, scriptWorker } from "./scripted-worker";

test.use({ scriptedWorker: true });

for (const width of [1440, 390]) {
  test(`a message link already drawn on opening stays in view at ${width}px`, async ({
    page,
    fixture,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const response = await page.request.post("/api/applications", {
      data: {
        requestKey: randomUUID(),
        repositoryUrl: `https://github.com/qa/message-links-${width}`,
      },
    });
    expect(response.ok()).toBe(true);
    const created = await response.json();
    const app = created.application.id as string;
    const chat = created.selectedChatId as string;
    // Sixteen messages: all are present on the first draw, so the link runs
    // during mounting rather than after the incremental history fill.
    const transcript: Transcript = {
      status: "idle",
      calls: {},
      said: [],
      messages: Array.from({ length: 8 }, (_, turn) => {
        const { messages } = exchange(chat, `Check stage ${turn}.`, {
          body: `Recorded stage ${turn}. ${"This is the saved observation for this stage. ".repeat(12)}`,
          status: "completed",
        });
        return messages.map((message) => ({
          ...message,
          id: `${message.role === "user" ? "asked" : "reply"}:${turn}`,
          ...(message.role === "user"
            ? { requestKey: `asked:${turn}` }
            : { responseTo: `asked:${turn}` }),
        }));
      }).flat(),
    };
    const worker = await scriptWorker(fixture, () => transcript);
    try {
      await page.goto(`/applications/${app}?message=reply:0`);
      const linked = page.locator('[id="hv-message-reply:0"]');
      await expect(linked).toBeAttached();
      // Observe beyond mounting: the bug jumped correctly, then the replayed
      // initial-position effect silently carried the reader to the latest.
      await page.waitForTimeout(1000);
      await expect(linked).toBeInViewport();
      await page.reload();
      await page.waitForTimeout(1000);
      await expect(linked).toBeInViewport();
      await page
        .getByRole("button", { name: "Scroll to the latest message" })
        .click();
      await expect(page.locator('[id="hv-message-reply:7"]')).toBeInViewport();
    } finally {
      await worker();
    }
  });
}
