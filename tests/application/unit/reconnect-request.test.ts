import { expect, it } from "vitest";
import {
  reconnectProgress,
  reconnectRequest,
} from "@/components/hallvi/reconnect-request";
import type { ChatMessage } from "@/server/types";
import type { ExecutionRecord } from "@/server/operator-execution";
import { record } from "../fixtures/records";

it("recognizes only reconnect requests and keeps an in-flight request visible when the saved route changes", () => {
  const route = record({
    url: "http://127.0.0.1:18000",
    content: {
      kind: "application-access",
      mode: "private",
      server: "host",
      localPort: 18000,
      remotePort: 8080,
    },
  });
  const message = {
    id: "request",
    chatId: "main",
    role: "user",
    body: reconnectRequest(route),
    status: "waiting",
  } as ChatMessage;
  expect(
    reconnectProgress(
      [{ ...message, body: "Explain this app" }],
      [],
      undefined,
    ),
  ).toBeNull();
  expect(
    reconnectProgress([message], [], { ...route, updatedAt: "changed" }),
  ).toMatchObject({ active: true });
  const reply = {
    id: "reply",
    responseTo: message.id,
    role: "assistant",
    status: "completed",
    finishedAt: "now",
  } as ChatMessage;
  expect(
    reconnectProgress([message, reply], [], { ...route, updatedAt: "changed" }),
  ).toBeNull();
});

it("an HTTP observation must belong to the requested saved route", () => {
  const route = record({ url: "http://127.0.0.1:18000" });
  const request = {
    id: "request",
    role: "user",
    body: reconnectRequest(route),
    status: "delivered",
  } as ChatMessage;
  const reply = {
    id: "reply",
    responseTo: request.id,
    role: "assistant",
    finishedAt: "now",
    blocks: [{ type: "execution", id: "call" }],
  } as ChatMessage;
  const result = {
    accessRecordId: route.id,
    url: route.presentation!.url,
    httpStatus: 503,
    checkedAt: new Date().toISOString(),
  };
  const call = {
    id: "call",
    tool: "open_server_port",
    status: "succeeded",
    output: JSON.stringify(result),
  } as ExecutionRecord;
  expect(reconnectProgress([request, reply], [call], route)?.text).toContain(
    "Controller HTTP 503",
  );
  call.output = JSON.stringify({ ...result, accessRecordId: "another-route" });
  expect(
    reconnectProgress([request, reply], [call], route)?.text,
  ).not.toContain("HTTP");
});
