import { guidePage } from "./markdown.ts";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export function learningPage(appUrl: string, token: string) {
  return guidePage(
    `
    <header class="learn-heading">
      <div><h1>Learn Hallvi</h1><p>Keep your understanding in step with the code.</p></div>
      <button id="continue" class="primary" disabled>Start learning</button>
    </header>
    <section class="learn-refresh" aria-label="Architecture freshness">
      <div><p id="checkout" class="learn-checkout">Reading architecture…</p>
        <p id="rebuild-status" class="footnote" role="status">Checking rebuild status…</p></div>
      <div class="learn-rebuild-action"><button id="rebuild" class="secondary" type="button" disabled>Rebuild now</button>
        <span class="footnote">Counts toward Codex usage</span></div>
    </section>
    <details id="rebuild-summary" class="learn-rebuild-summary" hidden><summary>What changed in the last rebuild</summary><p></p></details>
    <div id="learning-error" class="error" role="alert" hidden></div>
    <div class="learn-toolbar">
      <nav class="learn-views" aria-label="Learning views">
        <a href="#overview" aria-current="page">Architecture</a>
        <a href="#quiz">Quiz <span id="due-count"></span></a>
        <a href="#progress">Your progress</a>
      </nav>
      <p id="learning-sync" class="footnote" role="status">Connecting…</p>
    </div>
    <section id="overview" aria-labelledby="map-title">
      <section class="learn-map surface">
        <header class="learn-section-heading"><div><h2 id="map-title">How the pieces connect</h2>
          <p class="muted">Select a component to trace its connections.</p></div>
          <a id="architecture-source" href="/learn/source?file=docs%2Farchitecture.md" class="footnote">Architecture notes</a></header>
        <div id="architecture-map" class="learn-map-scroll" role="region" aria-label="Interactive architecture map" tabindex="0"></div>
        <div id="map-detail" class="learn-map-detail" aria-live="polite"></div>
      </section>
      <section class="learn-concepts" aria-labelledby="concepts-title">
        <div class="learn-section-heading"><div><h2 id="concepts-title">Build your understanding</h2>
          <p id="overview-progress" class="muted">Questions follow the architecture and its source code.</p></div>
          <label class="learn-search">Find a concept<input type="search" id="concept-search" placeholder="Search concepts and responsibilities"></label></div>
        <div id="topics"></div>
      </section>
      <details class="learn-about"><summary>How this stays current</summary>
        <p>Once a day while this page is open, the dashboard checks <code>origin/main</code>. If merged code has changed, a temporary Codex CLI job reads a fixed snapshot of the code and documentation, updates the map and questions, then exits. If the dashboard was closed, it catches up when you open this page. <strong>Rebuild now</strong> runs the review immediately, even if main has not changed.</p>
        <p>The job uses <code>gpt-5.6-sol</code> with medium reasoning and your Codex CLI sign-in. It consumes your Codex usage; it does not run Hallvi’s Pi operator. Install the CLI and run <code>codex login</code> on this machine if needed. Before the first successful rebuild, you can learn from starter questions extracted from this checkout.</p>
        <p>Unchanged questions keep their answers. Changed knowledge becomes a new version, and removed concepts leave your queue but stay in your saved history. The previous catalog stays available during a rebuild or if a rebuild fails. Source links in a rebuilt catalog open the cited commit, so you can check the explanation against the code. Model-generated explanations can be wrong; the sources are there to inspect.</p>
        <p>Progress and rebuilt content are saved on this machine, shared by this repository’s worktrees. They are separate from Hallvi application data and are not committed to Git.</p>
        <p id="progress-location" class="footnote"></p>
      </details>
    </section>
    <section id="quiz" aria-labelledby="quiz-title" hidden>
      <label class="learn-mobile-topic">Topic<select id="mobile-topic"></select></label>
      <div class="learn-quiz-layout">
        <aside class="learn-queue" aria-label="Quiz topics"><h2 id="quiz-title">Your learning queue</h2>
          <p>Changed material first. Completed questions stay out of the way.</p>
          <div id="quiz-topics"></div></aside>
        <div><div id="question" class="learn-question surface"></div>
          <p id="quiz-message" class="learn-message" role="status"></p></div>
      </div>
    </section>
    <section id="progress" aria-labelledby="progress-title" hidden>
      <div class="learn-section-heading"><div><h2 id="progress-title">Your progress</h2>
        <p id="progress-summary" class="muted"></p></div>
        <label class="learn-search">Show<select id="history-filter">
          <option value="all">All saved progress</option><option value="learned">Learned</option>
          <option value="retry">Still learning</option><option value="archived">Archived</option>
          <option value="obsolete">Changed or removed</option>
        </select></label></div>
      <div id="learning-history"></div>
    </section>
    <noscript><p class="error">Enable JavaScript to use the quiz and save progress. The source links remain readable.</p></noscript>
  `,
    "Learn Hallvi",
    appUrl,
    "/learn",
  )
    .replace(
      '<main class="guide"><article class="markdown">',
      '<main class="learn"><article>',
    )
    .replace(
      "</head>",
      `<meta name="testing-token" content="${escape(token)}">
      <link rel="stylesheet" href="/learning.css">
      <script src="/learning.js" defer></script></head>`,
    );
}

export function learningSourcePage(
  path: string,
  source: string,
  appUrl: string,
  revision: string | null = null,
) {
  const lines = source
    .split("\n")
    .map(
      (line, index) =>
        `<span id="L${index + 1}" class="learn-source-line"><a href="#L${index + 1}" aria-label="Line ${index + 1}">${index + 1}</a> ${escape(line) || " "}</span>`,
    )
    .join("");
  return guidePage(
    `<p><a href="/learn">Back to Learn Hallvi</a></p><h1>${escape(path)}</h1>
     <p>${revision ? `Source at commit ${escape(revision)}.` : "Current local source. This includes uncommitted edits."}</p>
     <pre class="learn-source"><code>${lines}</code></pre>`,
    path,
    appUrl,
    "/learn/source",
  ).replace("</head>", '<link rel="stylesheet" href="/learning.css"></head>');
}
