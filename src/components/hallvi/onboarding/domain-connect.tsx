"use client";

// Giving a working application a name.
//
// It starts from the name, not from an account. Public DNS says who runs the
// domain without any credential, and that decides what is asked next: a
// domain at Cloudflare can have its record written by Hallvi with a token for
// that one zone; a domain anywhere else needs one record the owner adds by
// hand, which Hallvi watches for. Neither path mentions R2, backups or an
// account id, because pointing a name at a server needs none of them.

import { useEffect, useRef, useState } from "react";

import {
  Away,
  CheckList,
  CopyLine,
  Guide,
  ModeLine,
  Problem,
  Receipt,
  RequestCard,
  SecretPaste,
  useStagedChecks,
} from "./pieces";
import { CloudflareTokenSketch } from "./sketches";
import type {
  Check,
  CloudflareOutcome,
  DnsHost,
  OnboardingTransport,
  PermissionMode,
} from "./types";

/** Cloudflare's documented template link: DNS edit and zone read, named. */
export const CLOUDFLARE_TEMPLATE = `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encodeURIComponent(
  JSON.stringify([
    { key: "dns", type: "edit" },
    { key: "zone", type: "read" },
  ]),
)}&name=${encodeURIComponent("Hallvi DNS")}`;

export function recogniseCloudflare(value: string) {
  if (/^cfk_/.test(value) || /^[a-f0-9]{37,45}$/.test(value))
    return {
      ok: false,
      hint: "That looks like the Global API Key, which controls your whole Cloudflare account. Hallvi does not take it. Make an API token with the link above instead.",
    };
  if (/^[a-f0-9]{64}$/.test(value))
    return {
      ok: false,
      hint: "That looks like an R2 storage secret. Pointing a domain needs an API token, made with the link above.",
    };
  if (/^cfat_/.test(value))
    return {
      ok: true,
      hint: "An account API token. Hallvi will check it can see your zone.",
    };
  if (/^cfut_/.test(value) || /^[A-Za-z0-9_-]{40}$/.test(value))
    return { ok: true, hint: "Looks like a Cloudflare API token." };
  return {
    ok: false,
    hint: "This does not look like a Cloudflare API token. It may have been cut off while copying.",
  };
}

const PLAN: Check[] = [
  { id: "reach", label: "Reach Cloudflare", state: "pending" },
  {
    id: "active",
    label: "Cloudflare says the token is active",
    state: "pending",
  },
  { id: "zone", label: "The token can see your domain", state: "pending" },
  { id: "edit", label: "The token can edit DNS", state: "pending" },
];

function settle(outcome: CloudflareOutcome, zone: string): Check[] {
  if (outcome.kind === "unreachable")
    return [{ ...PLAN[0]!, state: "failed", detail: "No answer came back." }];
  const reached: Check = { ...PLAN[0]!, state: "passed" };
  if (outcome.kind === "rejected")
    return [reached, { ...PLAN[1]!, state: "failed" }];
  const active: Check = { ...PLAN[1]!, state: "passed" };
  if (outcome.kind === "zone-hidden")
    return [reached, active, { ...PLAN[2]!, state: "failed" }];
  const sees: Check = { ...PLAN[2]!, state: "passed", detail: zone };
  if (outcome.kind === "cannot-edit")
    return [reached, active, sees, { ...PLAN[3]!, state: "failed" }];
  return [
    reached,
    active,
    sees,
    outcome.edit === "reported"
      ? {
          ...PLAN[3]!,
          state: "passed",
          detail: "Cloudflare lists DNS edit for this token in that zone.",
        }
      : {
          ...PLAN[3]!,
          state: "unproven",
          detail:
            "Cloudflare did not list this token’s permissions. It is proven when Hallvi writes your record.",
        },
  ];
}

export interface DomainProgress {
  name: string;
  host: DnsHost | null;
  way: "cloudflare" | "manual" | null;
  guideAt: number;
}

export function DomainConnect({
  application,
  serverAddress,
  transport,
  mode,
  progress,
  onProgress,
  done,
  onReady,
  onCancel,
}: {
  application: string;
  serverAddress: string;
  transport: OnboardingTransport;
  mode: PermissionMode;
  progress: DomainProgress;
  onProgress: (progress: DomainProgress) => void;
  /** The name now serves the application; set by the conversation. */
  done: boolean;
  /** Access or the record is in place: Hallvi can carry on. */
  onReady: (via: "cloudflare" | "manual") => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(progress.name);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CloudflareOutcome | null>(null);
  // A Cloudflare connection made earlier that already covers this zone.
  const [existing, setExisting] = useState<"reported" | "unknown" | null>(null);
  const staged = useStagedChecks();
  const { name, host, way } = progress;
  const zone =
    host && "zone" in host ? host.zone : name.split(".").slice(-2).join(".");
  const label = name === zone ? "@" : name.slice(0, -zone.length - 1);

  if (done)
    return (
      <RequestCard
        asks="has the domain ready"
        state="done"
        label="Domain ready"
      >
        <Receipt
          title={
            way === "cloudflare"
              ? `Cloudflare connected for ${zone}`
              : `${name} points at ${serverAddress} · added by you`
          }
        >
          <p className="hv-ob-fine">
            {way === "cloudflare"
              ? "The token is saved in a file on this computer that only your user account can read, unencrypted; the AI model never sees it. It reaches only the zones you chose on Cloudflare. Delete it under My Profile › API Tokens to withdraw access."
              : "Hallvi holds no access to your DNS. If the server’s address ever changes, the record is yours to update."}
          </p>
        </Receipt>
      </RequestCard>
    );

  const lookup = async () => {
    const wanted = draft
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(wanted)) return;
    setLooking(true);
    const found = await transport.whoHostsDns(wanted);
    const held =
      found.kind === "cloudflare"
        ? await transport.existingCloudflare(found.zone)
        : null;
    setExisting(held?.kind === "connected" ? held.edit : null);
    setLooking(false);
    onProgress({
      name: wanted,
      host: found,
      way:
        found.kind === "other"
          ? "manual"
          : found.kind === "cloudflare"
            ? "cloudflare"
            : null,
      guideAt: 0,
    });
  };

  const submit = async (token: string) => {
    setBusy(true);
    setOutcome(null);
    const result = await transport.checkCloudflare(token, zone);
    await staged.play(PLAN, settle(result, zone));
    setOutcome(result);
    setBusy(false);
    if (result.kind === "connected") {
      onReady("cloudflare");
      return true;
    }
    return result.kind !== "unreachable";
  };

  return (
    <RequestCard
      asks="can give it a name"
      state="waiting"
      label={`A domain for ${application}`}
    >
      <p className="hv-ob-said">
        {application} keeps working at its current address the whole time. Which
        name should open it?
      </p>
      <form
        className="hv-ob-name"
        onSubmit={(event) => {
          event.preventDefault();
          void lookup();
        }}
      >
        <input
          type="text"
          inputMode="url"
          spellCheck={false}
          autoComplete="off"
          aria-label="Domain name"
          placeholder="status.example.com"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={looking || !draft.trim()}>
          {looking ? "Looking it up…" : host ? "Look up again" : "Look it up"}
        </button>
        <button type="button" className="hv-ob-quiet" onClick={onCancel}>
          Not now
        </button>
      </form>
      <p className="hv-ob-fine">
        No domain yet? Buy one from any registrar first; this can wait, and the
        current address keeps working.
      </p>

      {host?.kind === "unreachable" && (
        <Problem title="Public DNS could not be asked from this computer">
          <p>
            That says nothing about {name}. Check the internet connection and
            look it up again.
          </p>
        </Problem>
      )}
      {host?.kind === "unregistered" && (
        <Problem title={`Nobody answers for ${zone}`}>
          <p>
            Public DNS has no name servers for it, which usually means a typo or
            a domain that is not registered yet. Check the spelling.
          </p>
        </Problem>
      )}

      {(host?.kind === "cloudflare" || host?.kind === "other") && (
        <>
          <p className="hv-ob-found">
            {host.kind === "cloudflare" ? (
              <>
                <b>{zone}</b> has its DNS at <b>Cloudflare</b>, so Hallvi can
                add the record for you.
              </>
            ) : (
              <>
                <b>{zone}</b> has its DNS at{" "}
                <b>{host.who ?? host.nameservers[0]}</b>. Hallvi cannot sign in
                there, so you add one record and Hallvi does the rest.
              </>
            )}
          </p>
          {host.kind === "cloudflare" && (
            <div
              className="hv-ob-switch"
              role="tablist"
              aria-label="Who adds the record"
            >
              <button
                role="tab"
                type="button"
                aria-selected={way === "cloudflare"}
                onClick={() => onProgress({ ...progress, way: "cloudflare" })}
              >
                Hallvi adds it
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={way === "manual"}
                onClick={() => onProgress({ ...progress, way: "manual" })}
              >
                I&rsquo;ll add it myself
              </button>
            </div>
          )}
        </>
      )}

      {host && way === "manual" && (
        <ManualRecord
          name={name}
          label={label}
          zone={zone}
          address={serverAddress}
          transport={transport}
          onFound={() => onReady("manual")}
        />
      )}

      {host?.kind === "cloudflare" && way === "cloudflare" && existing && (
        <div className="hv-ob-path">
          <p className="hv-ob-lede">
            Cloudflare is already connected here, and{" "}
            {existing === "reported"
              ? "Cloudflare lists DNS edit for that connection in "
              : "that connection can see "}
            <b>{zone}</b>. No new token is needed.
          </p>
          <ModeLine mode={mode} action="change your DNS" />
          <button
            type="button"
            className="hv-ob-primary"
            onClick={() => onReady("cloudflare")}
          >
            Let Hallvi add the record
          </button>
        </div>
      )}
      {host?.kind === "cloudflare" && way === "cloudflare" && !existing && (
        <div className="hv-ob-path">
          <div className="hv-ob-grant">
            <h4>What you are giving Hallvi</h4>
            <p>
              A Cloudflare token that can <b>read and edit DNS records</b> in
              the zones you pick, and nothing else: not your account, billing,
              other zones or storage. You choose the zone on Cloudflare&rsquo;s
              page; choose only <b>{zone}</b>.
            </p>
            <ModeLine mode={mode} action="change your DNS" />
          </div>
          <Guide
            at={progress.guideAt}
            onAt={(guideAt) => onProgress({ ...progress, guideAt })}
            steps={[
              {
                title: "Open Cloudflare with the permissions filled in",
                body: (
                  <>
                    <Away href={CLOUDFLARE_TEMPLATE}>
                      Create the token on Cloudflare
                    </Away>
                    <p>
                      It opens in a new tab, signed in as you. The link only
                      pre-fills a form; nothing is created until you press
                      Create Token there.
                    </p>
                  </>
                ),
              },
              {
                title: `Limit it to ${zone} and create it`,
                body: (
                  <>
                    <p>
                      Under <b>Zone Resources</b> choose <b>Include</b>,{" "}
                      <b>Specific zone</b>, <b>{zone}</b>. Then{" "}
                      <b>Continue to summary</b> and <b>Create Token</b>.
                    </p>
                    <CloudflareTokenSketch zone={zone} />
                  </>
                ),
              },
              {
                title: "Copy it and paste it here",
                body: (
                  <>
                    <p>
                      Cloudflare shows the token <b>once</b>. Copy it, come back
                      to this tab and paste.
                    </p>
                    <SecretPaste
                      label="Cloudflare API token"
                      recognise={recogniseCloudflare}
                      busy={busy}
                      action="Check and connect"
                      onSubmit={submit}
                      keep={
                        outcome?.kind === "unreachable"
                          ? "Your token is still in the field. It was not rejected."
                          : null
                      }
                    />
                  </>
                ),
              },
            ]}
          />
          {staged.checks.length > 0 && <CheckList checks={staged.checks} />}
          {outcome?.kind === "unreachable" && (
            <Problem title="Cloudflare could not be reached from this computer">
              <p>
                The token was never looked at. Check the connection and press
                Check and connect again.
              </p>
            </Problem>
          )}
          {outcome?.kind === "rejected" && (
            <Problem title="Cloudflare does not accept this token">
              <p>
                It may have been deleted or rolled on Cloudflare, or only part
                of it was copied. Tokens cannot be shown again: create a new one
                with the link in step 1.
              </p>
            </Problem>
          )}
          {outcome?.kind === "cannot-edit" && (
            <Problem title={`The token can see ${zone}, but only read its DNS`}>
              <p>
                Cloudflare lists it without DNS edit. On Cloudflare, open the
                token under My Profile › API Tokens, choose Edit, set Zone · DNS
                to <b>Edit</b> and save; the same token then works. Press Check
                and connect again. Nothing was saved.
              </p>
            </Problem>
          )}
          {outcome?.kind === "zone-hidden" && (
            <Problem title={`The token works, but it cannot see ${zone}`}>
              <p>
                That does not mean {zone} is missing from your account. The
                token was limited to{" "}
                {outcome.visible.length
                  ? `${outcome.visible.join(", ")}`
                  : "no zone at all"}
                . On Cloudflare, open the token under My Profile › API Tokens,
                choose Edit, add <b>{zone}</b> under Zone Resources and save;
                the same token then works. Press Check and connect again.
                Nothing was saved.
              </p>
            </Problem>
          )}
        </div>
      )}
    </RequestCard>
  );
}

/** One record, copyable piece by piece, and a watch for it on public DNS. */
function ManualRecord({
  name,
  label,
  zone,
  address,
  transport,
  onFound,
}: {
  name: string;
  label: string;
  zone: string;
  address: string;
  transport: OnboardingTransport;
  onFound: () => void;
}) {
  const [asked, setAsked] = useState(0);
  const found = useRef(false);
  useEffect(() => {
    let alive = true;
    const ask = async () => {
      if (found.current || !alive) return;
      const resolves = await transport.recordResolves(name, address);
      if (!alive) return;
      setAsked((count) => count + 1);
      if (resolves) {
        found.current = true;
        onFound();
      }
    };
    const timer = setInterval(ask, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [name, address, transport, onFound]);
  return (
    <div className="hv-ob-path">
      <p className="hv-ob-lede">
        In the DNS settings for <b>{zone}</b>, add this record:
      </p>
      <dl className="hv-ob-record">
        <div>
          <dt>Type</dt>
          <dd>
            <code>A</code>
          </dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>
            <CopyLine value={label} label="the record name" />
          </dd>
        </div>
        <div>
          <dt>Value</dt>
          <dd>
            <CopyLine value={address} label="the server address" />
          </dd>
        </div>
      </dl>
      <p className="hv-ob-fine">
        If the provider offers a proxy or &ldquo;orange cloud&rdquo; switch,
        leave it off for now so the certificate can be issued. Remove any
        existing A, AAAA or CNAME record for the same name.
      </p>
      <p className="hv-ob-watch" role="status">
        <span className="hv-ob-pulse" aria-hidden="true" />
        Watching public DNS for {name}
        {asked > 0 &&
          ` · asked ${asked} time${asked === 1 ? "" : "s"}, not there yet`}
        . New records usually appear within a few minutes. You can leave this
        page; Hallvi keeps the request.
      </p>
    </div>
  );
}
