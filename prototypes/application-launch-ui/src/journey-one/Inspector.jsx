import { useState } from "react";
import { heroes } from "./fixture.js";

const TABS = [
  ["record", "Record"],
  ["activity", "Activity"],
  ["changes", "Changes"],
  ["evidence", "Receipts"],
];

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
  const word = state === "pass" ? "Complete" : state === "current" ? "In progress" : state === "blocked" ? "Blocked" : "Not started";
  return (
    <div className={`gate-check gate-${state}`}>
      <div className="gate-check-row">
        <i className={`gate-dot gate-${state}`} />
        <strong>{check.label}</strong>
        <em>{word}</em>
        <button type="button" className="details-link" aria-expanded={open} aria-label={`${open ? "Close details for" : "Details for"} ${check.label}`} onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Details"}</button>
      </div>
      {open && (
        <div className="takeover">
          <dl className="check-definition">
            <div><dt>Satisfied when</dt><dd>{check.satisfies}</dd></div>
            <div><dt>Required proof</dt><dd>{check.evidence}</dd></div>
            <div><dt>Check it yourself</dt><dd>{check.observe}</dd></div>
          </dl>
          <div className="check-actions">
            <button type="button" onClick={() => onAskPi(check)}>Ask Pi</button>
            <button type="button" onClick={() => check.hero ? onHero(check.hero) : setSourceOpen((value) => !value)}>
              {check.hero ? destinationLabel[check.hero] : "Open source record"}
            </button>
            <button type="button" onClick={() => setRerun("done")}>Re-run check</button>
          </div>
          {sourceOpen && <pre className="source-record">{JSON.stringify({ check: check.label, internal_reference: check.id, source: check.observe, evidence_required: check.evidence }, null, 2)}</pre>}
          {rerun && <p className="rerun-result">Checked again just now. The result is still {word}. In this prototype, only the scenario controls change it. In Server Guy, fresh provider or runtime data can change it.</p>}
          <p className="no-override">Computed from current receipts · you cannot mark this check as passed · Approval Mode: {mode}</p>
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
        <button type="button" className="inspector-toggle" onClick={onToggle}>Open inspector</button>
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
  const completedChecks = gate.filter((state) => state === "pass").length;
  const totalChecks = phase.checks.length;
  const progressPercent = totalChecks ? (completedChecks / totalChecks) * 100 : 0;
  const progressLabel = completedChecks === totalChecks
    ? `All ${totalChecks} checks complete`
    : `${completedChecks} of ${totalChecks} checks complete`;

  return (
    <aside className="inspector" aria-label="Application inspector">
      <div className="inspector-head">
        <nav aria-label="Application inspector views" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => onTab(key)}>{label}</button>
          ))}
        </nav>
        <button type="button" className="inspector-toggle" onClick={onToggle}>Hide</button>
      </div>

      <div className="inspector-scroll" role="tabpanel">
        {tab === "record" && (
          <>
            <section className="hood-section">
              <div className="deliverable-summary">
                <div className="deliverable-heading">
                  <h3>{phase.deliverable}</h3>
                  <span>{progressLabel}</span>
                </div>
                <div
                  className={`gate-progress ${completedChecks === totalChecks ? "complete" : ""}`}
                  role="progressbar"
                  aria-label={`${phase.deliverable} progress`}
                  aria-valuemin="0"
                  aria-valuemax={totalChecks}
                  aria-valuenow={completedChecks}
                  aria-valuetext={progressLabel}
                >
                  <span style={{ transform: `scaleX(${progressPercent / 100})` }} />
                </div>
                <p className="hood-quiet">{phase.meaning}</p>
              </div>
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
          </>
        )}

        {tab === "activity" && (
          <section className="hood-section">
            <h3>Pi activity</h3>
            <p className="hood-quiet">Tool calls, provider actions, and checks from this phase.</p>
            {activity.length === 0 && <p className="hood-quiet">Pi has not run anything in this phase.</p>}
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
            <h3>Changes in this phase</h3>
            <p className="hood-quiet">Files, configuration, and infrastructure changed by Server Guy.</p>
            {changes.length === 0 && <p className="hood-quiet">Server Guy has not changed anything in this phase.</p>}
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
            <h3>Receipts</h3>
            <p className="hood-quiet">Provider responses, probe results, and other sources behind Pi's claims.</p>
            {evidence.length === 0 && <p className="hood-quiet">No receipts yet.</p>}
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
        <p className="hero-footer">This prototype shows sample data. Server Guy opens the actual console, session, or artifact.</p>
      </div>
    </div>
  );
}
