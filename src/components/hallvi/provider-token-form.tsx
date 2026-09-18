"use client";

import { useState } from "react";

import s from "./pi-setup-screen.module.css";

/**
 * One provider credential, typed on the Connections page and posted straight
 * to the controller.
 *
 * The token lives in a password field and a same-origin JSON body, and
 * nowhere else: not in the address bar, not in a conversation, not in a log.
 * What comes back is whether the provider accepted it, and the provider's own
 * words when it did not.
 */
export function ProviderTokenForm({
  provider,
  onConnected,
  onCancel,
}: {
  provider: "hetzner" | "cloudflare";
  onConnected: () => void;
  onCancel: () => void;
}) {
  const [token, setToken] = useState("");
  const [account, setAccount] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const hetzner = provider === "hetzner";
  return (
    <form
      className={s.connectForm}
      aria-label={hetzner ? "Connect Hetzner Cloud" : "Connect Cloudflare"}
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
          const response = await fetch(`/api/setup/${provider}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              hetzner
                ? { token }
                : {
                    token,
                    ...(account.trim() ? { accountId: account.trim() } : {}),
                  },
            ),
          });
          const result = await response.json().catch(() => null);
          if (!response.ok)
            throw new Error(
              result?.error ?? "The provider refused this token.",
            );
          setToken("");
          setAccount("");
          onConnected();
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not reach the provider. Try again.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className={s.hint}>
        {hetzner
          ? "A Hetzner Cloud API token with Read & Write, made in the project the servers belong to (Hetzner Console: Security, then API tokens). It reaches everything in that project and nothing outside it. It is checked against Hetzner before it is saved in a file on this computer that only your user account can read; it is not encrypted there, the AI model never sees it, and Hallvi's own encrypted backup includes it once backup storage is connected. When a conversation needs a server, it guides this step and also proves the token can write."
          : "A Cloudflare API token that may read zones and edit DNS, and manage R2 if Hallvi should list or create buckets. Cloudflare is asked whether it is active before it is saved, in a file on this computer that only your user account can read, unencrypted; the AI model never sees it. Pointing a domain needs only DNS edit and zone read for that zone, and the conversation guides that token when a domain needs it. Writing backups into a bucket is a separate credential below."}
      </p>
      <label>
        {hetzner ? "Hetzner Cloud API token" : "Cloudflare API token"}
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>
      {!hetzner && (
        <label>
          Account id (optional)
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={account}
            onChange={(event) => setAccount(event.target.value)}
          />
        </label>
      )}
      {!hetzner && (
        <p className={s.hint}>
          R2 is addressed per account. Leave this empty and Hallvi asks
          Cloudflare for it; fill it in if the account list is not in the
          token&rsquo;s scope.
        </p>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <div className={s.connectActions}>
        <button className={s.primary} type="submit" disabled={saving || !token}>
          {saving ? "Checking with the provider…" : "Connect"}
        </button>
        <button
          className={s.textButton}
          type="button"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
