"use client";

// "Where should it run?" — asked once Hallvi knows what the application needs.
//
// Both answers are whole journeys, side by side, with Hallvi's recommendation
// marked rather than imposed. The choice, the guide step and nothing else are
// remembered, so a reader who left for a provider's site, cancelled there, or
// came back tomorrow lands where they were. Once a place is connected the
// card folds into a receipt and the conversation carries on by itself.

import { Desktop, HardDrives } from "@phosphor-icons/react";

import { HetznerConnect, HetznerKept } from "./hetzner-connect";
import { MachineConnect } from "./machine-connect";
import { Receipt, RequestCard } from "./pieces";
import {
  isHomeAddress,
  type OnboardingTransport,
  type PermissionMode,
} from "./types";

export type HostChoice = "hetzner" | "machine";

/** Everything remembered about an unfinished request. None of it is secret. */
export interface HostRequestProgress {
  choice: HostChoice | null;
  guideAt: number;
}

export type ConnectedHost =
  | { kind: "hetzner"; servers: number }
  | { kind: "machine"; user: string; address: string; os: string };

export function HostRequest({
  application,
  needs,
  estimate,
  recommended,
  hetznerConnected,
  transport,
  mode,
  publicKey,
  progress,
  onProgress,
  connected,
  onConnected,
}: {
  application: string;
  /** Pi's one sentence on what the application needs. */
  needs: string;
  /** "about €5 a month" — from Hetzner's live prices, never a constant. */
  estimate: string;
  recommended: HostChoice;
  /** A working Hetzner connection already exists on this controller. */
  hetznerConnected: boolean;
  transport: OnboardingTransport;
  mode: PermissionMode;
  publicKey: string;
  progress: HostRequestProgress;
  onProgress: (progress: HostRequestProgress) => void;
  connected: ConnectedHost | null;
  onConnected: (host: ConnectedHost) => void;
}) {
  if (connected)
    return (
      <RequestCard
        asks="has a place to run it"
        state="done"
        label="Hosting connected"
      >
        {connected.kind === "hetzner" ? (
          <Receipt
            title={`Hetzner connected · can read and make changes · ${
              connected.servers === 0
                ? "empty project"
                : `${connected.servers} other server${connected.servers === 1 ? "" : "s"} in the project`
            }`}
          >
            <HetznerKept />
          </Receipt>
        ) : (
          <Receipt
            title={`Connected to ${connected.address} as ${connected.user} · ${connected.os}`}
          >
            <p className="hv-ob-fine">
              Hallvi signs in with a key made for this application, and only to
              the machine whose identity you pasted. Remove the{" "}
              <code>hallvi-</code> line from <code>~/.ssh/authorized_keys</code>{" "}
              on the machine to take the access away.
              {isHomeAddress(connected.address) &&
                " It is on your home network: Hallvi reaches it only from that network."}
            </p>
          </Receipt>
        )}
      </RequestCard>
    );

  const choose = (choice: HostChoice) =>
    onProgress({
      choice,
      guideAt: progress.choice === choice ? progress.guideAt : 0,
    });

  return (
    <RequestCard
      asks="needs a place to run it"
      state="waiting"
      label="Where should it run?"
    >
      <p className="hv-ob-said">
        {needs} Where should {application} run?
      </p>
      <div
        className="hv-ob-choices"
        role="radiogroup"
        aria-label="Where it runs"
      >
        <button
          type="button"
          role="radio"
          aria-checked={progress.choice === "hetzner"}
          onClick={() => choose("hetzner")}
        >
          <HardDrives aria-hidden="true" />
          <strong>
            Rent a new server
            {recommended === "hetzner" && <em>Recommended</em>}
          </strong>
          <span>
            Hetzner Cloud, {estimate}, billed by Hetzner to you, ready in about
            two minutes. It is billed by the hour: a day of trying it costs
            cents, and deleting the server stops the bill.{" "}
            {hetznerConnected
              ? "Your Hetzner account is already connected."
              : "Needs a Hetzner account; Hallvi walks you through it."}
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={progress.choice === "machine"}
          onClick={() => choose("machine")}
        >
          <Desktop aria-hidden="true" />
          <strong>
            Use a machine I already have
            {recommended === "machine" && <em>Recommended</em>}
          </strong>
          <span>
            A VPS from any provider, or a Linux computer at home, that you can
            sign in to over SSH. No new cost.
          </span>
        </button>
      </div>

      {progress.choice === "hetzner" &&
        (hetznerConnected ? (
          <button
            type="button"
            className="hv-ob-primary"
            onClick={() => onConnected({ kind: "hetzner", servers: 0 })}
          >
            Use my Hetzner account
          </button>
        ) : (
          <HetznerConnect
            transport={transport}
            mode={mode}
            guideAt={progress.guideAt}
            onGuideAt={(guideAt) => onProgress({ ...progress, guideAt })}
            onConnected={(outcome) =>
              onConnected({ kind: "hetzner", servers: outcome.servers })
            }
          />
        ))}
      {progress.choice === "machine" && (
        <MachineConnect
          transport={transport}
          mode={mode}
          publicKey={publicKey}
          guideAt={progress.guideAt}
          onGuideAt={(guideAt) => onProgress({ ...progress, guideAt })}
          onConnected={({ line, address }) =>
            onConnected({
              kind: "machine",
              user: line.user,
              address,
              os: line.os,
            })
          }
        />
      )}
    </RequestCard>
  );
}
