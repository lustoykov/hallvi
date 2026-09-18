"use client";

// Connecting a machine the owner already has: a VPS, or a Linux box at home.
//
// Host-key verification and an administrator's consent cannot disappear, so
// they are folded into one thing the owner does: paste one command on the
// machine. It installs this application's public key and prints one line that
// identifies the machine — user, SSH port, host-key fingerprint, system. The
// owner pastes that line back and never has to know what a fingerprint is;
// Hallvi still refuses any machine that does not present it.

import { useMemo, useState } from "react";

import {
  CheckList,
  CopyLine,
  Guide,
  ModeLine,
  Problem,
  useStagedChecks,
} from "./pieces";
import {
  isHomeAddress,
  type Check,
  type MachineFailure,
  type MachineLine,
  type MachineOutcome,
  type OnboardingTransport,
  type PermissionMode,
} from "./types";

/** The one command. Everything it does is listed under "What this does". */
export function machineCommand(publicKey: string) {
  return [
    `mkdir -p ~/.ssh && chmod 700 ~/.ssh`,
    `echo '${publicKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`,
    `set -- $SSH_CONNECTION; echo "hallvi-machine user=$(whoami) port=\${4:-22} key=$(ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | awk '{print $2}') os=$(. /etc/os-release; echo $ID-$VERSION_ID) arch=$(uname -m) addrs=$3,$(hostname -I | tr -s ' ' ',')"`,
  ].join(" && ");
}

/** Reads the printed line. Public details only; nothing in it is a secret. */
export function parseMachineLine(text: string): MachineLine | null {
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.startsWith("hallvi-machine "));
  if (!line) return null;
  const field = (name: string) =>
    new RegExp(`\\b${name}=(\\S+)`).exec(line)?.[1] ?? "";
  const fingerprint = field("key");
  const user = field("user");
  if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) return null;
  if (!/^[a-z_][a-z0-9_-]*$/.test(user)) return null;
  const addresses = [
    ...new Set(field("addrs").split(",").filter(Boolean)),
  ].filter((address) => /^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/.test(address));
  return {
    user,
    port: Number(field("port")) || 22,
    fingerprint,
    os: field("os") || "unknown",
    arch: field("arch") || "unknown",
    addresses,
  };
}

const PLAN: Check[] = [
  { id: "reach", label: "Something answers at that address", state: "pending" },
  {
    id: "identity",
    label: "It is the machine that printed your line",
    state: "pending",
  },
  { id: "signin", label: "It accepts Hallvi’s key", state: "pending" },
  { id: "admin", label: "Hallvi can act as administrator", state: "pending" },
  {
    id: "system",
    label: "The system is one Hallvi can run on",
    state: "pending",
  },
  { id: "docker", label: "Docker", state: "pending" },
];

const ORDER: MachineFailure[] = [
  "timeout",
  "refused",
  "wrong-machine",
  "key-refused",
  "sudo-password",
  "unsupported",
];
/** Which line of the plan each failure stops at. */
const STOPS: Record<MachineFailure, number> = {
  timeout: 0,
  refused: 0,
  "wrong-machine": 1,
  "key-refused": 2,
  "sudo-password": 3,
  unsupported: 4,
};

function settle(outcome: MachineOutcome, line: MachineLine): Check[] {
  const stop = outcome.kind === "failed" ? STOPS[outcome.at] : PLAN.length;
  const settled = PLAN.slice(0, stop).map((check): Check => ({
    ...check,
    state: "passed",
    ...(check.id === "system" ? { detail: `${line.os}, ${line.arch}` } : {}),
  }));
  if (outcome.kind === "failed")
    return [...settled, { ...PLAN[stop]!, state: "failed" }];
  settled[5] =
    outcome.docker === "present"
      ? { ...PLAN[5]!, state: "passed", detail: "Already installed." }
      : {
          ...PLAN[5]!,
          state: "noted",
          detail:
            "Not installed. Hallvi installs it as part of the deployment, under your permission setting.",
        };
  return [
    ...settled,
    {
      id: "room",
      label: "Room for the application",
      state: "passed",
      detail: `${(outcome.memoryMb / 1024).toFixed(1)} GB memory and ${outcome.diskGb} GB disk free.`,
    },
  ];
}

export function MachineConnect({
  transport,
  mode,
  publicKey,
  guideAt,
  onGuideAt,
  onConnected,
}: {
  transport: OnboardingTransport;
  mode: PermissionMode;
  /** This application's public key. The private half never leaves Hallvi. */
  publicKey: string;
  guideAt: number;
  onGuideAt: (step: number) => void;
  onConnected: (machine: { line: MachineLine; address: string }) => void;
}) {
  const [pasted, setPasted] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MachineFailure | null>(null);
  const [unexpected, setUnexpected] = useState<string | null>(null);
  const staged = useStagedChecks();
  const line = useMemo(() => parseMachineLine(pasted), [pasted]);
  const target = address || line?.addresses[0] || "";
  const home = target ? isHomeAddress(target) : false;

  const validate = async () => {
    if (!line || !target) return;
    setBusy(true);
    setFailure(null);
    setUnexpected(null);
    let outcome: MachineOutcome;
    try {
      outcome = await transport.checkMachine(line, target);
    } catch (problem) {
      setBusy(false);
      setUnexpected(
        problem instanceof Error
          ? problem.message
          : "The check did not finish.",
      );
      return;
    }
    await staged.play(
      [
        ...PLAN,
        { id: "room", label: "Room for the application", state: "pending" },
      ],
      settle(outcome, line),
    );
    setBusy(false);
    if (outcome.kind === "connected") onConnected({ line, address: target });
    else setFailure(outcome.at);
  };

  return (
    <div className="hv-ob-path">
      <div className="hv-ob-grant">
        <h4>What you are giving Hallvi</h4>
        <p>
          The ability to sign in to that machine as <b>one user</b> and run
          commands there, including as administrator. It uses a key made for
          this application only. Your password and your own keys are never asked
          for, and removing one line from <code>~/.ssh/authorized_keys</code>{" "}
          takes the access away.
        </p>
        <p className="hv-ob-fine">
          It needs 64-bit Linux that you can already sign in to, where you are
          root or can use sudo. Hallvi is tested on Ubuntu 24.04; it checks
          anything else before relying on it. Other software on the machine is
          left alone, but an administrator key can reach it, so a machine
          holding things you cannot afford to lose is a poor first choice.
        </p>
        <ModeLine
          mode={mode}
          action="install and start things on the machine"
        />
      </div>

      <Guide
        at={guideAt}
        onAt={onGuideAt}
        steps={[
          {
            title: "Open a terminal on the machine",
            body: (
              <>
                <p>
                  Sign in the way you normally do, as the user Hallvi should
                  work as. For a VPS that is usually{" "}
                  <code>ssh root@your-server-address</code> from this computer.
                  For a machine at home, sit at it or SSH in over your network.
                </p>
                <details className="hv-ob-more">
                  <summary>I have never signed in to it</summary>
                  <p>
                    Your provider&rsquo;s welcome email has the address and
                    first password, and its control panel usually has a
                    &ldquo;Console&rdquo; button that opens a terminal in the
                    browser. Either is enough for the next step.
                  </p>
                </details>
              </>
            ),
          },
          {
            title: "Paste this command there",
            body: (
              <>
                <CopyLine
                  block
                  value={machineCommand(publicKey)}
                  label="the command"
                />
                <details className="hv-ob-more">
                  <summary>What this does</summary>
                  <ol>
                    <li>
                      Makes sure your SSH folder exists with safe permissions.
                    </li>
                    <li>
                      Adds Hallvi&rsquo;s public key for this application to the
                      keys allowed to sign in as you. A public key is not a
                      secret.
                    </li>
                    <li>
                      Prints one line: your user name, the SSH port, this
                      machine&rsquo;s identity fingerprint, its system and its
                      addresses. It installs nothing and sends nothing.
                    </li>
                  </ol>
                </details>
                <p className="hv-ob-fine">
                  Keep that terminal open until Hallvi says it is connected. You
                  can come back for this command at any time; it does not
                  change.
                </p>
              </>
            ),
          },
          {
            title: "Paste the line it printed",
            body: (
              <>
                <label className="hv-ob-field">
                  <span>
                    The line starting with <code>hallvi-machine</code>
                  </span>
                  <textarea
                    rows={2}
                    spellCheck={false}
                    value={pasted}
                    onChange={(event) => {
                      setPasted(event.target.value);
                      setAddress("");
                      staged.clear();
                      setFailure(null);
                    }}
                    placeholder="hallvi-machine user=… port=… key=SHA256:… os=… arch=… addrs=…"
                  />
                </label>
                {pasted.trim() && !line && (
                  <p className="hv-ob-shape">
                    That is not the whole line. It starts with{" "}
                    <code>hallvi-machine</code> and contains{" "}
                    <code>key=SHA256:</code>. If the terminal printed an error
                    instead, paste that here and Hallvi will say what it means.
                  </p>
                )}
                {line && (
                  <>
                    <dl className="hv-ob-read">
                      <div>
                        <dt>Signs in as</dt>
                        <dd>{line.user}</dd>
                      </div>
                      <div>
                        <dt>System</dt>
                        <dd>
                          {line.os}, {line.arch}
                        </dd>
                      </div>
                      <div>
                        <dt>Identity</dt>
                        <dd title={line.fingerprint}>
                          {line.fingerprint.slice(0, 18)}…
                        </dd>
                      </div>
                    </dl>
                    <fieldset className="hv-ob-addresses">
                      <legend>Address Hallvi should use</legend>
                      {/* The address the owner signed in to is nearly always
                          the one. The rest are whatever the machine has,
                          Docker's own bridges included, so they wait. */}
                      {line.addresses
                        .filter(
                          (candidate, index) =>
                            index === 0 || candidate === address,
                        )
                        .map((candidate, index) => (
                          <label key={candidate}>
                            <input
                              type="radio"
                              name="hv-ob-address"
                              checked={target === candidate}
                              onChange={() => setAddress(candidate)}
                            />
                            <code>{candidate}</code>
                            {index === 0 && <em>the one you signed in to</em>}
                            {isHomeAddress(candidate) && <em>home network</em>}
                          </label>
                        ))}
                      {line.addresses.length > 1 && (
                        <details className="hv-ob-more">
                          <summary>
                            Other addresses this machine reported
                          </summary>
                          <p>
                            {line.addresses.slice(1).map((candidate) => (
                              <button
                                type="button"
                                className="hv-ob-quiet"
                                key={candidate}
                                onClick={() => setAddress(candidate)}
                              >
                                <code>{candidate}</code>
                              </button>
                            ))}
                          </p>
                        </details>
                      )}
                      <label>
                        Another
                        <input
                          type="text"
                          spellCheck={false}
                          placeholder="address or name"
                          value={
                            line.addresses.includes(address) ? "" : address
                          }
                          onChange={(event) => setAddress(event.target.value)}
                        />
                      </label>
                    </fieldset>
                    {home && (
                      <p className="hv-ob-note">
                        <b>{target}</b> is a home-network address. Hallvi can
                        reach it only while this computer is on the same
                        network, and the application will be reachable from this
                        computer and your network, not from the internet.
                      </p>
                    )}
                    <button
                      type="button"
                      className="hv-ob-primary"
                      disabled={busy || !target}
                      onClick={validate}
                    >
                      {busy
                        ? "Checking the machine…"
                        : failure
                          ? "Check again"
                          : "Check this machine"}
                    </button>
                  </>
                )}
              </>
            ),
          },
        ]}
      />

      {staged.checks.length > 0 && <CheckList checks={staged.checks} />}
      {unexpected && (
        <Problem title="The check could not be completed">
          <p>{unexpected} Nothing was saved. Check again in a moment.</p>
        </Problem>
      )}
      {failure && line && (
        <MachineProblem failure={failure} line={line} address={target} />
      )}
    </div>
  );
}

function MachineProblem({
  failure,
  line,
  address,
}: {
  failure: MachineFailure;
  line: MachineLine;
  address: string;
}) {
  const where = `${address}:${line.port}`;
  if (failure === "timeout")
    return (
      <Problem title={`Nothing answered at ${where}`}>
        <p>The machine never replied, so nothing about your key is known.</p>
        <ul>
          <li>
            A firewall, or your provider&rsquo;s security group, is not letting
            SSH in from this computer.
          </li>
          <li>
            The address is not the one this computer can reach. Try another
            above.
          </li>
          {isHomeAddress(address) && (
            <li>
              It is a home-network address: this computer has to be on the same
              network as the machine.
            </li>
          )}
        </ul>
      </Problem>
    );
  if (failure === "refused")
    return (
      <Problem title={`${address} answered, but not on port ${line.port}`}>
        <p>
          The machine is there and SSH is not listening where your line said. If
          you reach it through a forwarded port, change{" "}
          <code>port={line.port}</code> in the pasted line to the port you
          actually connect to, then check again.
        </p>
      </Problem>
    );
  if (failure === "wrong-machine")
    return (
      <Problem title="A different machine answered at that address">
        <p>
          Its identity does not match the line you pasted, so Hallvi stopped
          before offering its key. Nothing was saved. Usually the address
          belongs to another machine, or to a router forwarding somewhere else.
          Choose the address you actually signed in to.
        </p>
      </Problem>
    );
  if (failure === "key-refused")
    return (
      <Problem
        title={`It is the right machine, but it refused Hallvi’s key for ${line.user}`}
      >
        <p>
          The command has to run as the same user Hallvi signs in as. If you ran
          it with <code>sudo</code>, the key went to root instead: run it again
          without sudo, then check again. Some machines also turn key sign-in
          off; <code>PubkeyAuthentication yes</code> in{" "}
          <code>/etc/ssh/sshd_config</code> turns it on.
        </p>
      </Problem>
    );
  if (failure === "sudo-password")
    return (
      <Problem
        title={`Signed in as ${line.user}, but sudo asks for a password`}
      >
        <p>
          Hallvi cannot type one. Either run the command as root instead and
          paste the new line, or allow this user to use sudo without a password.
          Hallvi is connected to nothing until one of those is true.
        </p>
      </Problem>
    );
  return (
    <Problem title={`Hallvi cannot run on ${line.os}, ${line.arch} yet`}>
      <p>
        It needs 64-bit Linux that Docker supports (x86_64 or arm64). Nothing
        was changed on the machine beyond the key you added; remove its line
        from <code>~/.ssh/authorized_keys</code> to take that back.
      </p>
    </Problem>
  );
}

export { ORDER as MACHINE_FAILURES };
