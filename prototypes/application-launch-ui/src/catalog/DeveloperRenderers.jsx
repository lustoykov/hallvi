import React from "react";

const noop = () => {};

function RendererHeader({ title, status, actionLabel = "Details", onOpen = noop }) {
  return (
    <header>
      <strong>{title}</strong>
      <span>{status}</span>
      <button type="button" onClick={onOpen}>{actionLabel}</button>
    </header>
  );
}

export function CommandResult({
  command = "curl -fsS https://northstar.dev/health | jq",
  cwd = "/srv/northstar/current",
  status = "Passed",
  exitCode = 0,
  duration = "182 ms",
  output = '{\n  "status": "ok",\n  "release": "9f3c2ad"\n}',
  onOpen = noop,
}) {
  return (
    <section className="renderer-card command-result" aria-label="Command result">
      <RendererHeader title="Command result" status={status} actionLabel="Open evidence" onOpen={onOpen} />
      <div className="renderer-body">
        <div className="renderer-meta">
          <span>Working directory<b>{cwd}</b></span>
          <span>Exit / duration<b>{exitCode} · {duration}</b></span>
        </div>
        <pre><code>$ {command}{"\n"}{output}</code></pre>
      </div>
    </section>
  );
}

const defaultDiff = [
  { old: "18", next: "18", type: "context", text: "services:" },
  { old: "19", next: "", type: "removed", text: "  web: { image: northstar:latest }" },
  { old: "", next: "19", type: "added", text: "  web: { image: ghcr.io/northstar/app:9f3c2ad }" },
  { old: "", next: "20", type: "added", text: "  healthcheck: { test: [CMD, curl, -f, /health] }" },
];

export function ConfigDiff({
  file = "ops/compose.production.yml",
  change = "+2 −1",
  lines = defaultDiff,
  source = "Pull Request #42 · commit 9f3c2ad",
  onOpen = noop,
}) {
  return (
    <section className="renderer-card config-diff" aria-label={`Configuration diff for ${file}`}>
      <RendererHeader title={file} status={change} actionLabel="Open changes" onOpen={onOpen} />
      <div className="renderer-body">
        <div className="renderer-meta"><span>Source<b>{source}</b></span></div>
        <div className="diff-view" role="table" aria-label="Line-oriented diff">
          {lines.map((line, index) => (
            <div className={`diff-line ${line.type || "context"}`} role="row" key={`${line.old}-${line.next}-${index}`}>
              <span>{line.old || "·"}/{line.next || "·"}</span>
              <code>{line.type === "added" ? "+ " : line.type === "removed" ? "− " : "  "}{line.text}</code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PullRequestCard({
  number = 42,
  title = "Add production health contract",
  repository = "northstar/app",
  branch = "server-guy/health-contract",
  target = "main",
  commit = "9f3c2ad",
  status = "Ready for review",
  author = "server-guy[bot] via Pi worker",
  onOpen = noop,
}) {
  return (
    <section className="renderer-card pull-request-card" aria-label={`Pull Request ${number}`}>
      <RendererHeader title={`PR #${number} · ${title}`} status={status} actionLabel="Open pull request" onOpen={onOpen} />
      <div className="renderer-body">
        <div className="renderer-meta">
          <span>Repository<b>{repository}</b></span>
          <span>Branch<b>{branch} → {target}</b></span>
          <span>Head commit<b>{commit}</b></span>
          <span>Authorship<b>{author}</b></span>
        </div>
      </div>
    </section>
  );
}

const defaultChecks = [
  { name: "Lint", status: "Passed", detail: "28 s" },
  { name: "Unit tests", status: "Passed", detail: "148 tests · 2 m 14 s" },
  { name: "Production build", status: "Passed", detail: "1 m 08 s" },
  { name: "Environment smoke check", status: "Running", detail: "Required before merge" },
];

export function CheckList({ title = "Verification checks", items = defaultChecks, onOpen = noop }) {
  return (
    <section className="renderer-card check-list-renderer" aria-label={title}>
      <RendererHeader title={title} status={`${items.filter((item) => item.status === "Passed").length}/${items.length} passed`} actionLabel="Check evidence" onOpen={onOpen} />
      <div className="renderer-body">
        <div className="check-list">
          {items.map((item) => (
            <div className="check-row" key={item.name}>
              <span className={`mini-dot ${item.status === "Passed" ? "success" : item.status === "Running" ? "active" : "warning"}`} aria-hidden="true" />
              <span><strong>{item.name}</strong> <small>{item.detail}</small></span>
              <span className={`status-badge ${item.status === "Passed" ? "success" : item.status === "Running" ? "" : "warning"}`}>{item.status}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const defaultLogs = [
  { time: "10:42:14", level: "INFO", message: "release 9f3c2ad became reachable" },
  { time: "10:42:16", level: "INFO", message: "database read/write probe passed" },
  { time: "10:42:18", level: "OK", message: "public health contract verified" },
];

export function LogTraceStream({ title = "Live operation trace", traceId = "tr_01J9SG7M3", entries = defaultLogs, tone = "active", onOpen = noop }) {
  return (
    <section className={`renderer-card log-trace-stream ${tone}`} aria-label={title}>
      <RendererHeader title={title} status="Streaming sample" actionLabel="Open trace" onOpen={onOpen} />
      <div className="renderer-body">
        <div className="renderer-meta"><span>Trace ID<b>{traceId}</b></span></div>
        <div className="log-stream" role="log">
          {entries.map((entry, index) => (
            <div className="log-line" key={`${entry.time}-${index}`}>
              <time>{entry.time}</time>
              <span className={entry.level === "WARN" ? "warn" : entry.level === "OK" ? "ok" : ""}>{entry.level}</span>
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProviderReceipt({
  provider = "Hetzner Cloud",
  operation = "Create server",
  resource = "cx32 · fsn1 · ubuntu-24.04",
  requestId = "req_hz_01J9SG1T7",
  receiptId = "srv_48392117",
  status = "Submitted",
  submittedAt = "2026-08-30 10:18:42 UTC",
  onOpen = noop,
}) {
  return (
    <section className="renderer-card provider-receipt" aria-label={`${provider} receipt`}>
      <RendererHeader title={`${provider} · ${operation}`} status={status} actionLabel="Open provider source" onOpen={onOpen} />
      <div className="renderer-body">
        <div className="renderer-meta">
          <span>Intended resource<b>{resource}</b></span>
          <span>Submitted at<b>{submittedAt}</b></span>
          <span>Request ID<b>{requestId}</b></span>
          <span>Receipt / resource ID<b>{receiptId}</b></span>
        </div>
      </div>
    </section>
  );
}

export function ExternalProbe({
  method = "GET",
  target = "https://northstar.dev/health",
  status = 200,
  latency = "182 ms",
  checkedAt = "2026-08-30 10:42:18 UTC",
  vantage = "Cloudflare Worker · FRA",
  onOpen = noop,
}) {
  const passed = Number(status) >= 200 && Number(status) < 400;
  return (
    <section className="renderer-card external-probe" aria-label="External probe result">
      <RendererHeader title="Public reachability probe" status={`${status} · ${passed ? "Passed" : "Failed"}`} actionLabel="Open raw response" onOpen={onOpen} />
      <div className="renderer-body">
        <div className="renderer-meta">
          <span>Request<b>{method} {target}</b></span>
          <span>Latency<b>{latency}</b></span>
          <span>Observed at<b>{checkedAt}</b></span>
          <span>Vantage point<b>{vantage}</b></span>
        </div>
      </div>
    </section>
  );
}

export function ImmutableArtifact({
  title = "Launch evidence bundle",
  hash = "sha256:7f14fd908b1cc14918f41c3bdac6234fa0b6752c8d3674a87f0c6d38d14ae213",
  source = "Server Guy verifier · operation op_01J9SG5NR",
  collectedAt = "2026-08-30 10:42:21 UTC",
  size = "84.2 KB",
  onOpen = noop,
}) {
  return (
    <section className="renderer-card immutable-artifact" aria-label={title}>
      <RendererHeader title={title} status="Immutable" actionLabel="Open artifact" onOpen={onOpen} />
      <div className="renderer-body">
        <div className="renderer-meta">
          <span>Source<b>{source}</b></span>
          <span>Collected / size<b>{collectedAt} · {size}</b></span>
        </div>
        <div className="artifact-hash"><strong>Content hash</strong><br />{hash}</div>
      </div>
    </section>
  );
}
