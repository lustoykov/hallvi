"use client";

// Connecting Hetzner, at the point a server is needed.
//
// Hetzner offers one thing: a project API token. There is no sign-in handoff
// to borrow, so the work is in the three places a first-timer gets lost —
// knowing what the token is a key to, finding the page that makes one, and
// learning why a pasted one did not work. A reader who already has a token
// pastes it and is done in one step.

import { useState } from "react";

import {
  Away,
  CheckList,
  CopyLine,
  Guide,
  ModeLine,
  Problem,
  SecretPaste,
  useStagedChecks,
} from "./pieces";
import { HetznerTokenSketch } from "./sketches";
import type {
  Check,
  HetznerOutcome,
  OnboardingTransport,
  PermissionMode,
} from "./types";

const CONSOLE = "https://console.hetzner.com/";

/** Shape only. Never echoes any part of the value. */
export function recogniseHetzner(value: string) {
  if (/^ssh-|^-----BEGIN/.test(value))
    return {
      ok: false,
      hint: "That is an SSH key. The API token is a single line of 64 letters and digits, made under Security › API tokens.",
    };
  if (/^cf[kua]t?_/.test(value))
    return { ok: false, hint: "That is a Cloudflare key, not a Hetzner one." };
  if (!/^[A-Za-z0-9]+$/.test(value))
    return {
      ok: false,
      hint: "Hetzner tokens are only letters and digits. Something extra was copied with it.",
    };
  if (value.length !== 64)
    return {
      ok: false,
      hint: `This is ${value.length} characters; Hetzner tokens are 64. It may have been cut off while copying.`,
    };
  return { ok: true, hint: "64 characters. Looks like a Hetzner token." };
}

const PLAN: Check[] = [
  { id: "reach", label: "Reach Hetzner", state: "pending" },
  { id: "known", label: "Hetzner recognises the token", state: "pending" },
  { id: "read", label: "Read the project", state: "pending" },
  { id: "write", label: "Make a change in the project", state: "pending" },
];

function settle(outcome: HetznerOutcome): Check[] {
  if (outcome.kind === "unreachable")
    return [{ ...PLAN[0]!, state: "failed", detail: "No answer came back." }];
  const reached: Check = { ...PLAN[0]!, state: "passed" };
  if (outcome.kind === "rejected")
    return [reached, { ...PLAN[1]!, state: "failed" }];
  const read: Check = {
    ...PLAN[2]!,
    state: "passed",
    detail:
      outcome.servers === 0
        ? "The project has no servers yet."
        : `The project already holds ${outcome.servers} server${outcome.servers === 1 ? "" : "s"}.`,
  };
  const known: Check = { ...PLAN[1]!, state: "passed" };
  if (outcome.kind === "read-only")
    return [
      reached,
      known,
      read,
      { ...PLAN[3]!, state: "failed", detail: "Hetzner answered: forbidden." },
    ];
  return [
    reached,
    known,
    read,
    {
      ...PLAN[3]!,
      state: "passed",
      detail: "Added Hallvi’s public SSH key, which the new server needs.",
    },
  ];
}

export function HetznerConnect({
  transport,
  mode,
  replacing = false,
  guideAt,
  onGuideAt,
  onConnected,
}: {
  transport: OnboardingTransport;
  mode: PermissionMode;
  /** A saved token stopped working; the reader has done this before. */
  replacing?: boolean;
  guideAt: number;
  onGuideAt: (step: number) => void;
  onConnected: (
    outcome: Extract<HetznerOutcome, { kind: "connected" }>,
  ) => void;
}) {
  const [guided, setGuided] = useState(!replacing);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<HetznerOutcome | null>(null);
  const staged = useStagedChecks();

  const submit = async (token: string) => {
    setBusy(true);
    setOutcome(null);
    const result = await transport.checkHetzner(token);
    await staged.play(PLAN, settle(result));
    setOutcome(result);
    setBusy(false);
    if (result.kind === "connected") {
      onConnected(result);
      return true;
    }
    // A token that was never judged stays in the field for another try.
    return result.kind !== "unreachable";
  };

  const paste = (
    <>
      <SecretPaste
        label="Hetzner API token"
        recognise={recogniseHetzner}
        busy={busy}
        action="Check and connect"
        onSubmit={submit}
        keep={
          outcome?.kind === "unreachable"
            ? "Your token is still in the field. It was not rejected."
            : null
        }
      />
      <p className="hv-ob-fine">
        To prove the token can make changes, the check adds Hallvi&rsquo;s
        public SSH key to the project. It is free, the new server needs it
        anyway, and you can delete it under Security › SSH keys.
      </p>
    </>
  );

  return (
    <div className="hv-ob-path">
      <div className="hv-ob-grant">
        <h4>What you are giving Hallvi</h4>
        <p>
          A key to <b>one Hetzner project</b>. With it Hallvi can create, change
          and delete servers and everything else in that project. Hetzner does
          not offer narrower keys. Use a separate project containing only
          Hallvi&rsquo;s test servers: nothing outside that project can be
          touched, but everything inside it is within reach.
        </p>
        <ModeLine mode={mode} action="rent the server" />
      </div>

      <div className="hv-ob-switch" role="group" aria-label="How to connect">
        <button
          type="button"
          aria-pressed={guided}
          onClick={() => setGuided(true)}
        >
          Guide me
        </button>
        <button
          type="button"
          aria-pressed={!guided}
          onClick={() => setGuided(false)}
        >
          I have a token
        </button>
      </div>

      {guided ? (
        <Guide
          at={guideAt}
          onAt={onGuideAt}
          steps={[
            {
              title: "Sign in to Hetzner",
              body: (
                <>
                  <Away href={CONSOLE}>Open the Hetzner Console</Away>
                  <p>
                    It opens in a new tab; this request stays here. No account
                    yet? Create one on that page. Hetzner may ask for a payment
                    method or an identity check before it lets a new account
                    rent servers, and that can take from minutes to a day. Come
                    back whenever it is done: this step will be waiting.
                  </p>
                </>
              ),
            },
            {
              title: "Make a project just for Hallvi",
              body: (
                <p>
                  On the Projects page, add a new project, name it{" "}
                  <code>hallvi</code> and open it. A token belongs to the
                  project it is made in and cannot reach any other. Already have
                  an empty project you want to use? Open that one.
                </p>
              ),
            },
            {
              title: "Generate the token",
              body: (
                <>
                  <p>
                    Inside the project: <b>Security</b> at the bottom of the
                    left menu, then <b>API tokens</b> along the top, then{" "}
                    <b>Generate API token</b>. Choose <b>Read &amp; Write</b>; a
                    Read token cannot create a server and cannot be upgraded
                    later.
                  </p>
                  <CopyLine value="Hallvi" label="the description" />
                  <HetznerTokenSketch />
                </>
              ),
            },
            {
              title: "Copy it and paste it here",
              body: (
                <>
                  <p>
                    Hetzner shows the token <b>once</b>. Copy it before closing
                    that window, come back to this tab and paste.
                  </p>
                  {paste}
                </>
              ),
            },
          ]}
        />
      ) : (
        <>
          <p className="hv-ob-lede">
            A <b>Read &amp; Write</b> token from the project the server should
            live in.
          </p>
          {paste}
        </>
      )}

      {staged.checks.length > 0 && <CheckList checks={staged.checks} />}

      {outcome?.kind === "unreachable" && (
        <Problem title="Hetzner could not be reached from this computer">
          <p>
            That says nothing about your token: it was never looked at. Check
            this computer&rsquo;s internet connection, or{" "}
            <a
              href="https://status.hetzner.com/"
              target="_blank"
              rel="noreferrer"
            >
              Hetzner&rsquo;s status page
            </a>
            , then press Check and connect again.
          </p>
        </Problem>
      )}
      {outcome?.kind === "rejected" && (
        <Problem title="Hetzner does not know this token">
          <p>
            It had the right shape, so the usual causes are a token that was
            deleted in the Console, or one copied from a different place than
            the &ldquo;Generate API token&rdquo; window. Tokens cannot be shown
            again; generate a new one (step 3) and paste that.
          </p>
        </Problem>
      )}
      {outcome?.kind === "read-only" && (
        <Problem title="This token can read, but not make changes">
          <p>
            It was generated with <b>Read</b>. Hallvi needs{" "}
            <b>Read &amp; Write</b> to create the server, and Hetzner cannot
            change a token afterwards. Generate a new one with Read &amp; Write
            and paste it; you can delete the Read one. Nothing was saved.
          </p>
        </Problem>
      )}
    </div>
  );
}

/** Said once connected, and accurate to where the file actually goes. */
export function HetznerKept() {
  return (
    <p className="hv-ob-fine">
      The token is saved in a file on this computer that only your user account
      can read. It is not encrypted there. The AI model never sees it, and it is
      not sent to your server. If you later turn on Hallvi&rsquo;s own backups,
      that file is part of the encrypted copy. To withdraw access, delete the
      token in the Hetzner Console.
    </p>
  );
}
