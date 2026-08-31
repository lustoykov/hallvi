import { useState } from "react";
import { heroes } from "./fixture.js";

const INSPECT_DESTINATIONS = [
  ["activity", "Activity", "What Pi did"],
  ["changes", "Changes", "External effects"],
  ["evidence", "Evidence", "Proof and sources"],
];

const destinationTitle = Object.fromEntries(INSPECT_DESTINATIONS.map(([key, label]) => [key, label]));

function collect(visible, key) {
  return visible.flatMap((beat) => (beat.hood[key] || []).map((item) => ({ ...item, beatId: beat.id })));
}

const destinationLabel = {
  terminal: "Open server session",
  dns: "Open provider DNS",
  pr: "Open repository source",
  probe: "Open raw probe",
  hetzner: "Open Hetzner object",
};

function GateCheckRow({ check, state, mode, onHero, onAskPi }) {
  const [open, setOpen] = useState(false);
  const [rerun, setRerun] = useState(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const word = state === "pass" ? "Passed" : state === "current" ? "Current" : state === "blocked" ? "Blocked" : "Not yet";
  return (
    <div className={`gate-check gate-${state}`}>
      <div className="gate-check-row">
        <i className={`gate-dot gate-${state}`} />
        <span className="gate-id">{check.id}</span>
        <strong>{check.label}</strong>
        <em>{word}</em>
        <button type="button" className="details-link" aria-expanded={open} aria-label={`${open ? "Close" : "Details for"} ${check.id} ${check.label}`} onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Details"}</button>
      </div>
      {open && (
        <div className="takeover">
          <dl className="check-definition">
            <div><dt>Satisfied when</dt><dd>{check.satisfies}</dd></div>
            <div><dt>Evidence</dt><dd>{check.evidence}</dd></div>
            <div><dt>Verify yourself</dt><dd>{check.observe}</dd></div>
          </dl>
          <div className="check-actions">
            <button type="button" onClick={() => onAskPi(check)}>Ask Pi</button>
            <button type="button" onClick={() => check.hero ? onHero(check.hero) : setSourceOpen((value) => !value)}>
              {check.hero ? destinationLabel[check.hero] : "Open source record"}
            </button>
            <button type="button" onClick={() => setRerun("done")}>Re-run check</button>
          </div>
          {sourceOpen && <pre className="source-record">{JSON.stringify({ check: check.id, source: check.observe, evidence_required: check.evidence }, null, 2)}</pre>}
          {rerun && <p className="rerun-result">Re-checked just now — result unchanged: “{word}”. In this mock only the outcome switches change underlying state; in the product, only fresh evidence would.</p>}
          <p className="no-override">Computed from evidence · no manual pass control · Approval Mode: {mode}</p>
        </div>
      )}
    </div>
  );
}

function EvidenceRow({ item, highlighted, onHero }) {
  const [raw, setRaw] = useState(false);
  return (
    <div className={`hood-item ${highlighted ? "flash" : ""}`}>
      <div className="hood-item-head">
        <strong>{item.title}</strong>
        <time>{item.time}</time>
      </div>
      <p className="hood-item-detail">{item.source} · {item.method}</p>
      <p className="hood-item-raw-line"><code>{item.raw}</code></p>
      {item.note && <p className="hood-note">{item.note}</p>}
      <div className="hood-item-actions">
        {item.hero && <button type="button" onClick={() => onHero(item.hero)}>Open {item.hero === "terminal" ? "server session" : item.hero === "dns" ? "DNS records" : item.hero === "pr" ? "pull request" : "raw artifact"}</button>}
        {!item.hero && <button type="button" onClick={() => setRaw((v) => !v)}>{raw ? "Hide detail" : "Inspect"}</button>}
      </div>
      {raw && !item.hero && (
        <pre className="hood-raw">{JSON.stringify({ source: item.source, method: item.method, observed: item.time, result: item.raw, scope: "point-in-time observation" }, null, 2)}</pre>
      )}
    </div>
  );
}

export function Inspector({ open, tab, highlight, onTab, onToggle, visible, phase, gate, userDecisions, mode, onHero, onAskPi }) {
  if (!open) {
    return (
      <aside className="inspector collapsed">
        <button type="button" className="inspector-toggle" onClick={onToggle}>Open the hood</button>
      </aside>
    );
  }

  const decisions = [
    ...collect(visible, "record").filter((item) => item.origin !== undefined),
    ...userDecisions.map((text, i) => ({ id: `ud-${i}`, label: "From chat", value: text, origin: "This conversation (mock)" })),
  ];
  const activity = collect(visible, "activity");
  const changes = collect(visible, "changes");
  const evidence = collect(visible, "evidence");

  return (
    <aside className="inspector" aria-label="Under the hood">
      <div className="inspector-head">
        <div className="inspector-location">
          {tab !== "record" && (
            <button type="button" className="inspector-back" onClick={() => onTab("record")} aria-label="Back to Record">
              <span aria-hidden="true">←</span> Record
            </button>
          )}
          <strong>{tab === "record" ? "Record" : destinationTitle[tab]}</strong>
        </div>
        <button type="button" className="inspector-toggle" onClick={onToggle} aria-label="Hide the record" title="Hide the record">‹</button>
      </div>

      <div className="inspector-scroll">
        {tab === "record" && (
          <>
            <section className="hood-section">
              <h3>{phase.deliverable}</h3>
              <p className="hood-quiet">{phase.meaning}</p>
              <div className="gate-checks">
                {phase.checks.map((check, index) => (
                  <GateCheckRow key={check.id} check={check} state={gate[index]} mode={mode} onHero={onHero} onAskPi={onAskPi} />
                ))}
              </div>
            </section>
            <section className="hood-section">
              <h3>Decisions from this phase chat</h3>
              {decisions.length === 0 && <p className="hood-quiet">No phase decisions recorded yet.</p>}
              {decisions.map((d) => (
                <div key={d.id} className="fact-row">
                  <span>{d.label}</span>
                  <strong>{d.value}</strong>
                  <em>{d.origin}</em>
                </div>
              ))}
            </section>
            <section className="hood-section inspect-section">
              <h3>Inspect</h3>
              <div className="inspect-destinations">
                {INSPECT_DESTINATIONS.map(([key, label, description]) => {
                  const count = key === "activity" ? activity.length : key === "changes" ? changes.length : evidence.length;
                  return (
                    <button key={key} type="button" onClick={() => onTab(key)}>
                      <span className="inspect-destination-copy"><strong>{label}</strong><small>{description}</small></span>
                      <span className="inspect-count" aria-label={`${count} ${label.toLowerCase()} items`}>{count}</span>
                      <span className="inspect-arrow" aria-hidden="true">→</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {tab === "activity" && (
          <section className="hood-section">
            <h3>What Pi did</h3>
            <p className="hood-quiet">The phase timeline of tool calls, provider operations, and verification work.</p>
            {activity.length === 0 && <p className="hood-quiet">Nothing yet.</p>}
            {activity.map((item) => (
              <div key={item.id} className={`activity-row ${item.beatId === highlight ? "flash" : ""}`}>
                <time>{item.time}</time>
                <span className={`kind-chip kind-${item.kind.toLowerCase()}`}>{item.kind}</span>
                <div><strong>{item.title}</strong><small>{item.detail}</small></div>
                <em className={`act-status act-${item.status}`}>{item.status}</em>
              </div>
            ))}
          </section>
        )}

        {tab === "changes" && (
          <section className="hood-section">
            <h3>Net changes</h3>
            <p className="hood-quiet">Durable external effects produced during this phase.</p>
            {changes.length === 0 && <p className="hood-quiet">No external effect yet — nothing has been created or changed.</p>}
            {changes.map((item) => (
              <div key={item.id} className={`hood-item ${item.beatId === highlight ? "flash" : ""}`}>
                <div className="hood-item-head">
                  <span className={`scope-chip scope-${item.scope.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{item.scope}</span>
                  <time>{item.time}</time>
                </div>
                <strong>{item.title}</strong>
                <p className="hood-item-detail">{item.detail}</p>
                {item.hero && (
                  <div className="hood-item-actions">
                    <button type="button" onClick={() => onHero(item.hero)}>Open {item.hero === "pr" ? "pull request" : item.hero === "dns" ? "DNS records" : "on the server"}</button>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {tab === "evidence" && (
          <section className="hood-section">
            <h3>Evidence</h3>
            <p className="hood-quiet">Every claim in chat traces to one of these. Each is a point-in-time observation with its own source, method, and timestamp.</p>
            {evidence.length === 0 && <p className="hood-quiet">No observations yet.</p>}
            {evidence.map((item) => (
              <EvidenceRow key={item.id} item={item} highlighted={item.beatId === highlight} onHero={onHero} />
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}

export function HeroOverlay({ heroKey, onClose }) {
  const hero = heroes[heroKey];
  if (!hero) return null;
  return (
    <div className="hero-backdrop" onMouseDown={onClose} role="presentation">
      <div className="hero-panel" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={hero.title}>
        <div className="hero-head">
          <div>
            <strong>{hero.title}</strong>
            <small>{hero.subtitle}</small>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        {heroKey === "terminal" && (
          <pre className="hero-terminal">{hero.lines.join("\n")}</pre>
        )}
        {heroKey === "dns" && (
          <table className="hero-table">
            <thead><tr>{hero.table[0].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {hero.table.slice(1).map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        )}
        {heroKey === "pr" && (
          <div className="hero-pr">
            <dl className="card-rows">
              {hero.meta.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            <pre className="hero-files">{hero.files.join("\n")}</pre>
          </div>
        )}
        {heroKey === "hetzner" && (
          <div className="hero-pr">
            <dl className="card-rows">
              {hero.meta.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            <pre className="hero-files">{hero.raw}</pre>
          </div>
        )}
        {heroKey === "probe" && <pre className="hero-terminal">{hero.raw}</pre>}
        <p className="hero-footer">Mocked destination — in the product this is the real console, session, or artifact.</p>
      </div>
    </div>
  );
}
