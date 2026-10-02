import { expect, it } from "vitest";

import { mergeOperatorMetadata } from "../../../src/components/hallvi/operator-shell";
import type { OperatorMetadata, OperatorView } from "../../../src/server/types";

it("leaves unchanged polls alone and applies changed facts without replacing the conversation", () => {
  const metadata: OperatorMetadata = {
    application: {
      id: "app-one",
      name: "Notes",
      repositoryOwner: "qa",
      repositoryName: "notes",
      repositoryUrl: "https://github.com/qa/notes",
      createdAt: "2026-10-02T09:00:00Z",
      updatedAt: "2026-10-02T09:00:00Z",
    },
    chats: [],
    selectedChatId: null,
    secrets: [],
  };
  const current: OperatorView = {
    ...metadata,
    messages: [],
    information: [],
    executions: [],
  };
  expect(mergeOperatorMetadata(current, structuredClone(metadata))).toBe(
    current,
  );

  const changed = mergeOperatorMetadata(current, {
    ...structuredClone(metadata),
    application: { ...metadata.application!, name: "My notes" },
  });
  expect(changed.application?.name).toBe("My notes");
  expect(changed.chats).toBe(current.chats);
  expect(changed.messages).toBe(current.messages);
  expect(changed.information).toBe(current.information);
  expect(changed.executions).toBe(current.executions);
  expect(
    mergeOperatorMetadata(changed, { ...metadata, secrets: undefined }).secrets,
  ).toBeUndefined();
});
