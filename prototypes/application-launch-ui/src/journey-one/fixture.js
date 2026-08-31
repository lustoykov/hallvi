// Launch Vertical fixture — the single source of truth for the two-speed prototype.
//
// Design contract (see DESIGN-RATIONALE.md):
// - One identity table for every surface (fixes review finding F-14).
// - Every beat carries an explicit per-check gate state; nothing is derived
//   from an ordinal progress integer (fixes F-3).
// - Every activity/evidence item carries its own timestamp (fixes F-13).
// - Branch-specific unresolved workshop choices are carried as data here;
//   the canonical U1-U16 registry lives in journeyOneModel.js.
//
// A "beat" is one Pi chat message plus (optionally) one typed card. The
// script is a pure function of (mode, choices, outcomes): user decisions and
// prototype outcome switches compose different beat sequences. The engine
// always advances to the beat after the current one in the freshly built
// script, so branches simply insert beats.

export const identity = {
  application: "northstar",
  repo: "github.com/lyubomir/northstar",
  branch: "main",
  startRevision: "4d8be91",
  eligibleRevision: "8c14d72",
  profile: "Next.js + PostgreSQL",
  prNumber: 42,
  prBranch: "server-guy/conformance",
  host: {
    name: "northstar-prod-01",
    id: "59301844",
    ip: "49.12.118.42",
    machine: "cx32 · 8 GB · 4 vCPU",
    region: "Nuremberg · eu-central",
    image: "Ubuntu 24.04",
    monthly: "€9.49 / month",
    op: "op-984233",
  },
  hostname: "northstar.dev",
  fallbackHostname: "app.northstar.dev",
  conflictTarget: "203.0.113.18",
  nameservers: ["dale.ns.cloudflare.com", "lucy.ns.cloudflare.com"],
  dnsChange: "cf_92a1",
  vantages: ["Sofia", "Frankfurt"],
  imageDigest: "ghcr.io/northstar/web@sha256:7bf…91a",
  configIdentity: "server-guy.yaml · digest 2b9…0cf",
  release: "rel_01J…Q9",
  bundle: "evb_01J…AA",
};

// Branch-specific product-owner choices used by the fixture.
// The prototype shows these as open; it must never settle them.
export const U = {
  U1: "Minimum operational baseline before Server Guy may say “live” (backup restore proof, logs, telemetry) is an open product decision.",
  U2: "Whether V1 supports one Application Profile or both Next.js and FastAPI is an open product decision.",
  U3: "Whether the Application Contract must be explicitly confirmed before paid work in every Approval Mode is an open product decision.",
  U4: "Which account actions (if any) remain user-only even in Full Autonomy is an open product decision.",
};

const D = "2026-08-31";
const ts = (t) => `${D} · ${t} UTC`;

// ---- hood item helpers -----------------------------------------------------
let seq = 0;
const iid = (p) => `${p}-${++seq}`;
const fact = (label, value, provenance) => ({ id: iid("f"), label, value, provenance });
const dec = (label, value, origin) => ({ id: iid("d"), label, value, origin });
const act = (time, kind, title, detail, status) => ({ id: iid("a"), time: ts(time), kind, title, detail, status });
const chg = (time, scope, title, detail, hero) => ({ id: iid("c"), time: ts(time), scope, title, detail, hero });
const ev = (time, source, method, title, raw, hero, note) => ({ id: iid("e"), time: ts(time), source, method, title, raw, hero, note });

// ---- beat helper -----------------------------------------------------------
function beat(config) {
  return {
    kind: "narration",
    status: null,
    gate: ["pass", "pass", "pass"],
    hood: {},
    openDecisions: [],
    detailsTab: "activity",
    ...config,
  };
}

// ---- hero destinations (the four mocked "go to the metal" views) ----------
export const heroes = {
  hetzner: {
    title: `Hetzner · ${identity.host.name}`,
    subtitle: "Exact provider object and latest API readback (mocked destination)",
    meta: [
      ["Provider ID", identity.host.id],
      ["Public IPv4", identity.host.ip],
      ["Machine", identity.host.machine],
      ["Region", identity.host.region],
      ["Image", identity.host.image],
      ["Actual cost", identity.host.monthly],
    ],
    raw: JSON.stringify({ operation: identity.host.op, object: identity.host.id, status: "running", observed_at: `${D}T10:24:18Z` }, null, 2),
  },
  terminal: {
    title: "northstar-prod-01 · SSH session",
    subtitle: `root@${identity.host.ip} · scoped operations shell (mocked destination)`,
    lines: [
      "$ ssh operator@49.12.118.42",
      "Welcome to Ubuntu 24.04 LTS (northstar-prod-01)",
      "$ systemctl status northstar-web --no-pager | head -3",
      "● northstar-web.service - northstar web (release 8c14d72)",
      "     Active: active (running) since 10:41:07 UTC; 2min ago",
      "   Main PID: 4127 (node)",
      "$ docker image inspect ghcr.io/northstar/web --format '{{index .RepoDigests 0}}'",
      "ghcr.io/northstar/web@sha256:7bf…91a",
      "$ df -h / | tail -1",
      "/dev/sda1        76G  8.2G   64G  12% /",
      "$ █",
    ],
  },
  dns: {
    title: "Cloudflare · northstar.dev DNS records",
    subtitle: "Zone view as the provider console would show it (mocked destination)",
    table: [
      ["Type", "Name", "Content", "Proxy", "Changed"],
      ["A", "northstar.dev", identity.host.ip, "DNS only during verification", ts("10:31:12")],
      ["CAA", "northstar.dev", "0 issue letsencrypt.org", "—", ts("10:31:12")],
      ["NS", "(zone)", identity.nameservers.join(" · "), "—", "authoritative"],
    ],
  },
  pr: {
    title: `Pull Request #${identity.prNumber} · Make app Server Guy conformant`,
    subtitle: `${identity.repo} · ${identity.prBranch} → main (mocked destination)`,
    meta: [
      ["Head commit", identity.eligibleRevision],
      ["Changed files", "5 files · +118 −6"],
      ["Checks", "14 passed · profile smoke passed"],
      ["Author", "Pi (Server Guy) — engineer review required"],
    ],
    files: [
      "app/api/health/route.ts        +42",
      "lib/logging/envelope.ts        +51",
      "server-guy.yaml                +19",
      "package.json                   +4 −2",
      "app/instrumentation.ts         +2 −4",
    ],
  },
  probe: {
    title: "External probe · raw result",
    subtitle: "Captured observation artifact (mocked destination)",
    raw: JSON.stringify(
      {
        artifact: "observation://sentinel/northstar/obs_01J8M7N4Q9",
        target: "https://northstar.dev/api/health",
        vantage: "Sofia",
        observed_at: `${D}T10:46:12Z`,
        tls: { valid: true, protocol: "TLS 1.3", subject: "northstar.dev" },
        http: { status: 200, latency_ms: 184 },
        body: { status: "ok", release: "8c14d72" },
        scope: "point-in-time · supports only this check at this moment",
      },
      null,
      2,
    ),
  },
};

// ---------------------------------------------------------------------------
// The script builder.
// choices: { domainPath, worker, conflictResolution, restoreDecision }
// outcomes: { conformance, dnsConflict, propagation, verification, restore }
// ---------------------------------------------------------------------------
export function buildScript({ mode, choices, outcomes }) {
  seq = 0; // stable hood ids per rebuild
  const alwaysAsk = mode === "Always Ask";
  const autonomy = mode === "Full Autonomy";
  const beats = [];
  const finalHostname =
    outcomes.dnsConflict && choices.conflictResolution === "subdomain"
      ? identity.fallbackHostname
      : identity.hostname;

  // ---------------- Phase 1 · Start ----------------------------------------
  beats.push(
    beat({
      id: "start-input",
      phase: 1,
      kind: "input",
      status: "Needs input",
      gate: ["current", "required", "required"],
      pi: "Before I inspect anything, confirm the repository and target environment, then choose when I should ask for approval. I will only read the repository until this brief is complete.",
      card: {
        repo: identity.repo,
        environment: "Production",
      },
      actions: [{ label: "Create application workspace", form: "start" }],
      resolvedLine: `Launch Brief recorded — ${identity.repo} · Production`,
      hood: {
        record: [
          fact("Repository", identity.repo, "Engineer input"),
          fact("Environment", "Production", "Engineer input"),
        ],
      },
      detailsTab: "record",
    }),
    beat({
      id: "workspace-ready",
      phase: 1,
      pi: "Your workspace is durable now — if this laptop closes, the launch resumes from here. Next I will read the repository and tell you what I think this application needs. I will not create anything paid without you seeing it first.",
      resolvedLine: "Workspace created · Operator Session durable",
      hood: {
        record: [fact("Operator Session", "launch_01J…7A", "Recorded")],
        activity: [
          act("09:41:05", "Inspect", "Validated GitHub access", "Repository metadata and default branch readable", "passed"),
          act("09:41:09", "Record", "Operator Session persisted", "Application identity, environment, mode, and intent stored", "recorded"),
        ],
        evidence: [ev("09:41:05", "GitHub API", "GET /repos/lyubomir/northstar", "Repository readable", "200 · default branch main @ " + identity.startRevision)],
      },
    }),
  );

  // ---------------- Phase 2 · Inspect app -----------------------------------
  beats.push(
    beat({
      id: "contract",
      phase: 2,
      pi:
        "I read the repository. It matches the supported Next.js + PostgreSQL profile. I drafted the operational contract — most fields come straight from the repository, four are my inference, and the migration command is genuinely unknown. The unknown stays visible; my confidence does not erase it. Correct anything, or continue.",
      resolvedLine: "Application Contract drafted · profile matched · 1 visible unknown",
      openDecisions: [
        { id: "U2", text: U.U2 },
        { id: "U3", text: U.U3 },
      ],
      hood: {
        record: [
          fact("Application Profile", identity.profile, "Matched"),
          fact("Web command", "pnpm start", "Repository-declared"),
          fact("Health path", "/api/health", outcomes.conformance === "clean" ? "Repository-declared" : "Proposed — endpoint missing"),
          fact("Migration command", "Unknown", "Needs input · visible unknown"),
        ],
        activity: [
          act("09:42:18", "Inspect", "Read repository manifests", "42 files inspected · package.json, lockfile, Docker files", "passed"),
          act("09:42:31", "Inspect", "Resolved Application Profile", `${identity.profile} matched`, "passed"),
          act("09:42:44", "Inspect", "Searched health contract", outcomes.conformance === "clean" ? "GET /api/health found and responding in dev" : "No supported health endpoint found", outcomes.conformance === "clean" ? "passed" : "attention"),
        ],
        evidence: [ev("09:42:31", "Profile resolver", "Deterministic field comparison", "Profile match result", `${identity.profile} · matched with ${outcomes.conformance === "clean" ? "0 required gaps" : "1 required gap (health endpoint)"}`)],
      },
      detailsTab: "record",
    }),
  );

  // ---------------- Phase 3 · Make launch-ready -----------------------------
  if (outcomes.conformance === "clean") {
    beats.push(
      beat({
        id: "conform-clean",
        phase: 3,
        pi: `Profile checks pass for revision ${identity.eligibleRevision} on main — no repository changes are needed. This exact revision is what I will launch; a newer commit would be a different candidate.`,
        resolvedLine: `Conformance clean · revision ${identity.eligibleRevision} eligible`,
        hood: {
          record: [fact("Eligible revision", identity.eligibleRevision, "Profile checks passed")],
          activity: [act("09:44:02", "Verify", "Ran profile conformance checks", "Health contract, logging shape, deploy manifest", "passed")],
          evidence: [ev("09:44:02", "Server Guy checks", "Deterministic profile suite", "Conformance result", `revision ${identity.eligibleRevision} · 3/3 checks passed`)],
        },
      }),
    );
  } else {
    beats.push(
      beat({
        id: "conform-choose",
        phase: 3,
        kind: "choice",
        status: "Needs input",
        gate: ["current", "required", "required"],
        pi: "One thing blocks a supported launch: the application has no health endpoint, and the profile requires one. This is application code, so it needs a reviewable change — I can implement it here, or you can hand the same bounded brief to another environment. Either way I re-check the result myself.",
        card: {
          title: "Where should the repository work happen?",
          brief: `Add /api/health, logging envelope, server-guy.yaml · start from ${identity.startRevision} · no provider or production changes`,
          options: [
            { label: "Continue with Server Guy", sub: "Pi implements and tests here (recommended)", set: { worker: "Server Guy" } },
            { label: "Open in Codex", sub: "Dedicated coding harness, same brief", set: { worker: "Codex" } },
            { label: "I’ll do it myself", sub: "Manual work, same acceptance checks", set: { worker: "You" } },
          ],
        },
        resolvedLine: `Repository work → ${choices.worker || "…"}`,
        hood: {
          record: [fact("Conformance gap", "Health endpoint missing", "Profile check failed")],
        },
        detailsTab: "record",
      }),
      beat({
        id: "conform-working",
        phase: 3,
        status: "Acting",
        gate: ["current", "required", "required"],
        pi:
          choices.worker === "Server Guy" || !choices.worker
            ? `I am implementing the change on branch ${identity.prBranch}, starting from ${identity.startRevision}. Closing this view never cancels the work.`
            : `${choices.worker} is working from the same bounded brief on ${identity.prBranch}. I stay available here, and I will run my own checks on whatever comes back.`,
        actions: [{ label: "Work finished — show the result" }],
        resolvedLine: `Repository work completed by ${choices.worker || "Server Guy"}`,
        hood: {
          activity: [
            act("09:46:10", "Handoff", "Bounded brief delivered", "Goal, evidence, acceptance checks, and boundaries", "recorded"),
            act("09:47:55", "Change", "Implementation in progress", `branch ${identity.prBranch} from ${identity.startRevision}`, "active"),
          ],
        },
      }),
      beat({
        id: "conform-returned",
        phase: 3,
        kind: "task",
        status: "Needs input",
        gate: ["current", "current", "required"],
        pi: `${choices.worker || "Server Guy"} returned the change and I ran my own contract checks on it — they pass, separately from the worker's own test evidence. Pull Request #${identity.prNumber} is ready. Merging stays your call.`,
        card: {
          title: `Review Pull Request #${identity.prNumber}`,
          rows: [
            ["Branch", `${identity.prBranch} → main`],
            ["Change", "5 files · +118 −6"],
            ["Worker evidence", "8 repository tests passed"],
            ["Server Guy checks", "Profile + health contract passed (independent)"],
          ],
          secondary: { label: "Open pull request", hero: "pr" },
        },
        actions: [{ label: `Merge PR #${identity.prNumber}` }],
        resolvedLine: `PR #${identity.prNumber} merged → revision ${identity.eligibleRevision}`,
        hood: {
          changes: [chg("09:52:30", "Repository", `Pull Request #${identity.prNumber}`, `5 files · +118 −6 · ${identity.prBranch}`, "pr")],
          evidence: [
            ev("09:52:41", "Worker harness", "Repository test run", "Worker-supplied evidence", "8 tests passed", null, "Worker claim — verified separately below"),
            ev("09:53:12", "Server Guy checks", "Deterministic profile suite", "Independent re-verification", "profile + health contract passed on PR head"),
          ],
        },
        detailsTab: "changes",
      }),
      beat({
        id: "conform-merged",
        phase: 3,
        pi: `Merged. Revision ${identity.eligibleRevision} on main passes every profile check and is the exact candidate for this launch.`,
        resolvedLine: `Conformance complete · revision ${identity.eligibleRevision} eligible`,
        hood: {
          record: [fact("Eligible revision", identity.eligibleRevision, "Merged · profile checks passed")],
          activity: [act("09:54:20", "Verify", "Re-ran profile checks on merged revision", `main @ ${identity.eligibleRevision}`, "passed")],
        },
      }),
    );
  }

  // ---------------- Phase 4 · Review launch plan ----------------------------
  beats.push(
    beat({
      id: "plan",
      phase: 4,
      pi:
        "Here is the whole plan before anything costs money: one small Hetzner server behind Cloudflare, PostgreSQL on the host, verification through your real hostname from outside. You connect Hetzner and handle the domain step; I do the rest. Estimated cost €9.49/month. The one real risk is DNS propagation time.",
      resolvedLine: "Launch Plan reviewed · ~€9.49/month · actions separated",
      hood: {
        record: [
          fact("Topology", "Cloudflare → Hetzner VPS → app + PostgreSQL", "Proposed"),
          fact("Estimated cost", identity.host.monthly, "Provider estimate"),
          fact("Your part", "Hetzner access · domain step", "Plan"),
          fact("My part", "Provision, configure, deploy, verify", "Plan"),
        ],
        activity: [act("09:55:40", "Plan", "Launch intent drafted", `Based on contract ${identity.eligibleRevision} and cost preference`, "recorded")],
      },
      detailsTab: "record",
    }),
  );

  // ---------------- Phase 5 · Set up server ---------------------------------
  beats.push(
    beat({
      id: "hetzner-connect",
      phase: 5,
      kind: "task",
      status: "Needs input",
      gate: ["current", "required", "required"],
      pi: "I need scoped Hetzner access: read project, read pricing, create server. I never ask for master credentials, and connecting does not authorize any resource — you will see the exact machine and cost before anything is created.",
      card: {
        title: "Connect Hetzner",
        rows: [
          ["Scope requested", "read project · read pricing · create server"],
          ["Master credentials", "Never requested — boundary"],
          ["Authorizes", "Nothing by itself"],
        ],
      },
      actions: [{ label: "Connect Hetzner (mock)" }],
      resolvedLine: "Hetzner connected · scoped access validated",
      hood: {
        activity: [act("10:16:04", "Inspect", "Validated provider access", "Project readable · 0 existing servers · pricing readable", "passed")],
        evidence: [ev("10:16:04", "Hetzner API", "GET /v1/servers · GET /v1/pricing", "Access validation", "project p_4821 · existing_servers=0 · cx32 €9.49/month")],
      },
    }),
  );

  if (autonomy) {
    beats.push(
      beat({
        id: "vps-notice",
        phase: 5,
        kind: "notice",
        gate: ["pass", "pass", "current"],
        pi: `Under Full Autonomy I created the server without asking: ${identity.host.machine}, ${identity.host.region}, ${identity.host.monthly}. The receipt is in the sidebar. Note: whether paid actions should stay user-gated even in this mode is an open product decision — this prototype does not settle it.`,
        openDecisions: [{ id: "U4", text: U.U4 }],
        resolvedLine: `Server created under Full Autonomy · ${identity.host.monthly}`,
        hood: {
          activity: [act("10:18:42", "Change", "Create server", `POST /v1/servers · ${identity.host.op}`, "passed")],
          changes: [chg("10:18:42", "Provider", `Hetzner server ${identity.host.name}`, `${identity.host.machine} · ${identity.host.region} · ${identity.host.monthly}`)],
          evidence: [ev("10:18:42", "Hetzner API", "POST /v1/servers", "Provider receipt", `HTTP 201 · ${identity.host.op} · server ${identity.host.id}`)],
        },
        detailsTab: "changes",
      }),
    );
  } else {
    beats.push(
      beat({
        id: "vps-approve",
        phase: 5,
        kind: "approval",
        status: "Awaiting approval",
        gate: ["current", "required", "required"],
        pi:
          mode === "Always Ask"
            ? "Your mode requires approval before every state-changing operation. This one starts billing, so here is exactly what would exist and what would not."
            : "I decide when to ask in this mode — and a paid resource always warrants asking. Here is exactly what would exist and what would not.",
        card: {
          title: "Create Hetzner server",
          cost: identity.host.monthly + " · billing starts on provider acceptance",
          rows: [
            ["Machine", identity.host.machine],
            ["Region", identity.host.region],
            ["Image", identity.host.image],
            ["Creates", "One Ubuntu 24.04 VPS — nothing else"],
            ["Does not create", "Domain, DNS records, or certificates"],
            ["If you reject", "No provider state changes"],
          ],
        },
        actions: [
          { label: "Approve — create server", tone: "primary" },
          { label: "Reject", tone: "reject" },
        ],
        resolvedLine: `Approved: create server · ${identity.host.monthly} (${mode})`,
        hood: {
          record: [fact("Approval", `Create server · bound to ${identity.host.machine} · ${identity.host.monthly}`, `Mode in force: ${mode}`)],
          evidence: [ev("10:17:10", "Hetzner API", "GET /v1/pricing", "Live price at approval", "cx32 €9.49/month · observed before the decision")],
        },
        detailsTab: "record",
      }),
    );
  }

  beats.push(
    beat({
      id: "host-ready",
      phase: 5,
      pi: `The server exists and answers: ${identity.host.name} at ${identity.host.ip}, running, SSH reachable, actual cost ${identity.host.monthly}. No DNS or domain state changed while creating it — that is a separate step you control.`,
      resolvedLine: `Host ready · ${identity.host.name} · ${identity.host.ip}`,
      hood: {
        record: [
          fact("Server", `${identity.host.name} · ${identity.host.id}`, "Hetzner"),
          fact("Public IP", identity.host.ip, "Observed"),
          fact("Recurring cost", identity.host.monthly, "Provider · actual"),
        ],
        activity: [
          act("10:18:42", "Change", "Create server", `HTTP 201 · ${identity.host.op}`, "passed"),
          act("10:19:31", "Inspect", "Observed server running", "Provider state running · SSH port reachable", "passed"),
        ],
        changes: [chg("10:18:42", "Provider", `Hetzner server ${identity.host.name}`, `${identity.host.machine} · ${identity.host.region} · ${identity.host.monthly}`)],
        evidence: [
          ev("10:18:42", "Hetzner API", "POST /v1/servers", "Provider receipt", `HTTP 201 · ${identity.host.op} · server ${identity.host.id} · ipv4 ${identity.host.ip}`),
          ev("10:19:31", "Server Guy probe", "TCP 22 from control plane", "Host reachability", "open · 12 ms", "terminal"),
        ],
      },
      detailsTab: "evidence",
    }),
  );

  // ---------------- Phase 6 · Connect domain -------------------------------
  beats.push(
    beat({
      id: "domain-choose",
      phase: 6,
      kind: "choice",
      status: "Needs input",
      gate: ["current", "required", "required"],
      pi: "Now the public hostname. I will not guess about ownership — tell me where the domain stands, and I will verify control before touching DNS or HTTPS.",
      card: {
        title: `Use ${identity.hostname} — where does it live?`,
        options: [
          { label: "Already on Cloudflare", sub: "Zone exists and Cloudflare is authoritative", set: { domainPath: "cloudflare" } },
          { label: "Registered elsewhere", sub: "e.g. Namecheap — I’ll guide nameserver delegation", set: { domainPath: "elsewhere" } },
          { label: "I don’t own a domain yet", sub: "Guided acquisition — checkout stays yours", set: { domainPath: "none" } },
        ],
      },
      resolvedLine: `Domain path: ${choices.domainPath === "elsewhere" ? "registered elsewhere" : choices.domainPath === "none" ? "acquire new" : choices.domainPath === "cloudflare" ? "already on Cloudflare" : "…"} · ${identity.hostname}`,
      hood: {
        record: [fact("Intended hostname", identity.hostname, "Engineer input")],
      },
      detailsTab: "record",
    }),
  );

  if (choices.domainPath === "elsewhere") {
    beats.push(
      beat({
        id: "ns-task",
        phase: 6,
        kind: "task",
        status: "Needs input",
        gate: ["current", "required", "required"],
        pi: "The domain is at Namecheap and Cloudflare is not authoritative yet. This account step is yours — replace the nameservers below, then come back. I will detect the change externally; your registrar form submission alone proves nothing.",
        card: {
          title: "At Namecheap, set exactly these nameservers",
          rows: [
            ["Nameserver 1", identity.nameservers[0]],
            ["Nameserver 2", identity.nameservers[1]],
            ["Remove", "All other nameservers — mixed delegation breaks authority"],
          ],
        },
        actions: [{ label: "I’ve updated the nameservers" }],
        resolvedLine: "Nameserver change reported at Namecheap",
        hood: {
          activity: [act("10:24:08", "Inspect", "Checked authoritative NS", "Namecheap BasicDNS still authoritative", "attention")],
          evidence: [ev("10:24:08", "External DNS", "NS query via public resolvers", "Authority check", "namecheap basicdns · cloudflare not observed")],
        },
      }),
      beat({
        id: "ns-wait-1",
        phase: 6,
        status: "Waiting externally",
        gate: ["current", "required", "blocked"],
        pi: "You reported the change, but the world still answers with Namecheap nameservers — so I am waiting, not acting. Nothing I could click makes propagation faster; I re-check on a timer and the moment authority appears, I continue.",
        actions: [{ label: "Check again now" }],
        resolvedLine: "Waited through NS propagation",
        hood: {
          activity: [act("10:25:12", "Inspect", "Re-checked authoritative NS", "Still Namecheap · next automatic check ~60 s", "attention")],
          evidence: [ev("10:25:12", "External DNS", "NS query · 2 resolvers", "Authority check (appended)", "namecheap basicdns · unchanged")],
        },
        detailsTab: "evidence",
      }),
    );
    if (outcomes.propagation === "slow") {
      beats.push(
        beat({
          id: "ns-wait-2",
          phase: 6,
          status: "Waiting externally",
          gate: ["current", "required", "blocked"],
          pi: "Checked again — still Namecheap. Each check is appended to the record, not overwritten, so you can see exactly how long this took. Still nothing for me to safely do.",
          actions: [{ label: "Check again now" }],
          resolvedLine: "Second propagation check · still waiting",
          hood: {
            activity: [act("10:31:40", "Inspect", "Re-checked authoritative NS", "Still Namecheap · elapsed 7m 32s", "attention")],
            evidence: [ev("10:31:40", "External DNS", "NS query · 2 resolvers", "Authority check (appended)", "namecheap basicdns · unchanged")],
          },
          detailsTab: "evidence",
        }),
      );
    }
    beats.push(
      beat({
        id: "ns-observed",
        phase: 6,
        gate: ["pass", "required", "current"],
        pi: "Cloudflare nameservers are now observed externally — control is real, not reported. I can configure the route.",
        resolvedLine: "Cloudflare authority observed externally",
        hood: {
          activity: [act("10:29:55", "Inspect", "Observed Cloudflare authority", `NS + SOA answer with ${identity.nameservers[0]}`, "passed")],
          evidence: [ev("10:29:55", "External DNS", "NS + SOA query", "Domain control observed", `${identity.nameservers.join(" · ")} authoritative`)],
        },
        detailsTab: "evidence",
      }),
    );
  } else if (choices.domainPath === "none") {
    beats.push(
      beat({
        id: "acquire-task",
        phase: 6,
        kind: "task",
        status: "Needs input",
        gate: ["current", "required", "required"],
        pi: "Acquiring the domain is your account step — checkout stays in your hands, I never automate a purchase. Complete it in Cloudflare, and I resume the moment the zone appears in your account.",
        card: {
          title: "Acquire the domain (user-owned step)",
          rows: [
            ["Where", "Your Cloudflare account · registrar flow"],
            ["Checkout", "Yours — Server Guy never sees payment"],
            ["Resume condition", "Zone observable in your account"],
          ],
        },
        actions: [{ label: "Done — the domain is in my account (mock)" }],
        resolvedLine: "Domain acquired · zone observable",
        hood: {
          activity: [act("10:27:20", "Inspect", "Observed new zone", `${identity.hostname} present · Cloudflare authoritative`, "passed")],
          evidence: [ev("10:27:20", "Cloudflare API", "GET /zones", "Zone + control observed", `${identity.hostname} · active · authoritative`)],
        },
      }),
    );
  }

  if (outcomes.dnsConflict) {
    beats.push(
      beat({
        id: "dns-conflict",
        phase: 6,
        kind: "blocker",
        status: "Blocked",
        gate: ["pass", "required", "blocked"],
        pi: `Stop — an A record already points ${identity.hostname} to ${identity.conflictTarget}, and something may be serving real users there. I refuse to overwrite it silently. Your call: move the apex to the new server, or launch on ${identity.fallbackHostname} and leave the existing record alone.`,
        card: {
          title: "Existing DNS record conflicts with the planned route",
          rows: [
            ["Existing", `A ${identity.hostname} → ${identity.conflictTarget}`],
            ["Planned", `A ${identity.hostname} → ${identity.host.ip}`],
            ["Risk", "The existing target may be serving traffic"],
          ],
          options: [
            { label: `Use ${identity.fallbackHostname} instead`, sub: "Existing record untouched", set: { conflictResolution: "subdomain" } },
            { label: "Replace the apex record", sub: "Conscious overwrite — impact accepted", set: { conflictResolution: "replace" } },
          ],
        },
        resolvedLine:
          choices.conflictResolution === "replace"
            ? "Conflict resolved: replace apex record (conscious decision)"
            : `Conflict resolved: launch at ${identity.fallbackHostname}`,
        hood: {
          activity: [act("10:30:12", "Inspect", "DNS conflict detected", `Existing apex differs from planned host`, "blocked")],
          evidence: [
            ev("10:30:12", "Cloudflare API", "GET /zones/…/dns_records", "Existing record", `A ${identity.hostname} → ${identity.conflictTarget}`),
            ev("10:30:14", "External DNS", "A query via public resolver", "Public answer matches", identity.conflictTarget),
          ],
        },
        detailsTab: "evidence",
      }),
    );
  }

  if (alwaysAsk) {
    beats.push(
      beat({
        id: "dns-approve",
        phase: 6,
        kind: "approval",
        status: "Awaiting approval",
        gate: ["pass", "current", "required"],
        pi: "Your mode gates every state-changing operation, and writing DNS is one. One A record and HTTPS provisioning — nothing else.",
        card: {
          title: "Write DNS route and enable HTTPS",
          rows: [
            ["Writes", `A ${finalHostname} → ${identity.host.ip}`],
            ["Enables", "Cloudflare certificate for " + finalHostname],
            ["Does not touch", "Any other record in the zone"],
          ],
        },
        actions: [
          { label: "Approve — write route", tone: "primary" },
          { label: "Reject", tone: "reject" },
        ],
        resolvedLine: "Approved: DNS route + HTTPS (Always Ask)",
        hood: { record: [fact("Approval", `DNS write bound to A ${finalHostname} → ${identity.host.ip}`, "Mode in force: Always Ask")] },
        detailsTab: "record",
      }),
    );
  }

  beats.push(
    beat({
      id: "route-verified",
      phase: 6,
      status: "Verified",
      pi: `The route is live and I verified it from outside: ${finalHostname} resolves through Cloudflare to ${identity.host.ip}, the certificate is valid TLS 1.3, and probes from ${identity.vantages.join(" and ")} both answer. Verified means externally observed — not “I clicked save”. The application itself is not live yet; no Release exists.`,
      resolvedLine: `Public route verified · https://${finalHostname}`,
      hood: {
        record: [fact("Public route", `https://${finalHostname}`, "Externally verified")],
        activity: [
          act("10:31:12", "Change", "Created DNS record", `A ${finalHostname} → ${identity.host.ip} · change ${identity.dnsChange}`, "passed"),
          act("10:33:47", "Change", "Provisioned HTTPS", "Certificate issued · TLS 1.3", "passed"),
          act("10:34:20", "Verify", "External route verification", `2 vantage points · DNS + TLS + HTTP`, "passed"),
        ],
        changes: [chg("10:31:12", "Provider", `DNS record on ${finalHostname}`, `A → ${identity.host.ip} · change ${identity.dnsChange}`, "dns")],
        evidence: [
          ev("10:31:12", "Cloudflare API", "POST /dns_records", "DNS write receipt", `change ${identity.dnsChange} accepted`),
          ev("10:34:20", "External probe · Sofia", "HTTPS GET /", "Route verification", `200 via Cloudflare · TLS 1.3 valid for ${finalHostname}`, "probe"),
          ev("10:34:22", "External probe · Frankfurt", "HTTPS GET /", "Route verification (2nd vantage)", "200 via Cloudflare · TLS 1.3 valid"),
        ],
      },
      detailsTab: "evidence",
    }),
  );

  // ---------------- Phase 7 · Configure and protect ------------------------
  if (alwaysAsk) {
    beats.push(
      beat({
        id: "ops-approve",
        phase: 7,
        kind: "approval",
        status: "Awaiting approval",
        gate: ["current", "required", "required"],
        pi: "Configuring your host is state-changing, so your mode asks first. This is everything the baseline touches — on your machine only, nothing public changes.",
        card: {
          title: "Configure the operational baseline",
          rows: [
            ["Touches", `${identity.host.name} only`],
            ["Installs", "Runtime, PostgreSQL, log intake, telemetry, sentinel"],
            ["Secrets", "6 references delivered — values never shown or stored in chat"],
          ],
        },
        actions: [
          { label: "Approve — configure host", tone: "primary" },
          { label: "Reject", tone: "reject" },
        ],
        resolvedLine: "Approved: configure operational baseline (Always Ask)",
        hood: { record: [fact("Approval", "Host configuration bound to northstar-prod-01", "Mode in force: Always Ask")] },
      }),
    );
  }

  beats.push(
    beat({
      id: "baseline",
      phase: 7,
      gate: outcomes.restore === "verified" ? ["pass", "pass", "pass"] : ["pass", "blocked", "pass"],
      status: outcomes.restore === "verified" ? null : "Blocked",
      pi:
        outcomes.restore === "verified"
          ? "The environment is ready: runtime and PostgreSQL up, six secret references delivered (values never touch this chat), daily backups configured and a restore actually verified in an isolated database, structured logs and telemetry flowing, external sentinel watching. Every claim in the sidebar has its own evidence."
          : "Almost ready — one honest gap: backups run daily and last night's backup exists, but no restore has ever been proven, so I will not call your data protected. Whether an unproven restore blocks the word “live” is an open product decision; what is not open is pretending.",
      kind: outcomes.restore === "verified" ? "narration" : "blocker",
      card:
        outcomes.restore === "verified"
          ? undefined
          : {
              title: "Backups exist · restore unproven",
              rows: [
                ["Backup", "Daily 02:00 UTC · last object 184 MB · off-host store"],
                ["Restore proof", "Never performed"],
                ["Meaning", "Recoverability is a claim without evidence"],
              ],
              options: [
                { label: "Run restore verification", sub: "Isolated database · produces real evidence", set: { restoreDecision: "run" } },
                { label: "Accept as a visible gap", sub: "Carries into handoff with an owner", set: { restoreDecision: "accept" } },
              ],
            },
      openDecisions: outcomes.restore === "verified" ? [] : [{ id: "U1", text: U.U1 }],
      resolvedLine:
        outcomes.restore === "verified"
          ? "Operational baseline ready · restore verified"
          : choices.restoreDecision === "accept"
            ? "Baseline ready · restore gap accepted (visible)"
            : "Restore verification requested",
      hood: {
        record: [
          fact("Runtime", "web + worker ready", "Verified on host"),
          fact("Database", "PostgreSQL 17 ready", "Verified on host"),
          fact("Secrets", "6 references resolved · values hidden", "Recorded"),
          fact("Sentinel", "External observation active", "Verified"),
          fact("Backups", outcomes.restore === "verified" ? "Daily · restore verified" : "Daily · restore UNPROVEN", outcomes.restore === "verified" ? "Evidence below" : "Gap — see decision"),
        ],
        activity: [
          act("10:37:02", "Change", "Hardened host", "Firewall · service account · only required ingress", "passed"),
          act("10:38:16", "Change", "Configured PostgreSQL", "Volume attached · service ready", "passed"),
          act("10:39:04", "Change", "Installed runtime + log intake + telemetry", "Container runtime · structured events flowing", "passed"),
          act("10:39:52", "Change", "Deployed external sentinel", "Public health path watched from outside", "passed"),
        ],
        changes: [chg("10:38:16", "Host", "Operational baseline on northstar-prod-01", "runtime · database · secrets · backups · logs · telemetry · sentinel", "terminal")],
        evidence: [
          ev("10:39:52", "Sentinel", "External HTTPS probe", "Sentinel first observation", "route answering · watching /api/health"),
          ev("10:40:10", "Backup job", "Object store listing", "Backup object exists", "184 MB · written 02:00 UTC · off-host store"),
        ],
      },
      detailsTab: "record",
    }),
  );

  if (outcomes.restore !== "verified" && choices.restoreDecision === "run") {
    beats.push(
      beat({
        id: "restore-verified",
        phase: 7,
        pi: "Restore verification ran in an isolated database and passed — 184 MB restored, schema intact, row counts match. The claim changed because the evidence changed; that is the only way claims change here.",
        resolvedLine: "Restore verified · claim upgraded with evidence",
        hood: {
          record: [fact("Backups", "Daily · restore verified", "Evidence below")],
          activity: [act("10:41:30", "Verify", "Restore verification", "Isolated database · full restore + integrity check", "passed")],
          evidence: [ev("10:41:30", "Restore check", "Isolated restore + row-count comparison", "Restore proof", "restored 184 MB · schema ok · counts match")],
        },
        detailsTab: "evidence",
      }),
    );
  }
  if (outcomes.restore !== "verified" && choices.restoreDecision === "accept") {
    beats.push(
      beat({
        id: "restore-accepted",
        phase: 7,
        status: "Complete with gaps",
        pi: "Recorded as an accepted gap with you as owner — it stays visible in the record and in the final handoff. It will not quietly become a success.",
        resolvedLine: "Restore gap accepted · visible in handoff",
        openDecisions: [{ id: "U1", text: U.U1 }],
        hood: {
          record: [dec("Accepted gap", "Backup restore unproven — owner: you", "Decided in chat")],
        },
        detailsTab: "record",
      }),
    );
  }

  // ---------------- Phase 8 · Go live ---------------------------------------
  beats.push(
    beat({
      id: "candidate",
      phase: 8,
      kind: alwaysAsk ? "approval" : "task",
      status: alwaysAsk ? "Awaiting approval" : "Needs input",
      gate: ["current", "required", "required"],
      pi: `The first Release candidate is exact: revision ${identity.eligibleRevision}, image ${identity.imageDigest}, configuration ${identity.configIdentity}, three migrations to apply. ${alwaysAsk ? "Your mode asks before deployment." : "Deploying it is the next state-changing step."} A newer commit would be a different candidate and would need this moment again.`,
      card: {
        title: alwaysAsk ? "Approve first deployment" : "First Release candidate",
        rows: [
          ["Revision", identity.eligibleRevision],
          ["Image", identity.imageDigest],
          ["Configuration", identity.configIdentity],
          ["Migrations", "3 · applied before start"],
          ["Predecessor", "None — this is the first launch"],
        ],
      },
      actions: alwaysAsk
        ? [
            { label: "Approve — deploy first Release", tone: "primary" },
            { label: "Reject", tone: "reject" },
          ]
        : [{ label: "Deploy first Release" }],
      resolvedLine: `Deploying candidate ${identity.eligibleRevision}`,
      hood: {
        record: [fact("Release candidate", `${identity.eligibleRevision} · ${identity.imageDigest}`, "Pinned")],
        evidence: [ev("10:42:05", "GitHub Actions", "CI run on exact revision", "Build evidence", `128 tests passed · immutable image published`)],
      },
      detailsTab: "record",
    }),
  );

  if (outcomes.verification === "pass") {
    beats.push(
      beat({
        id: "verified-live",
        phase: 8,
        status: "Verified",
        pi: `Deployed and verified. Migrations applied, web and worker running — and, more importantly, the intended hostname passes every contract check and both semantic checks from outside: creating and reading a draft project works through https://${finalHostname}. A running container was never going to be enough; this is what “live” means here.`,
        resolvedLine: `Release ${identity.eligibleRevision} verified live at https://${finalHostname}`,
        hood: {
          record: [fact("Current Release", `${identity.release} · ${identity.eligibleRevision}`, "Externally verified")],
          activity: [
            act("10:43:18", "Change", "Applied migrations", "3 applied · schema 20260830_03", "passed"),
            act("10:43:59", "Change", "Started services", "web ready · worker heartbeat", "passed"),
            act("10:46:12", "Verify", "External verification suite", "contract 3/3 · semantic 2/2 through the hostname", "passed"),
          ],
          changes: [chg("10:43:59", "Release", `Release ${identity.release} deployed`, `${identity.eligibleRevision} → ${identity.host.name}`)],
          evidence: [
            ev("10:46:12", "External probe · Sofia", "HTTPS GET /api/health", "Contract health", `200 · body ok · release ${identity.eligibleRevision}`, "probe"),
            ev("10:46:31", "Semantic check", "Create + read draft project via public route", "Semantic verification", "created id 1042 · read back identical"),
          ],
        },
        detailsTab: "evidence",
      }),
    );
  } else {
    beats.push(
      beat({
        id: "reachable-not-verified",
        phase: 8,
        kind: "blocker",
        status: "Reachable",
        gate: ["pass", "pass", "blocked"],
        pi: `Careful — the site answers, but I will not call it live. https://${finalHostname} returns 200 and contract health passes, yet the semantic check “create a draft project” fails with a database permission error. Reachable is not Verified, and this candidate is not the current Release until that changes.`,
        card: {
          title: "Reachable, not Verified",
          rows: [
            ["Public route", "200 OK — reachable"],
            ["Contract health", "Pass"],
            ["Semantic smoke", "FAIL · create draft project → 500 permission denied"],
            ["Release status", "Candidate rejected pending remediation"],
          ],
        },
        actions: [{ label: "Investigate the failure" }],
        resolvedLine: "Verification failed · candidate held back",
        hood: {
          activity: [
            act("10:43:18", "Change", "Applied migrations", "3 applied", "passed"),
            act("10:46:12", "Verify", "External verification suite", "health passed · semantic FAILED", "blocked"),
          ],
          evidence: [
            ev("10:46:12", "External probe · Sofia", "HTTPS GET /api/health", "Contract health", "200 · body ok", "probe"),
            ev("10:46:31", "Semantic check", "Create draft project via public route", "Semantic failure", "HTTP 500 · permission denied for relation projects"),
          ],
        },
        detailsTab: "evidence",
      }),
      beat({
        id: "remediation",
        phase: 8,
        kind: autonomy ? "notice" : "approval",
        status: autonomy ? "Blocked" : "Awaiting approval",
        gate: ["pass", "pass", "blocked"],
        pi: autonomy
          ? "I found it with read-only queries: the migration role owns the table, so the app role lacks INSERT. Under Full Autonomy I applied the ownership grant directly on the host — recorded as an Out-of-band Change that stays visible as drift until it is folded into a release. Re-running verification now."
          : "I found it with read-only queries before proposing anything: the migration role owns the table, so the app role lacks INSERT. The fix is one database grant on the live host. Because it bypasses a release, it will be recorded as an Out-of-band Change — visible drift, not a hidden hotfix.",
        card: autonomy
          ? undefined
          : {
              title: "Apply database grant on the live host",
              rows: [
                ["Change", "GRANT INSERT ON projects TO app_role"],
                ["Where", `${identity.host.name} · live database`],
                ["Recorded as", "Out-of-band Change — visible until reconciled"],
                ["If you reject", "Candidate stays held · nothing changes"],
              ],
            },
        actions: autonomy
          ? [{ label: "Re-run verification" }]
          : [
              { label: "Approve grant & re-run verification", tone: "primary" },
              { label: "Reject", tone: "reject" },
            ],
        resolvedLine: "Grant applied · recorded as Out-of-band Change",
        hood: {
          activity: [act("10:48:20", "Inspect", "Collected database evidence", "app_role lacks INSERT on projects · read-only query", "passed")],
          evidence: [ev("10:48:20", "Host shell", "psql read-only query", "Grant inspection", "table owner: migration_role · app_role: SELECT only", "terminal")],
        },
        detailsTab: "evidence",
      }),
      beat({
        id: "reverified",
        phase: 8,
        status: "Verified",
        pi: `Verification re-ran and the result actually changed — because the underlying state changed, not because anyone overrode it. Semantic checks now pass through https://${finalHostname}, and the Release is current. The database grant remains visible as drift until it is reconciled into a release.`,
        resolvedLine: `Re-verified after remediation · Release ${identity.eligibleRevision} live`,
        hood: {
          record: [fact("Current Release", `${identity.release} · ${identity.eligibleRevision}`, "Externally verified")],
          activity: [
            act("10:49:05", "Change", "Applied ownership grant", "GRANT INSERT ON projects TO app_role", "passed"),
            act("10:49:44", "Verify", "Re-ran external verification", "contract 3/3 · semantic 2/2 — result changed with the evidence", "passed"),
          ],
          changes: [chg("10:49:05", "Out-of-band Change", "Database grant on live host", "GRANT INSERT · drift — visible until reconciled into a release", "terminal")],
          evidence: [ev("10:49:44", "Semantic check", "Create + read draft project via public route", "Semantic verification (re-run)", "created id 1042 · read back identical", "probe")],
        },
        detailsTab: "changes",
      }),
    );
  }

  // ---------------- Phase 9 · Handoff ---------------------------------------
  const acceptedGap = outcomes.restore !== "verified" && choices.restoreDecision === "accept";
  const drift = outcomes.verification === "fail";
  const gaps = [
    acceptedGap ? "backup restore unproven (accepted, owner: you)" : null,
    drift ? "1 Out-of-band Change unreconciled (database grant)" : null,
  ].filter(Boolean);

  beats.push(
    beat({
      id: "handoff",
      phase: 9,
      status: gaps.length ? "Complete with gaps" : "Verified",
      pi: `That's the launch. Release ${identity.eligibleRevision} is live at https://${finalHostname}, the sentinel is watching it from outside (last observation seconds ago), and the whole story — every command, receipt, and probe — is sealed in an evidence bundle you can open any time. ${gaps.length ? "Two things stay visibly open: " + gaps.join("; ") + "." : "No open gaps."} From here we shift to normal operations, and I keep watching.`,
      actions: [{ label: "Open the application workspace" }],
      resolvedLine: "Launch complete · evidence sealed",
      hood: {
        record: [
          fact("Launch evidence", `${identity.bundle} · 36 observations`, "Sealed"),
          fact("Ongoing observation", "Sentinel active · public health path", "Verified"),
          ...(gaps.length ? [fact("Open gaps", gaps.join(" · "), "Visible — not hidden")] : []),
        ],
        activity: [act("10:50:30", "Record", "Sealed launch evidence bundle", `${identity.bundle} linked to ${identity.release}`, "recorded")],
        evidence: [ev("10:50:41", "Sentinel", "External HTTPS probe", "Latest observation", `200 · 184 ms · release ${identity.eligibleRevision}`, "probe", "Point-in-time — one probe never proves continuing health")],
      },
      detailsTab: "record",
    }),
    beat({
      id: "workspace",
      phase: 9,
      kind: "final",
      status: gaps.length ? "Complete with gaps" : "Verified",
      pi: "All nine launch chats are archived. This is the normal application workspace: ask me anything about the running application, and every answer should point at the durable record and its evidence.",
      resolvedLine: "Ongoing operations",
      hood: {},
    }),
  );

  return beats;
}

export const defaultChoices = {
  worker: null,
  domainPath: null,
  conflictResolution: null,
  restoreDecision: null,
};

export const defaultOutcomes = {
  conformance: "clean",
  dnsConflict: false,
  propagation: "fast",
  verification: "pass",
  restore: "verified",
};

export const outcomeSwitches = [
  { key: "conformance", label: "Profile checks", values: [["clean", "clean"], ["needs-code", "needs code"]], rewindTo: "contract" },
  { key: "dnsConflict", label: "DNS conflict", values: [[false, "none"], [true, "apex conflict"]], rewindTo: "domain-choose" },
  { key: "propagation", label: "Propagation", values: [["fast", "fast"], ["slow", "slow"]], rewindTo: "domain-choose" },
  { key: "verification", label: "Verification", values: [["pass", "passes"], ["fail", "fails"]], rewindTo: "candidate" },
  { key: "restore", label: "Restore proof", values: [["verified", "verified"], ["unproven", "unproven"]], rewindTo: "baseline" },
];
