"use client";

// PROTOTYPE — C · Settings list. Codex/System Settings density: grouped inset
// rows, one control each. The model is a single row whose value opens a menu;
// accounts are two rows with Sign in / Sign out; sign-in happens in a sheet so
// the list never reflows.

import {
  ArrowSquareOut,
  CaretDown,
  Check,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import {
  ACCOUNT,
  accountOf,
  BLURBS,
  CHATGPT_FEATURED,
  effortLabel,
  Mark,
  price,
  Toast,
  type ModelSettings,
} from "./shared";

export function VariantC({ s }: { s: ModelSettings }) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const efforts =
    s.active?.reasoningEfforts.filter(
      (level) => level !== "off" && level !== "minimal",
    ) ?? [];

  return (
    <div className="msp-c">
      <h2 className="msp-c-title">Model</h2>
      <div className="msp-c-list">
        <div className="msp-c-row">
          <div>
            <strong>Model</strong>
            <span>
              {s.active
                ? BLURBS[s.active.id]
                : "Sign in to an account below first."}
            </span>
          </div>
          <div className="msp-c-menuwrap" ref={menuRef}>
            <button
              type="button"
              className="msp-c-value"
              disabled={!s.active}
              aria-expanded={menu}
              onClick={() => setMenu((open) => !open)}
            >
              {s.active?.name ?? "None"} <CaretDown weight="bold" />
            </button>
            {menu && (
              <div className="msp-c-menu" role="menu">
                {s.groups.map(({ account, models }) => (
                  <div
                    key={account}
                    role="group"
                    aria-label={ACCOUNT[account].name}
                  >
                    <div className="msp-c-menuhead">
                      <Mark account={account} size={16} />{" "}
                      {ACCOUNT[account].name}
                      <span>{ACCOUNT[account].short}</span>
                    </div>
                    {(account === "chatgpt"
                      ? models.filter((model) =>
                          CHATGPT_FEATURED.includes(model.id),
                        )
                      : models
                    ).map((model) => {
                      const on =
                        s.active?.providerId === model.providerId &&
                        s.active.id === model.id;
                      const usable = s.connections[account];
                      return (
                        <button
                          key={model.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={on}
                          disabled={!usable}
                          onClick={() => {
                            s.choose(model);
                            setMenu(false);
                          }}
                        >
                          <span>
                            {model.name}
                            <small>
                              {usable
                                ? BLURBS[model.id]
                                : `Sign in to ${ACCOUNT[account].name} to use`}
                            </small>
                          </span>
                          <em>{model.price ? price(model) : ""}</em>
                          <i>{on && <Check weight="bold" />}</i>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="msp-c-row">
          <div>
            <strong>Reasoning</strong>
            <span>More thinking, longer waits.</span>
          </div>
          <div
            className="msp-seg msp-seg-small"
            role="radiogroup"
            aria-label="Reasoning effort"
          >
            {efforts.map((level) => (
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
            {!efforts.length && <span className="msp-c-muted">—</span>}
          </div>
        </div>
        <div className="msp-c-row">
          <div>
            <strong>Paid by</strong>
            <span>What a message costs you.</span>
          </div>
          <span className="msp-c-muted">
            {s.active
              ? accountOf(s.active) === "chatgpt"
                ? "Your ChatGPT plan"
                : `OpenRouter credit · ${price(s.active)} per M tokens`
              : "—"}
          </span>
        </div>
      </div>

      <h2 className="msp-c-title">Accounts</h2>
      <div className="msp-c-list">
        {(["chatgpt", "openrouter"] as const).map((account) => (
          <div key={account} className="msp-c-row">
            <div className="msp-c-account">
              <Mark account={account} size={30} />
              <div>
                <strong>{ACCOUNT[account].name}</strong>
                <span>
                  {s.connections[account] ? (
                    <>
                      <i className="msp-dot" /> Signed in ·{" "}
                      {ACCOUNT[account].short.toLowerCase()}
                    </>
                  ) : (
                    ACCOUNT[account].billing
                  )}
                </span>
              </div>
            </div>
            {s.connections[account] ? (
              <button
                type="button"
                className="msp-link"
                onClick={() => s.disconnect(account)}
              >
                Sign out
              </button>
            ) : (
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
                Sign in
              </button>
            )}
          </div>
        ))}
      </div>

      <h2 className="msp-c-title">Privacy</h2>
      <div className="msp-c-list">
        <div className="msp-c-row">
          <div>
            <strong>Where logins live</strong>
            <span>On this computer, readable only by your user.</span>
          </div>
          <a href="#" className="msp-link">
            Details
          </a>
        </div>
      </div>

      {s.flow && (
        <div
          className="msp-c-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={`Sign in to ${ACCOUNT[s.flow.account].name}`}
        >
          <div>
            <button
              type="button"
              className="msp-c-close"
              aria-label="Cancel"
              onClick={s.cancel}
            >
              <X />
            </button>
            <Mark account={s.flow.account} size={40} />
            <h3>Sign in to {ACCOUNT[s.flow.account].name}</h3>
            {s.flow.account === "chatgpt" ? (
              <>
                <p>Enter this code on ChatGPT’s page, then approve.</p>
                <code>{s.flow.code}</code>
              </>
            ) : (
              <p>
                Approve Hallvi on OpenRouter. You can set a spending limit
                there.
              </p>
            )}
            <a
              className="msp-btn msp-btn-primary"
              href="#"
              onClick={(event) => event.preventDefault()}
            >
              Open {ACCOUNT[s.flow.account].name} <ArrowSquareOut />
            </a>
            <p className="msp-c-wait">
              <SpinnerGap className="spin" /> Waiting for you…
            </p>
          </div>
        </div>
      )}
      <Toast text={s.saved} />
    </div>
  );
}
