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
    <p id="checkout" class="learn-checkout">Reading this checkout…</p>
    <div id="learning-error" class="error" role="alert" hidden></div>
    <div class="learn-toolbar">
      <nav class="learn-views" aria-label="Learning views">
        <a href="#overview" aria-current="page">Architecture</a>
        <a href="#quiz">Quiz <span id="due-count"></span></a>
        <a href="#progress">Your progress</a>
      </nav>
      <p id="learning-sync" class="footnote" role="status">Checking sources…</p>
    </div>
    <section id="overview" aria-labelledby="map-title">
      <section class="learn-map surface">
        <header class="learn-section-heading"><div><h2 id="map-title">How the pieces connect</h2>
          <p class="muted">Select a component to trace its connections.</p></div>
          <a href="/learn/source?file=docs%2Farchitecture.md" class="footnote">Architecture source</a></header>
        <div id="architecture-map" class="learn-map-scroll" role="region" aria-label="Interactive architecture map" tabindex="0"></div>
        <div id="map-detail" class="learn-map-detail" aria-live="polite"></div>
      </section>
      <section class="learn-concepts" aria-labelledby="concepts-title">
        <div class="learn-section-heading"><div><h2 id="concepts-title">Build your understanding</h2>
          <p id="overview-progress" class="muted">Questions follow the sources in this checkout.</p></div>
          <label class="learn-search">Find a concept<input type="search" id="concept-search" placeholder="Search concepts and responsibilities"></label></div>
        <div id="topics"></div>
      </section>
      <details class="learn-about"><summary>How this stays current</summary>
        <p>The page checks local sources every five seconds while open. Definitions come from <code>CONTEXT.md</code>, the map from <code>docs/architecture.md</code>, and tool contracts and table fields from their TypeScript source. Source links show this checkout, including local edits.</p>
        <p>A changed definition, tool description or table field list becomes a new question version. Correct answers to unchanged questions stay completed. Old versions and removed concepts stay in your history; archived questions leave your queue until you restore them or their content changes.</p>
        <p>The definitions describe Hallvi's domain, including concepts whose wording explicitly says they are planned. Documentation still needs to be updated when behavior changes. These questions test that documented model and the extracted contracts; they do not verify the running application.</p>
        <p>No model calls. Progress is saved on this machine, shared by this repository's worktrees. It is separate from Hallvi application data and is not committed to Git.</p>
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
     <p>Current local source. This includes uncommitted edits.</p>
     <pre class="learn-source"><code>${lines}</code></pre>`,
    path,
    appUrl,
    "/learn/source",
  ).replace("</head>", '<link rel="stylesheet" href="/learning.css"></head>');
}
