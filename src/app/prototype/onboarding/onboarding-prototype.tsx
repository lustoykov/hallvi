"use client";

// PROTOTYPE · the scripted conversation around the onboarding cards.
// Everything in this file is throwaway; the cards it renders are not.

import {
  ArrowSquareOut,
  Check,
  GithubLogo,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  AccessCard,
  type Reach,
} from "@/components/hallvi/onboarding/access-card";
import {
  DomainConnect,
  type DomainProgress,
} from "@/components/hallvi/onboarding/domain-connect";
import { HetznerConnect } from "@/components/hallvi/onboarding/hetzner-connect";
import { JourneyRail } from "@/components/hallvi/onboarding/journey-rail";
import {
  HostRequest,
  type ConnectedHost,
  type HostRequestProgress,
} from "@/components/hallvi/onboarding/host-request";
import {
  CopyLine,
  Receipt,
  RequestCard,
} from "@/components/hallvi/onboarding/pieces";
import {
  isHomeAddress,
  type CloudflareOutcome,
  type DnsHost,
  type HetznerOutcome,
  type MachineFailure,
  type OnboardingTransport,
  type PermissionMode,
} from "@/components/hallvi/onboarding/types";

import "./onboarding-prototype.css";

type Stage =
  "intake" | "model" | "inspect" | "host" | "propose" | "deploy" | "running";
type Side = "none" | "approval" | "working" | "done";

interface Saved {
  chapter: "journey" | "reconnect";
  stage: Stage;
  mode: PermissionMode;
  repo: string;
  chatgpt: boolean;
  hetznerAlready: boolean;
  claimed: boolean;
  host: HostRequestProgress;
  connected: ConnectedHost | null;
  reach: Reach;
  publish: Side;
  domain: DomainProgress;
  domainOpen: boolean;
  naming: Side;
  reconnected: boolean;
}

interface Sim {
  hetzner: HetznerOutcome["kind"];
  machine: "connected" | MachineFailure;
  dns: DnsHost["kind"];
  cloudflare: CloudflareOutcome["kind"];
}

const FRESH: Saved = {
  chapter: "journey",
  stage: "intake",
  mode: "pi-decides",
  repo: "",
  chatgpt: true,
  hetznerAlready: false,
  claimed: false,
  host: { choice: null, guideAt: 0 },
  connected: null,
  reach: "private",
  publish: "none",
  domain: { name: "", host: null, way: null, guideAt: 0 },
  domainOpen: false,
  naming: "none",
  reconnected: false,
};

const KEY = "hallvi:prototype:onboarding:v1";
const APP = "Uptime Kuma";
const SERVER = "203.0.113.9";
const HOME = "192.168.1.20";
const PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPrototypeOnlyNotARealKey0000000000000000000 hallvi-uptime-kuma";
const EXAMPLES = {
  token: "prototypeOnlyNotARealToken" + "0".repeat(38),
  vps: `hallvi-machine user=root port=22 key=SHA256:${"p".repeat(43)} os=ubuntu-24.04 arch=x86_64 addrs=${SERVER},10.0.0.5`,
  home: `hallvi-machine user=lyubo port=22 key=SHA256:${"h".repeat(43)} os=debian-12 arch=aarch64 addrs=${HOME}`,
  cloudflare: "cfut_prototypeOnlyNotARealToken" + "0".repeat(14),
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function OnboardingPrototype() {
  const [saved, setSaved] = useState<Saved>(FRESH);
  const [ready, setReady] = useState(false);
  const [sim, setSim] = useState<Sim>({
    hetzner: "connected",
    machine: "connected",
    dns: "cloudflare",
    cloudflare: "connected",
  });
  const simRef = useRef(sim);
  useEffect(() => {
    simRef.current = sim;
  }, [sim]);
  const asks = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  // What survives a reload is where the reader was. Never a credential: the
  // cards hold those in a password field and nowhere else.
  useEffect(() => {
    try {
      const kept = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate once
      if (kept) setSaved({ ...FRESH, ...kept });
    } catch {
      /* storage is optional */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
      /* storage is optional */
    }
  }, [saved, ready]);

  const set = (patch: Partial<Saved>) =>
    setSaved((current) => ({ ...current, ...patch }));

  const transport = useMemo<OnboardingTransport>(
    () => ({
      async checkHetzner() {
        await wait(500);
        const kind = simRef.current.hetzner;
        return kind === "connected"
          ? { kind, servers: 0, wrote: true }
          : kind === "read-only"
            ? { kind, servers: 0 }
            : { kind };
      },
      async checkMachine() {
        await wait(500);
        const at = simRef.current.machine;
        return at === "connected"
          ? {
              kind: "connected",
              docker: "will-install",
              memoryMb: 3400,
              diskGb: 31,
            }
          : { kind: "failed", at };
      },
      async whoHostsDns(name) {
        await wait(700);
        const kind = simRef.current.dns;
        const zone = name.split(".").slice(-2).join(".");
        return kind === "other"
          ? {
              kind,
              zone,
              nameservers: ["dns1.registrar-servers.com"],
              who: "Namecheap",
            }
          : kind === "cloudflare"
            ? { kind, zone }
            : { kind };
      },
      async checkCloudflare(_token, zone) {
        await wait(500);
        const kind = simRef.current.cloudflare;
        return kind === "connected"
          ? { kind, zone, edit: "reported" as const }
          : kind === "zone-hidden"
            ? { kind, visible: ["my-other-site.dev"] }
            : { kind };
      },
      async existingCloudflare() {
        return { kind: "not-connected" as const };
      },
      async recordResolves() {
        asks.current += 1;
        return asks.current >= 3;
      },
    }),
    [],
  );

  // The scripted operator: timed hand-offs between stages.
  const { stage, mode, publish, naming } = saved;
  useEffect(() => {
    if (!ready) return;
    const after = (ms: number, patch: Partial<Saved>) => {
      const timer = setTimeout(() => set(patch), ms);
      return () => clearTimeout(timer);
    };
    if (stage === "inspect") return after(1800, { stage: "host" });
    if (stage === "propose" && mode === "bypass")
      return after(1400, { stage: "deploy" });
    if (stage === "deploy") return after(3600, { stage: "running" });
    if (publish === "approval" && mode === "bypass")
      return after(1200, { publish: "working" });
    if (publish === "working")
      return after(2600, { publish: "done", reach: "direct" });
    if (naming === "approval" && mode === "bypass")
      return after(1200, { naming: "working" });
    if (naming === "working")
      return after(2800, { naming: "done", reach: "domain" });
  }, [ready, stage, mode, publish, naming]);

  useEffect(() => {
    if (ready && saved.stage !== "intake")
      end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    ready,
    saved.stage,
    saved.publish,
    saved.naming,
    saved.domainOpen,
    saved.connected,
  ]);

  if (!ready) return null;

  const home =
    saved.connected?.kind === "machine" &&
    isHomeAddress(saved.connected.address);
  const address =
    saved.connected?.kind === "machine" ? saved.connected.address : SERVER;
  const past = (wanted: Stage) =>
    [
      "intake",
      "model",
      "inspect",
      "host",
      "propose",
      "deploy",
      "running",
    ].indexOf(saved.stage) >=
    [
      "intake",
      "model",
      "inspect",
      "host",
      "propose",
      "deploy",
      "running",
    ].indexOf(wanted);

  return (
    <div className="hvp">
      <header className="hvp-top">
        <span className="hvp-mark">H</span>
        <strong>Hallvi</strong>
        {saved.stage !== "intake" && (
          <span className="hvp-crumb">{APP} · Main operator</span>
        )}
        <span className="hvp-simulated">
          Prototype · scripted conversation, simulated providers
        </span>
      </header>

      {saved.chapter === "reconnect" ? (
        <main className="hvp-chat">
          <Msg from="you">
            Move {APP} to a bigger server, it is getting slow.
          </Msg>
          <Msg from="hallvi">
            I went to read the current server types and Hetzner answered{" "}
            <b>401 · unauthorized</b> to the token saved here. It worked on 12
            September, so it was most likely deleted in the Hetzner Console.
            Nothing was changed. I need a new token for the same project to
            carry on.
          </Msg>
          {saved.reconnected ? (
            <>
              <RequestCard
                asks="has Hetzner access again"
                state="done"
                label="Hetzner reconnected"
              >
                <Receipt title="Hetzner reconnected · same project, 1 server · can read and make changes" />
              </RequestCard>
              <Note>
                Hallvi was told the connection works and carried on with your
                request.
              </Note>
              <Msg from="hallvi" working>
                Reading server types and current prices…
              </Msg>
            </>
          ) : (
            <RequestCard
              asks="needs Hetzner access again"
              state="waiting"
              label="Reconnect Hetzner"
            >
              <HetznerConnect
                transport={transport}
                mode={saved.mode}
                replacing
                guideAt={saved.host.guideAt}
                onGuideAt={(guideAt) =>
                  set({ host: { ...saved.host, guideAt } })
                }
                onConnected={() => set({ reconnected: true })}
              />
            </RequestCard>
          )}
          <div ref={end} />
        </main>
      ) : saved.stage === "intake" ? (
        <Intake
          mode={saved.mode}
          onAdd={(repo) =>
            set({ repo, stage: saved.chatgpt ? "inspect" : "model" })
          }
        />
      ) : (
        <main className="hvp-chat">
          <JourneyRail
            application={APP}
            facts={{
              read: past("host"),
              placeWaiting: saved.stage === "host",
              placed: past("deploy"),
              deployed: saved.stage === "running",
              opens: saved.stage === "running",
            }}
            waitingOnYou={saved.stage === "model" || saved.stage === "propose"}
            placement="progress"
            canStart={false}
            onStart={() => undefined}
          />
          <Msg from="you">Get {saved.repo} running.</Msg>

          {saved.stage === "model" && (
            <RequestCard
              asks="needs a model to think with"
              state="waiting"
              label="Connect ChatGPT"
            >
              <p className="hv-ob-said">
                Your request is saved. Hallvi works through your ChatGPT
                subscription, so sign in once and it starts on{" "}
                {saved.repo.split("/").pop()} straight away.
              </p>
              <button
                type="button"
                className="hv-ob-primary"
                onClick={() => set({ chatgpt: true, stage: "inspect" })}
              >
                Sign in with ChatGPT{" "}
                <ArrowSquareOut weight="bold" aria-hidden="true" />
              </button>
              <p className="hv-ob-fine">
                Hallvi picks its recommended model. You can change the model and
                reasoning effort later in Settings; nothing about them needs
                deciding now.
              </p>
            </RequestCard>
          )}
          {past("inspect") && saved.stage !== "model" && (
            <>
              {saved.stage === "inspect" ? (
                <Msg from="hallvi" working>
                  Reading the repository: Dockerfile, compose file, README…
                </Msg>
              ) : (
                <Msg from="hallvi">
                  I read the repository. {APP} is one container that serves a
                  web page on port 3001 and keeps its data in a SQLite file, so
                  it needs a small disk that survives restarts and nothing else:
                  no separate database, no queue. The public repository needed
                  no GitHub sign-in.
                </Msg>
              )}
            </>
          )}

          {past("host") && (
            <HostRequest
              application={APP}
              needs="It needs a small Linux server: about 300 MB of memory and a few GB of disk."
              estimate="about €5 a month"
              recommended="hetzner"
              hetznerConnected={saved.hetznerAlready}
              transport={transport}
              mode={saved.mode}
              publicKey={PUBLIC_KEY}
              progress={saved.host}
              onProgress={(host) => set({ host })}
              connected={saved.connected}
              onConnected={(connected) => set({ connected, stage: "propose" })}
            />
          )}

          {past("propose") && saved.connected && (
            <>
              <Note>
                Hallvi was told the connection works and carried on. You did not
                have to say anything.
              </Note>
              {saved.connected.kind === "hetzner" ? (
                <Msg from="hallvi">
                  From Hetzner&rsquo;s live price list I picked a <b>CX23</b> in
                  Falkenstein: 2 vCPU, 4 GB memory, 40 GB disk. €4.49 a month
                  for the server plus €0.60 for its public IPv4 address,{" "}
                  <b>€5.09 a month in total</b>, billed by the hour by Hetzner
                  and never more than the monthly price. Delete it and the
                  billing stops.
                  <Approval
                    mode={saved.mode}
                    settled={saved.stage !== "propose"}
                    what="Rent a CX23 server in Falkenstein · €5.09 a month"
                    command="POST /servers  name=uptime-kuma  server_type=cx23  location=fsn1  image=ubuntu-24.04"
                    onApprove={() => set({ stage: "deploy" })}
                  />
                </Msg>
              ) : (
                <Msg from="hallvi">
                  Connected to <b>{saved.connected.address}</b>. Docker is not
                  installed there yet, so I will install it from Docker&rsquo;s
                  own package repository, then start {APP} bound to the
                  machine&rsquo;s loopback address so nothing new is open to the
                  network. Other software on the machine is left alone.
                  <Approval
                    mode={saved.mode}
                    settled={saved.stage !== "propose"}
                    what={`Install Docker on ${saved.connected.address}`}
                    command="curl -fsSL https://get.docker.com | sh"
                    onApprove={() => set({ stage: "deploy" })}
                  />
                </Msg>
              )}
            </>
          )}

          {past("deploy") && (
            <Msg from="hallvi">
              <Steps
                running={saved.stage === "deploy"}
                steps={
                  saved.connected?.kind === "hetzner"
                    ? [
                        "Server created at " + SERVER,
                        "Signed in and pinned its identity",
                        "Installed Docker, started " + APP,
                        "Checked it answers, then opened a private link",
                      ]
                    : [
                        "Installed Docker",
                        "Started " + APP + " on the loopback address",
                        "Checked it answers on the machine",
                        "Opened a private link from this computer",
                      ]
                }
              />
            </Msg>
          )}

          {saved.stage === "running" && (
            <>
              <AccessCard
                application={APP}
                verified={[
                  "The container is running and restarts with the machine.",
                  "Its setup page loaded through the private link, from this computer.",
                  home
                    ? "Nothing new listens on the machine’s network address."
                    : "From the internet, only SSH answers on the server.",
                ]}
                privateUrl="http://127.0.0.1:4812"
                privateOpen
                home={Boolean(home)}
                directUrl={
                  home
                    ? `http://${HOME}:3001`
                    : `https://${address.replaceAll(".", "-")}.sslip.io`
                }
                domainUrl={
                  saved.naming === "done"
                    ? `https://${saved.domain.name}`
                    : null
                }
                reach={saved.reach}
                unclaimed={!saved.claimed}
                busy={
                  publish === "approval" || publish === "working"
                    ? "direct"
                    : null
                }
                onDirect={() => set({ publish: "approval" })}
                onDomain={() => set({ domainOpen: true })}
                onReopen={() => undefined}
              />

              {publish !== "none" && (
                <>
                  <Msg from="you">
                    {home
                      ? "Open it to the devices on my network."
                      : "Make it public at its direct address."}
                  </Msg>
                  <Msg from="hallvi">
                    {home ? (
                      <>
                        I will publish the container&rsquo;s port on{" "}
                        <b>{HOME}:3001</b> and allow it through the
                        machine&rsquo;s firewall for your home network only. It
                        stays plain HTTP: fine on your own Wi-Fi, not something
                        to forward to the internet.
                      </>
                    ) : (
                      <>
                        You have created your administrator account, so opening
                        it up is safe to do. I will open ports 80 and 443 at
                        Hetzner&rsquo;s firewall and on the server, put Caddy in
                        front for a certificate, tell {APP} its new address, and
                        check it from outside. The private link keeps working.
                      </>
                    )}
                    <Approval
                      mode={saved.mode}
                      settled={publish !== "approval"}
                      what={
                        home
                          ? "Open port 3001 to the home network"
                          : "Open ports 80 and 443 and add Caddy"
                      }
                      command={
                        home
                          ? "ufw allow from 192.168.1.0/24 to any port 3001"
                          : "POST /firewalls/…/actions/set_rules  in: tcp 22, 80, 443"
                      }
                      onApprove={() => set({ publish: "working" })}
                    />
                    {publish !== "approval" && (
                      <Steps
                        running={publish === "working"}
                        steps={
                          home
                            ? [
                                "Published the port on " + HOME,
                                "Opened it from another address on your network",
                              ]
                            : [
                                "Opened 80 and 443",
                                "Caddy obtained a certificate",
                                "Signed in through the public address, from outside",
                              ]
                        }
                      />
                    )}
                  </Msg>
                </>
              )}

              {saved.domainOpen && (
                <>
                  <DomainConnect
                    application={APP}
                    serverAddress={address}
                    transport={transport}
                    mode={saved.mode}
                    progress={saved.domain}
                    onProgress={(domain) => set({ domain })}
                    done={saved.naming !== "none"}
                    onReady={(via) =>
                      set({
                        naming: via === "cloudflare" ? "approval" : "working",
                        domain: { ...saved.domain, way: via },
                      })
                    }
                    onCancel={() => set({ domainOpen: false })}
                  />
                  {saved.naming !== "none" && (
                    <>
                      <Note>
                        Hallvi was told the domain is ready and carried on.
                      </Note>
                      <Msg from="hallvi">
                        {saved.domain.way === "cloudflare" ? (
                          <>
                            I can see{" "}
                            <b>
                              {saved.domain.name.split(".").slice(-2).join(".")}
                            </b>
                            . It has no record for <b>{saved.domain.name}</b>{" "}
                            yet, so nothing of yours is replaced.
                            <Approval
                              mode={saved.mode}
                              settled={saved.naming !== "approval"}
                              what={`Point ${saved.domain.name} at ${address}`}
                              command={`set_domain_record  A  ${saved.domain.name} → ${address}  proxied: off`}
                              onApprove={() => set({ naming: "working" })}
                            />
                          </>
                        ) : (
                          <>
                            Public DNS now hands out <b>{address}</b> for{" "}
                            <b>{saved.domain.name}</b>. Carrying on with HTTPS.
                          </>
                        )}
                        {saved.naming !== "approval" && (
                          <Steps
                            running={saved.naming === "working"}
                            steps={[
                              saved.domain.way === "cloudflare"
                                ? "Wrote the record — the token can edit DNS"
                                : "Found your record on public DNS",
                              "Caddy obtained a certificate for " +
                                saved.domain.name,
                              "Signed in through the new name, from outside",
                            ]}
                          />
                        )}
                        {saved.naming === "done" && (
                          <p>
                            <b>https://{saved.domain.name}</b> opens {APP}. The
                            card above now opens it there; the private link and
                            the direct address still work.
                          </p>
                        )}
                      </Msg>
                    </>
                  )}
                </>
              )}
            </>
          )}
          <div ref={end} />
        </main>
      )}

      <Bar
        saved={saved}
        sim={sim}
        onSim={setSim}
        onSaved={(patch) => {
          asks.current = 0;
          set(patch);
        }}
      />
    </div>
  );
}

function Msg({
  from,
  working = false,
  children,
}: {
  from: "you" | "hallvi";
  working?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="hvp-msg" data-from={from}>
      <div className="hvp-msg-who">
        <span className="hvp-avatar" data-from={from} aria-hidden="true">
          {from === "you" ? "You" : "H"}
        </span>
        <strong>{from === "you" ? "You" : "Hallvi"}</strong>
      </div>
      <div className="hvp-msg-body">
        {working && (
          <SpinnerGap className="hvp-spin" weight="bold" aria-hidden="true" />
        )}
        {children}
      </div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="hvp-note">{children}</p>;
}

function Steps({ steps, running }: { steps: string[]; running: boolean }) {
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTicks((value) => value + 1), 800);
    return () => clearInterval(timer);
  }, [running]);
  const at = running ? Math.min(ticks, steps.length - 1) : steps.length;
  return (
    <ul className="hvp-steps">
      {steps.map((step, index) => (
        <li
          key={step}
          data-state={index < at ? "done" : index === at ? "active" : "pending"}
        >
          {index < at ? (
            <Check weight="bold" aria-hidden="true" />
          ) : index === at ? (
            <SpinnerGap className="hvp-spin" weight="bold" aria-hidden="true" />
          ) : (
            <i aria-hidden="true" />
          )}
          {step}
        </li>
      ))}
    </ul>
  );
}

/** The existing pending-call approval, as each mode really behaves. */
function Approval({
  mode,
  settled,
  what,
  command,
  onApprove,
}: {
  mode: PermissionMode;
  settled: boolean;
  what: string;
  command: string;
  onApprove: () => void;
}) {
  if (mode === "bypass")
    return (
      <p className="hvp-bypass">
        Bypass is on, so this ran without asking: <code>{command}</code>
      </p>
    );
  if (settled)
    return (
      <p className="hvp-approved">
        <Check weight="bold" aria-hidden="true" /> You approved: {what}
      </p>
    );
  return (
    <div className="hvp-approval">
      <strong>
        {mode === "always-ask"
          ? "Always ask · this command waits for you"
          : "Hallvi is asking before it goes on"}
      </strong>
      <span>{what}</span>
      <code>{command}</code>
      <div>
        <button type="button" onClick={onApprove}>
          Approve
        </button>
        <button type="button" data-quiet="">
          Decline
        </button>
        <small>Nothing changes until you approve.</small>
      </div>
    </div>
  );
}

function Intake({
  mode,
  onAdd,
}: {
  mode: PermissionMode;
  onAdd: (repo: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "private">("idle");
  const repo =
    /github\.com[/:]([^/\s]+\/[^/\s#?]+?)(\.git)?\/?$/.exec(url.trim())?.[1] ??
    null;
  return (
    <main className="hvp-intake">
      <h1>What do you want to run?</h1>
      <p>
        Paste the repository of the application. Hallvi reads it, tells you what
        it needs, and gets it working on a server you control.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!repo) return;
          setState("checking");
          await wait(900);
          if (/private/i.test(repo)) return setState("private");
          onAdd(`github.com/${repo}`);
        }}
      >
        <input
          type="text"
          spellCheck={false}
          autoComplete="url"
          aria-label="GitHub repository"
          placeholder="https://github.com/louislam/uptime-kuma"
          value={url}
          disabled={state === "checking"}
          onChange={(event) => {
            setUrl(event.target.value);
            setState("idle");
          }}
        />
        <button type="submit" disabled={!repo || state === "checking"}>
          {state === "checking" ? "Reading the repository…" : "Continue"}
        </button>
      </form>
      {repo && state !== "private" && (
        <p className="hvp-intake-name">
          It will be called <b>{repo.split("/")[1]}</b>. You can rename it
          later.
        </p>
      )}
      {state === "private" && (
        <div className="hvp-intake-private" role="alert">
          <strong>Hallvi could not read {repo} without signing in</strong>
          <p>
            GitHub says it does not exist for anonymous visitors, which is what
            a private repository looks like from outside. If it is private,
            connect GitHub and choose just this repository; your address above
            is kept. If it should be public, check the spelling.
          </p>
          <button type="button">
            <GithubLogo weight="bold" aria-hidden="true" /> Connect GitHub for
            this repository
          </button>
        </div>
      )}
      <p className="hvp-intake-fine">
        Public repositories need no GitHub sign-in. Nothing is rented or changed
        yet.{" "}
        {mode === "always-ask"
          ? "You are on Always ask: every command will wait for your approval."
          : mode === "pi-decides"
            ? "You are on Pi decides: Hallvi asks before consequential steps, at its own judgment."
            : "You are on Bypass: Hallvi will not ask before running commands."}
      </p>
    </main>
  );
}

function Bar({
  saved,
  sim,
  onSim,
  onSaved,
}: {
  saved: Saved;
  sim: Sim;
  onSim: (sim: Sim) => void;
  onSaved: (patch: Partial<Saved>) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Open beside the conversation where there is room; a tab elsewhere.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the viewport once
    setOpen(window.matchMedia("(min-width: 1240px)").matches);
  }, []);
  const running = (connected: ConnectedHost): Partial<Saved> => ({
    ...FRESH,
    mode: saved.mode,
    repo: "github.com/louislam/uptime-kuma",
    stage: "running",
    host: { choice: connected.kind, guideAt: 0 },
    connected,
  });
  const pick = <K extends keyof Sim>(
    key: K,
    label: string,
    options: [Sim[K], string][],
  ) => (
    <label>
      {label}
      <select
        value={sim[key]}
        onChange={(event) =>
          onSim({ ...sim, [key]: event.target.value as Sim[K] })
        }
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <aside
      className="hvp-bar"
      data-open={open ? "" : undefined}
      aria-label="Prototype controls"
    >
      <button
        type="button"
        className="hvp-bar-toggle"
        onClick={() => setOpen(!open)}
      >
        Prototype controls {open ? "▾" : "▴"}
      </button>
      {open && (
        <div className="hvp-bar-body">
          <section>
            <h2>Jump to</h2>
            <button
              type="button"
              onClick={() => onSaved({ ...FRESH, mode: saved.mode })}
            >
              Start
            </button>
            <button
              type="button"
              onClick={() =>
                onSaved({ ...FRESH, mode: saved.mode, chatgpt: false })
              }
            >
              Start, ChatGPT not connected
            </button>
            <button
              type="button"
              onClick={() =>
                onSaved({
                  ...FRESH,
                  mode: saved.mode,
                  repo: "github.com/louislam/uptime-kuma",
                  stage: "host",
                })
              }
            >
              Where should it run?
            </button>
            <button
              type="button"
              onClick={() => onSaved(running({ kind: "hetzner", servers: 0 }))}
            >
              Running · Hetzner
            </button>
            <button
              type="button"
              onClick={() =>
                onSaved(
                  running({
                    kind: "machine",
                    user: "lyubo",
                    address: HOME,
                    os: "debian-12",
                  }),
                )
              }
            >
              Running · home machine
            </button>
            <button
              type="button"
              onClick={() =>
                onSaved({
                  ...FRESH,
                  mode: saved.mode,
                  chapter: "reconnect",
                  repo: "x",
                })
              }
            >
              Saved token stopped working
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Reload the page (come back later)
            </button>
          </section>
          <section>
            <h2>Your setting</h2>
            <label>
              Permission mode
              <select
                value={saved.mode}
                onChange={(event) =>
                  onSaved({ mode: event.target.value as PermissionMode })
                }
              >
                <option value="always-ask">Always ask</option>
                <option value="pi-decides">Pi decides</option>
                <option value="bypass">Bypass</option>
              </select>
            </label>
            <label className="hvp-tick">
              <input
                type="checkbox"
                checked={saved.hetznerAlready}
                onChange={(event) =>
                  onSaved({ hetznerAlready: event.target.checked })
                }
              />
              Hetzner already connected
            </label>
            <label className="hvp-tick">
              <input
                type="checkbox"
                checked={saved.claimed}
                onChange={(event) => onSaved({ claimed: event.target.checked })}
              />
              I created the app&rsquo;s admin account
            </label>
          </section>
          <section>
            <h2>What the provider answers next</h2>
            {pick("hetzner", "Hetzner", [
              ["connected", "Works"],
              ["unreachable", "No network"],
              ["rejected", "Unknown token (401)"],
              ["read-only", "Read-only token"],
            ])}
            {pick("machine", "Machine", [
              ["connected", "Works"],
              ["timeout", "Nothing answers"],
              ["refused", "Port closed"],
              ["wrong-machine", "Different machine"],
              ["key-refused", "Key refused"],
              ["sudo-password", "sudo wants a password"],
              ["unsupported", "Unsupported system"],
            ])}
            {pick("dns", "Domain’s DNS is at", [
              ["cloudflare", "Cloudflare"],
              ["other", "Another provider"],
              ["unregistered", "Not registered"],
              ["unreachable", "No network"],
            ])}
            {pick("cloudflare", "Cloudflare", [
              ["connected", "Works"],
              ["unreachable", "No network"],
              ["rejected", "Rejected token"],
              ["zone-hidden", "Token cannot see the zone"],
            ])}
          </section>
          <section>
            <h2>Things to paste</h2>
            <span>Hetzner token</span>
            <CopyLine value={EXAMPLES.token} label="example Hetzner token" />
            <span>Machine line · VPS</span>
            <CopyLine value={EXAMPLES.vps} label="example VPS line" />
            <span>Machine line · home</span>
            <CopyLine value={EXAMPLES.home} label="example home line" />
            <span>Cloudflare token</span>
            <CopyLine
              value={EXAMPLES.cloudflare}
              label="example Cloudflare token"
            />
          </section>
        </div>
      )}
    </aside>
  );
}
