"use client";

// PROTOTYPE — B · Two doors. The two ways to pay for a model stand side by
// side as raised cards, so the choice between a plan and pay-per-use is the
// first thing read. Each card holds its own sign-in and its own model; the
// active one is lifted and says so, and a line under both says what the next
// message will use.

import { ArrowSquareOut, SpinnerGap } from "@phosphor-icons/react";
import { useState } from "react";

import type { PiModelOption } from "@/server/pi-models";

import {
  ACCOUNT,
  accountOf,
  BLURBS,
  CHATGPT_FEATURED,
  effortLabel,
  Mark,
  price,
  Toast,
  type Account,
  type ModelSettings,
} from "./shared";

const PREVIEW: Record<Account, string[]> = {
  chatgpt: ["GPT-6 Sol", "GPT-6 Astra", "GPT-6 Luna"],
  openrouter: ["Claude Sonnet 5", "Claude Opus 5.5", "Gemini 3.1 Pro", "+4"],
};

export function VariantB({ s }: { s: ModelSettings }) {
  // Each card remembers its own pick, so switching back restores it.
  const [picked, setPicked] = useState<Partial<Record<Account, PiModelOption>>>(
    {},
  );
  const activeAccount = s.active ? accountOf(s.active) : null;

  return (
    <div className="msp-b">
      <div className="msp-b-grid">
        {s.groups.map(({ account, models }) => {
          const connected = s.connections[account];
          const active = activeAccount === account;
          const flow = s.flow?.account === account ? s.flow : null;
          const current =
            (active ? s.active : picked[account]) ??
            models.find((model) => CHATGPT_FEATURED.includes(model.id)) ??
            models[0]!;
          const listed =
            account === "chatgpt"
              ? models.filter((model) => CHATGPT_FEATURED.includes(model.id))
              : models;
          return (
            <article
              key={account}
              className="msp-b-card"
              data-active={active ? "" : undefined}
              data-connected={connected ? "" : undefined}
            >
              <header>
                <Mark account={account} size={36} />
                <div>
                  <h3>{ACCOUNT[account].name}</h3>
                  <span>{ACCOUNT[account].short}</span>
                </div>
                {active ? (
                  <span className="msp-chip msp-chip-active">In use</span>
                ) : connected ? (
                  <span className="msp-chip">Connected</span>
                ) : null}
              </header>

              {flow ? (
                <div className="msp-b-flow" role="status">
                  {flow.account === "chatgpt" ? (
                    <>
                      <span>Enter on ChatGPT</span>
                      <code>{flow.code}</code>
                    </>
                  ) : (
                    <span>Approve Hallvi on OpenRouter</span>
                  )}
                  <p>
                    <SpinnerGap className="spin" /> Waiting for you…
                  </p>
                  <div>
                    <a href="#" onClick={(event) => event.preventDefault()}>
                      Open {ACCOUNT[account].name} <ArrowSquareOut />
                    </a>
                    <button type="button" onClick={s.cancel}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : connected ? (
                <div className="msp-b-body">
                  <label>
                    Model
                    <select
                      value={current.id}
                      onChange={(event) => {
                        const next = models.find(
                          (model) => model.id === event.target.value,
                        )!;
                        setPicked((now) => ({ ...now, [account]: next }));
                        if (active) s.choose(next);
                      }}
                    >
                      {listed.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                          {model.price ? ` — ${price(model)}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="msp-b-blurb">{BLURBS[current.id]}</p>
                  {active ? (
                    <label>
                      Reasoning
                      <select
                        value={s.effort}
                        onChange={(event) => s.setEffort(event.target.value)}
                      >
                        {current.reasoningEfforts.map((level) => (
                          <option key={level} value={level}>
                            {effortLabel(level)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <button
                      type="button"
                      className="msp-btn"
                      onClick={() => s.choose(current)}
                    >
                      Use {ACCOUNT[account].name} instead
                    </button>
                  )}
                </div>
              ) : (
                <div className="msp-b-body">
                  <ul className="msp-b-preview">
                    {PREVIEW[account].map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                  <p className="msp-b-blurb">{ACCOUNT[account].how}</p>
                  <button
                    type="button"
                    className={
                      !s.connections.chatgpt &&
                      !s.connections.openrouter &&
                      account === "chatgpt"
                        ? "msp-btn msp-btn-primary"
                        : "msp-btn"
                    }
                    onClick={() => s.connect(account)}
                  >
                    Connect {ACCOUNT[account].name}
                  </button>
                </div>
              )}

              <footer>
                <span>{ACCOUNT[account].billing}</span>
                {connected && (
                  <button type="button" onClick={() => s.disconnect(account)}>
                    Disconnect
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
      <p className="msp-b-next" aria-live="polite">
        {s.active ? (
          <>
            Next message: <b>{s.active.name}</b> through{" "}
            {ACCOUNT[accountOf(s.active)].name} · {effortLabel(s.effort)} effort
          </>
        ) : (
          "Connect either account and Hallvi can start."
        )}
      </p>
      <p className="msp-fine">
        Logins stay on this computer. <a href="#">Storage &amp; privacy</a>
      </p>
      <Toast text={s.saved} />
    </div>
  );
}
