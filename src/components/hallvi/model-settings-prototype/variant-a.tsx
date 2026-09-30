"use client";

// PROTOTYPE — A · Model first. The page is a model menu, the way Claude and
// Codex show one: what Hallvi thinks with now, then every model grouped under
// the account that pays for it. Accounts are headers, not sections; choosing a
// model from an account that is not connected is how you connect it.

import { ArrowSquareOut, Check, SpinnerGap } from "@phosphor-icons/react";
import { useState } from "react";

import {
  ACCOUNT,
  BLURBS,
  CHATGPT_FEATURED,
  effortLabel,
  Mark,
  price,
  Toast,
  type ModelSettings,
} from "./shared";

export function VariantA({ s }: { s: ModelSettings }) {
  const [older, setOlder] = useState(false);
  const nothing = !s.connections.chatgpt && !s.connections.openrouter;
  return (
    <div className="msp-a">
      <section className="msp-a-now" aria-label="Current model">
        {s.active ? (
          <>
            <div>
              <span className="msp-eyebrow">Thinking with</span>
              <h2>{s.active.name}</h2>
              <p>
                <Mark
                  account={
                    s.active.providerId === "openrouter"
                      ? "openrouter"
                      : "chatgpt"
                  }
                  size={18}
                />
                {s.active.price
                  ? `OpenRouter · ${price(s.active)} per million tokens`
                  : "ChatGPT · included in your plan"}
              </p>
            </div>
            <div
              className="msp-seg"
              role="radiogroup"
              aria-label="Reasoning effort"
            >
              {s.active.reasoningEfforts
                .filter((level) => level !== "off" && level !== "minimal")
                .map((level) => (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={s.effort === level}
                    onClick={() => s.setEffort(level)}
                  >
                    {effortLabel(level).replace("Extra high", "X-high")}
                  </button>
                ))}
            </div>
          </>
        ) : (
          <div>
            <span className="msp-eyebrow">No model yet</span>
            <h2>Pick what Hallvi thinks with</h2>
            <p>Use your ChatGPT plan, or pay per use through OpenRouter.</p>
          </div>
        )}
      </section>

      {s.groups.map(({ account, models }) => {
        const connected = s.connections[account];
        const flow = s.flow?.account === account ? s.flow : null;
        const shown =
          account === "chatgpt" && !older
            ? models.filter((model) => CHATGPT_FEATURED.includes(model.id))
            : models;
        return (
          <section
            key={account}
            className="msp-a-group"
            data-connected={connected ? "" : undefined}
          >
            <header>
              <Mark account={account} />
              <div>
                <strong>{ACCOUNT[account].name}</strong>
                <span>{ACCOUNT[account].billing}</span>
              </div>
              {connected ? (
                <span className="msp-a-state">
                  <i /> Connected
                  <button type="button" onClick={() => s.disconnect(account)}>
                    Disconnect
                  </button>
                </span>
              ) : flow ? null : (
                <button
                  type="button"
                  className={
                    nothing && account === "chatgpt"
                      ? "msp-btn msp-btn-primary"
                      : "msp-btn"
                  }
                  onClick={() => s.connect(account)}
                >
                  Connect
                </button>
              )}
            </header>
            {flow && (
              <div className="msp-a-flow" role="status">
                {flow.account === "chatgpt" ? (
                  <>
                    <p>Enter this code on ChatGPT, then approve.</p>
                    <code>{flow.code}</code>
                  </>
                ) : (
                  <p>Approve Hallvi on OpenRouter in the tab that opened.</p>
                )}
                <div>
                  <span>
                    <SpinnerGap className="spin" /> Waiting for you…
                  </span>
                  <a href="#" onClick={(event) => event.preventDefault()}>
                    Open {ACCOUNT[account].name} <ArrowSquareOut />
                  </a>
                  <button type="button" onClick={s.cancel}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <ul>
              {shown.map((model) => {
                const on =
                  s.active?.providerId === model.providerId &&
                  s.active.id === model.id;
                return (
                  <li key={model.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        connected
                          ? s.choose(model)
                          : !s.flow && s.connect(account, model)
                      }
                    >
                      <span className="msp-a-check">
                        {on && <Check weight="bold" />}
                      </span>
                      <span className="msp-a-name">
                        {model.name}
                        <small>{BLURBS[model.id] ?? ""}</small>
                      </span>
                      <span className="msp-a-price">
                        {connected ? price(model) : "Connect"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {account === "chatgpt" && models.length > shown.length && (
              <button
                type="button"
                className="msp-a-more"
                onClick={() => setOlder(true)}
              >
                {models.length - shown.length} older models
              </button>
            )}
          </section>
        );
      })}
      <p className="msp-fine">
        Hallvi never switches models by itself. Logins stay on this computer.{" "}
        <a href="#">Storage &amp; privacy</a>
      </p>
      <Toast text={s.saved} />
    </div>
  );
}
