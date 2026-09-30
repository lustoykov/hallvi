"use client";

// PROTOTYPE — throwaway. Three directions for Settings → Model, switchable with
// ?variant=A|B|C on /setup/pi (?variant=current shows today's page). Real
// catalog and real header; sign-ins are simulated in memory, nothing is saved.

import { useEffect, useRef, useState } from "react";

import type { PiModelOption } from "@/server/pi-models";
import type { PiSetupStatus } from "@/server/pi-setup";

export type Account = "chatgpt" | "openrouter";
export type Flow =
  | { account: "chatgpt"; code: string; step: "waiting" }
  | { account: "openrouter"; step: "waiting" }
  | null;

/** One line on what each model is for; the catalog has only names. */
export const BLURBS: Record<string, string> = {
  "gpt-6-sol": "The everyday default. Strong at code and servers.",
  "gpt-6-astra": "Most capable. Slower; uses more of your plan.",
  "gpt-6-luna": "Fastest and lightest on your plan.",
  "gpt-5.6-sol": "Previous generation.",
  "gpt-5.6-terra": "Previous generation, balanced.",
  "gpt-5.6-luna": "Previous generation, fast.",
  "gpt-5.5": "Older.",
  "gpt-5.3-codex-spark": "Older, code only.",
  "anthropic/claude-sonnet-5": "Careful and thorough. A great default.",
  "anthropic/claude-opus-5.5": "Anthropic’s strongest. For hard problems.",
  "openai/gpt-6-sol": "ChatGPT’s default model, without a plan.",
  "google/gemini-3.1-pro-preview": "Huge context. Good at reading big repos.",
  "qwen/qwen3.8-max-0902": "Frontier quality at a third of the price.",
  "z-ai/glm-5.3": "Capable and very cheap.",
  "deepseek/deepseek-v4-pro-0813": "The cheapest strong option.",
};

/** ChatGPT's catalog includes older models; these lead, the rest fold away. */
export const CHATGPT_FEATURED = ["gpt-6-sol", "gpt-6-astra", "gpt-6-luna"];

export const ACCOUNT = {
  chatgpt: {
    name: "ChatGPT",
    mark: "C",
    billing: "Included in your ChatGPT plan",
    short: "Your plan",
    how: "Sign in with a short code on ChatGPT’s page.",
  },
  openrouter: {
    name: "OpenRouter",
    mark: "O",
    billing: "Pay per use from OpenRouter credit",
    short: "Pay per use",
    how: "Approve Hallvi on OpenRouter; set a spending limit there.",
  },
} as const;

export const accountOf = (model: PiModelOption): Account =>
  model.providerId === "openrouter" ? "openrouter" : "chatgpt";

export const price = (model: PiModelOption) =>
  model.price
    ? `$${fmt(model.price.input)} / $${fmt(model.price.output)}`
    : "In plan";
const fmt = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

export const effortLabel = (effort: string) =>
  effort === "xhigh"
    ? "Extra high"
    : effort.charAt(0).toUpperCase() + effort.slice(1);

export type Connections = Record<Account, boolean>;

/** The in-memory stand-in for the setup API. */
export function useModelSettings(status: PiSetupStatus, initial: Connections) {
  const [connections, setConnections] = useState<Connections>(initial);
  const [flow, setFlow] = useState<Flow>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const first = (account: Account) =>
    status.models.find(
      (model) =>
        accountOf(model) === account &&
        (account === "openrouter" || model.id === CHATGPT_FEATURED[0]),
    )!;
  const [active, setActive] = useState<PiModelOption | null>(() =>
    initial.openrouter
      ? first("openrouter")
      : initial.chatgpt
        ? first("chatgpt")
        : null,
  );
  const [effort, setEffort] = useState("high");
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  function note(text: string) {
    setSaved(text);
    window.setTimeout(
      () => setSaved((now) => (now === text ? null : now)),
      2600,
    );
  }
  function choose(model: PiModelOption) {
    if (!connections[accountOf(model)]) return;
    setActive(model);
    if (!model.reasoningEfforts.includes(effort as never))
      setEffort(
        model.reasoningEfforts.includes("high" as never)
          ? "high"
          : model.reasoningEfforts[0]!,
      );
    note(`Saved · the next message uses ${model.name}`);
  }
  function connect(account: Account, then?: PiModelOption) {
    setFlow(
      account === "chatgpt"
        ? { account, code: "HVL-7Q2K", step: "waiting" }
        : { account, step: "waiting" },
    );
    // Stands in for approving on the provider's page.
    timer.current = window.setTimeout(() => {
      setFlow(null);
      setConnections((now) => ({ ...now, [account]: true }));
      const model = then ?? first(account);
      if (account === "openrouter" || !active || then) {
        setActive(model);
        note(`${ACCOUNT[account].name} connected · using ${model.name}`);
      } else note(`${ACCOUNT[account].name} connected`);
    }, 2600);
  }
  function cancel() {
    if (timer.current) window.clearTimeout(timer.current);
    setFlow(null);
  }
  function disconnect(account: Account) {
    const other: Account = account === "chatgpt" ? "openrouter" : "chatgpt";
    setConnections((now) => ({ ...now, [account]: false }));
    if (active && accountOf(active) === account)
      setActive(connections[other] ? first(other) : null);
    note(`${ACCOUNT[account].name} disconnected`);
  }
  // ChatGPT's featured models lead, in their own order; OpenRouter's list is
  // already curated.
  const rank = (id: string) => {
    const at = CHATGPT_FEATURED.indexOf(id);
    return at < 0 ? 99 : at;
  };
  const groups = (["chatgpt", "openrouter"] as const).map((account) => ({
    account,
    models: status.models
      .filter((model) => accountOf(model) === account)
      .sort((a, b) => (account === "chatgpt" ? rank(a.id) - rank(b.id) : 0)),
  }));
  return {
    connections,
    active,
    effort,
    setEffort: (value: string) => {
      setEffort(value);
      note(`Saved · ${effortLabel(value)} effort`);
    },
    flow,
    saved,
    groups,
    choose,
    connect,
    cancel,
    disconnect,
  };
}
export type ModelSettings = ReturnType<typeof useModelSettings>;

export function Mark({
  account,
  size = 28,
}: {
  account: Account;
  size?: number;
}) {
  return (
    <span
      className="msp-mark"
      data-account={account}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
      aria-hidden="true"
    >
      {ACCOUNT[account].mark}
    </span>
  );
}

/** The quiet confirmation Claude and Codex show after a setting applies. */
export function Toast({ text }: { text: string | null }) {
  return (
    <div className="msp-toast" data-show={text ? "" : undefined} role="status">
      {text}
    </div>
  );
}
