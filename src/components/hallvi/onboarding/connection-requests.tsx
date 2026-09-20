"use client";

// The onboarding cards, against the controller.
//
// One hook reads what the conversation is waiting on and hands back the cards
// to draw at the message each was asked on. A credential typed into a card
// goes out in one same-origin request body and is dropped; what comes back is
// what was established. When a request settles here, in this reading of the
// page, Hallvi is told in an ordinary message — telling it approves nothing.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { SavedInformation } from "@/server/operator-data";
import type { ConnectionRequest } from "@/server/connection-requests";

import { directAddress, ReachLadder, type Reach } from "./access-card";
import { DomainConnect, type DomainProgress } from "./domain-connect";
import { HostRequest, type ConnectedHost } from "./host-request";
import type { JourneyFacts } from "./journey-rail";
import { RequestCard } from "./pieces";
import {
  isHomeAddress,
  type OnboardingTransport,
  type PermissionMode,
} from "./types";

/**
 * What Hallvi is told once Cloudflare access is in place.
 *
 * The zone is where the token reaches; the name is what gets published. A
 * subdomain names both, so it cannot be rounded up to the domain its zone is
 * named after. A root domain is its own zone, and setting it against itself
 * would read as two different names.
 */
export function cloudflareHandoff(name: string, zone: string) {
  return name === zone
    ? `Cloudflare is connected for ${name}. Please point ${name} at the server and publish the application there.`
    : `Cloudflare is connected for the zone ${zone}, which holds ${name}. Please point ${name} at the server and publish the application at ${name}, not at ${zone}.`;
}

interface Held {
  requests: ConnectionRequest[];
  mode: PermissionMode;
  hostAddress: string | null;
  hetznerConnected: boolean;
  publicKey: string;
}

function transportFor(applicationId: string): OnboardingTransport {
  const ask = async <T,>(body: Record<string, unknown>): Promise<T> => {
    const response = await fetch(
      `/api/applications/${applicationId}/connections`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const value = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(value?.error ?? "Hallvi could not complete that check.");
    return value.outcome as T;
  };
  return {
    // Hallvi itself not answering is the same fact to the owner as the
    // provider not answering: nothing was judged.
    checkHetzner: (token) =>
      ask<Awaited<ReturnType<OnboardingTransport["checkHetzner"]>>>({
        action: "hetzner",
        token,
      }).catch(() => ({ kind: "unreachable" as const })),
    checkMachine: (line, address) => ask({ action: "machine", line, address }),
    whoHostsDns: (name) =>
      ask<Awaited<ReturnType<OnboardingTransport["whoHostsDns"]>>>({
        action: "dns-host",
        name,
      }).catch(() => ({ kind: "unreachable" as const })),
    checkCloudflare: (token, zone) =>
      ask<Awaited<ReturnType<OnboardingTransport["checkCloudflare"]>>>({
        action: "cloudflare",
        token,
        zone,
      }).catch(() => ({ kind: "unreachable" as const })),
    existingCloudflare: (zone) =>
      ask<Awaited<ReturnType<OnboardingTransport["existingCloudflare"]>>>({
        action: "cloudflare-existing",
        zone,
      }).catch(() => ({ kind: "not-connected" as const })),
    recordResolves: (name, address) =>
      ask<boolean>({ action: "resolves", name, address }).catch(() => false),
  };
}

/** The latest message at or before the ask: where the card belongs. */
function pointOf(
  requestedAt: string,
  messages: { id: string; createdAt: string }[],
) {
  let point: string | null = null;
  for (const message of messages)
    if (message.createdAt <= requestedAt) point = message.id;
  return point;
}

export function useConnectionRequests({
  applicationId,
  application,
  messages,
  information,
  poll,
  enabled,
  onTell,
}: {
  applicationId: string | undefined;
  application: string;
  messages: { id: string; createdAt: string }[];
  information: SavedInformation[];
  /** A turn is running: a request may appear at any moment. */
  poll: boolean;
  /** Only the main conversation changes things, so only it asks. */
  enabled: boolean;
  /** Sends Hallvi an ordinary message on the owner's behalf. */
  onTell: (message: string) => void;
}) {
  const [held, setHeld] = useState<Held | null>(null);

  const read = useCallback(async () => {
    if (!applicationId) return;
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/connections`,
      );
      if (response.ok) setHeld(await response.json());
    } catch {
      // A page that cannot reach its own controller has louder problems.
    }
  }, [applicationId]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the controller's state into the page
    void read();
    if (!poll) return;
    const timer = window.setInterval(read, 3000);
    return () => window.clearInterval(timer);
  }, [enabled, poll, read]);

  const transport = useMemo(
    () => (applicationId ? transportFor(applicationId) : null),
    [applicationId],
  );

  const post = useCallback(
    (body: Record<string, unknown>) =>
      fetch(`/api/applications/${applicationId}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => null),
    [applicationId],
  );

  if (!enabled || !held || !transport || !applicationId)
    return { at: () => null, rest: null, waiting: 0, journey: null };

  const progress = (kind: ConnectionRequest["kind"], value: unknown) => {
    setHeld({
      ...held,
      requests: held.requests.map((request) =>
        request.kind === kind
          ? ({ ...request, progress: value } as ConnectionRequest)
          : request,
      ),
    });
    void post({ action: "progress", kind, progress: value });
  };

  const access = information.find(
    (record) =>
      !record.retiredAt &&
      record.presentation?.content?.kind === "application-access",
  );
  const accessContent =
    access?.presentation?.content?.kind === "application-access"
      ? access.presentation.content
      : null;
  const home = held.hostAddress ? isHomeAddress(held.hostAddress) : false;
  const publicUrl =
    accessContent?.mode === "public"
      ? (access?.presentation?.url ?? null)
      : null;
  const direct = held.hostAddress ? directAddress(held.hostAddress) : null;
  const reach: Reach =
    publicUrl === null ? "private" : publicUrl === direct ? "direct" : "domain";

  const cards = new Map<string | null, ReactNode[]>();
  const place = (requestedAt: string, card: ReactNode) => {
    const point = pointOf(requestedAt, messages);
    cards.set(point, [...(cards.get(point) ?? []), card]);
  };

  // Place access choices first so a domain form at the same message follows
  // the "Use my domain" action that opened it.
  if (access && accessContent && held.hostAddress)
    place(
      access.establishedAt ?? access.createdAt,
      <RequestCard
        key="ladder"
        asks="can open it to more people"
        state="done"
        label="Who can open it"
      >
        <ReachLadder
          application={application}
          privateUrl={
            accessContent.mode === "private"
              ? (access.presentation?.url ?? null)
              : null
          }
          home={home}
          directUrl={home ? null : direct}
          domainUrl={reach === "domain" ? publicUrl : null}
          reach={reach}
          unclaimed="unknown"
          busy={poll ? "direct" : null}
          onDirect={() => {
            onTell(
              home
                ? "Please open the application to the devices on my home network, at the machine's own address."
                : `Please make the application public at its direct address, ${direct}, without a domain.`,
            );
          }}
          onDomain={async () => {
            await post({ action: "open-domain" });
            void read();
          }}
        />
      </RequestCard>,
    );

  for (const request of held.requests) {
    if (request.kind === "host")
      place(
        request.requestedAt,
        <HostRequest
          key="host"
          application={application}
          needs={request.needs}
          estimate={request.estimate}
          recommended={request.recommended}
          hetznerConnected={held.hetznerConnected}
          transport={transport}
          mode={held.mode}
          publicKey={held.publicKey}
          progress={request.progress}
          onProgress={(value) => progress("host", value)}
          connected={request.connected}
          onConnected={async (connected: ConnectedHost) => {
            if (connected.kind === "hetzner" && held.hetznerConnected)
              await post({ action: "use-hetzner" });
            void read();
            onTell(
              connected.kind === "hetzner"
                ? held.hetznerConnected
                  ? "Use my connected Hetzner account for this. Please carry on."
                  : `Hetzner is connected and can make changes. The project holds ${connected.servers} server${connected.servers === 1 ? "" : "s"}. Please carry on.`
                : `My machine at ${connected.address} is connected as ${connected.user}. Please carry on.`,
            );
          }}
        />,
      );
    else if (held.hostAddress)
      place(
        request.requestedAt,
        <DomainConnect
          key="domain"
          application={application}
          serverAddress={held.hostAddress}
          transport={transport}
          mode={held.mode}
          progress={request.progress as DomainProgress}
          onProgress={(value) => progress("domain", value)}
          done={Boolean(request.settledAt)}
          onReady={async (via) => {
            const { name, host } = request.progress;
            const zone = host && "zone" in host ? host.zone : name;
            // A connection made earlier settles here; one pasted just now
            // already has, and settling twice changes nothing.
            if (via === "cloudflare" && host && "zone" in host)
              await post({
                action: "cloudflare-existing",
                zone: host.zone,
                use: true,
              });
            void read();
            onTell(
              via === "cloudflare"
                ? cloudflareHandoff(name, zone)
                : `I added the DNS record myself: ${name} now resolves to ${held.hostAddress}. Please publish the application there; there is no record for you to write.`,
            );
          }}
          onCancel={async () => {
            await post({ action: "dismiss", kind: "domain" });
            void read();
          }}
        />,
      );
  }

  const hostRequest = held.requests.find((request) => request.kind === "host");
  const journey: JourneyFacts = {
    read:
      Boolean(hostRequest) ||
      Boolean(held.hostAddress) ||
      information.some((record) => !record.retiredAt),
    placeWaiting: Boolean(hostRequest && !hostRequest.settledAt),
    placed: Boolean(held.hostAddress),
    deployed: information.some(
      (record) =>
        !record.retiredAt &&
        record.presentation?.content?.kind === "deployment",
    ),
    opens: Boolean(access),
  };

  return {
    journey,
    at: (messageId: string) => cards.get(messageId) ?? null,
    /** Cards whose asking message is not in this transcript. */
    rest: cards.get(null) ?? null,
    waiting: held.requests.filter((request) => !request.settledAt).length,
  };
}
