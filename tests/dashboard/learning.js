const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="testing-token"]').content;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const sourceLink = (source) =>
  `/learn/source?file=${encodeURIComponent(source.path)}${source.revision ? `&revision=${encodeURIComponent(source.revision)}` : ""}#L${source.line}`;
const key = (question) => `${question.id}@${question.version}`;
const due = (question) => !["learned", "archived"].includes(question.status);
const labels = {
  learned: "Learned",
  new: "New",
  changed: "Changed",
  retry: "Still learning",
  archived: "Archived",
  removed: "Retired from the architecture",
};
let state;
let signature = "";
let topic = "";
let activeKey = "";
let selected = "";
let result = null;
let busy = false;
let loading = false;
let connected = false;
let selectedNode = "";
let mutation = 0;
const deferred = new Set();
const groups = () => [...new Set(state.questions.map((q) => q.topic))];
const queue = () =>
  state.questions
    .filter((q) => due(q) && (!topic || q.topic === topic))
    .sort(
      (a, b) =>
        Number(deferred.has(key(a))) - Number(deferred.has(key(b))) ||
        Number(b.status === "changed") - Number(a.status === "changed"),
    );

async function request(body) {
  const response = await fetch("/api/learning", {
    method: body ? "POST" : "GET",
    headers: {
      "X-Hallvi-Testing-Token": token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not save progress.");
  return data;
}
function fail(error) {
  $("learning-error").textContent =
    `${error.message} Your saved progress is kept. Refresh to retry.`;
  $("learning-error").hidden = false;
}
async function refresh() {
  if (loading || busy) return;
  loading = true;
  const readingAt = mutation;
  try {
    const next = await request();
    if (!next.review)
      throw new Error(
        "Restart the local dashboard to load saved architecture reviews.",
      );
    if (readingAt !== mutation) return;
    connected = true;
    $("learning-error").hidden = true;
    $("learning-sync").textContent = "Progress saved locally";
    const nextSignature = JSON.stringify([
      next.sourceVersion,
      next.history,
      next.checkout,
    ]);
    if (signature !== nextSignature) {
      const restoreFocus = retainFocus();
      const previous = state;
      state = next;
      signature = nextSignature;
      if (previous && previous.sourceVersion !== next.sourceVersion) {
        $("quiz-message").textContent =
          "Sources changed. Your progress on unchanged questions is kept.";
      }
      render();
      restoreFocus();
    } else if ($("question").querySelector("button:disabled")) {
      renderQuestion();
    }
    state.review = next.review;
    renderReview();
  } catch (error) {
    connected = false;
    fail(error);
    $("learning-sync").textContent = "Updates paused · retrying automatically";
    if (state) renderQuestion();
  } finally {
    loading = false;
  }
}
// Catalog publication replaces view markup. Keep the same logical control
// focused when it survives, including an answer on an unchanged question.
function retainFocus() {
  const focused = document.activeElement;
  const container = focused?.closest("[id]");
  if (!container) return () => {};
  const questionKey = activeKey;
  const inQuestion = Boolean(focused.closest("#question"));
  const details = focused.closest("details[data-topic], details[data-key]");
  const identity = (element) =>
    [...element.attributes]
      .filter(({ name }) => /^(data-.*|type|name|value|href)$/.test(name))
      .map(({ name, value }) => `[${name}="${CSS.escape(value)}"]`)
      .join("");
  const selector = `#${CSS.escape(container.id)} ${details ? `details${identity(details)} ` : ""}${focused.tagName.toLowerCase()}${identity(focused)}`;
  return () => {
    if (focused.isConnected) return;
    const replacement = document.querySelector(selector);
    const target =
      inQuestion &&
      (activeKey !== questionKey ||
        !replacement ||
        replacement.matches(":disabled"))
        ? $("question").querySelector("h2")
        : replacement;
    target?.focus({ preventScroll: true });
  };
}
function renderReview() {
  if (!state) return;
  const review = state.review;
  const time = (value) =>
    new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  $("checkout").textContent = review.revision
    ? `Merged main · ${review.revision.slice(0, 8)} · reviewed ${time(review.builtAt)}`
    : `Starter content from ${state.checkout.branch || "this checkout"} · awaiting first Codex review`;
  $("checkout").title = state.checkout.root;
  const pending =
    review.checkedRevision && review.checkedRevision !== review.revision;
  $("review-status").textContent =
    `${review.lastCheckedAt ? `Main checked ${time(review.lastCheckedAt)}. ` : ""}${pending ? "New content is awaiting review in Codex." : "Updates come from your daily Codex task."}`;
  $("review-summary").hidden = !review.summary;
  $("review-summary").querySelector("p").textContent = review.summary ?? "";
  $("architecture-source").href = sourceLink({
    path: "docs/architecture.md",
    line: 1,
    revision: review.revision,
  });
}
function view() {
  const chosen = location.hash.slice(1);
  return ["overview", "quiz", "progress"].includes(chosen)
    ? chosen
    : "overview";
}
function renderView() {
  const current = view();
  $("continue").hidden = current === "quiz";
  for (const name of ["overview", "quiz", "progress"])
    $(name).hidden = current !== name;
  for (const link of document.querySelectorAll(".learn-views a")) {
    if (link.hash === `#${current}`) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}
function openQuiz(chosenTopic = "") {
  if (busy) return;
  topic = chosenTopic;
  activeKey = "";
  selected = "";
  result = null;
  location.hash = "quiz";
  renderQuiz();
  $("question").querySelector("h2")?.focus();
}
function render() {
  const learned = state.questions.filter((q) => q.status === "learned").length;
  const remaining = state.questions.filter(due).length;
  const archived = state.questions.filter(
    (q) => q.status === "archived",
  ).length;
  $("due-count").textContent = remaining ? String(remaining) : "";
  $("continue").textContent = learned ? "Continue learning" : "Start learning";
  $("continue").disabled = !connected || !remaining;
  $("overview-progress").textContent =
    `${learned} of ${state.questions.length - archived} active questions learned · ${remaining} to explore${archived ? ` · ${archived} archived` : ""}`;
  $("progress-summary").textContent =
    `${learned} learned in the current architecture. Earlier versions stay here with their original answers.`;
  $("progress-location").textContent = `Saved at ${state.progressPath}`;
  renderMap();
  renderTopics();
  renderQuiz();
  renderHistory();
  renderView();
  renderReview();
}
function wrapLabel(text, measure, width) {
  const lines = [""];
  for (const word of text.split(" ")) {
    const candidate = (lines.at(-1) + " " + word).trim();
    if (measure.measureText(candidate).width <= width) {
      lines[lines.length - 1] = candidate;
      continue;
    }
    if (lines.at(-1)) lines.push("");
    for (const character of word) {
      if (measure.measureText(lines.at(-1) + character).width > width)
        lines.push("");
      lines[lines.length - 1] += character;
    }
  }
  return lines;
}
function renderMap() {
  const { nodes, edges } = state.graph;
  if (!nodes.length) {
    $("architecture-map").textContent =
      "The first Codex review will create your architecture map and questions.";
    $("map-detail").textContent = "";
    return;
  }
  if (!nodes.some((node) => node.id === selectedNode))
    selectedNode = nodes[0]?.id ?? "";
  // Breadth-first placement leaves cycles intact. Returning edges run
  // above the diagram; clicking a part names every connection in text too.
  const depth = new Map([[nodes[0].id, 0]]);
  const visit = [nodes[0].id];
  while (visit.length) {
    const current = visit.shift();
    for (const edge of edges.filter((edge) => edge.from === current)) {
      if (!depth.has(edge.to)) {
        depth.set(edge.to, depth.get(current) + 1);
        visit.push(edge.to);
      }
    }
  }
  const columns = [];
  for (const node of nodes) {
    const rank = depth.get(node.id) ?? 0;
    (columns[rank] ??= []).push(node);
  }
  const nodeWidth = 156;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = `500 12px ${getComputedStyle($("architecture-map")).fontFamily}`;
  const nodeLines = new Map(
    nodes.map((node) => [
      node.id,
      wrapLabel(node.label, measure, nodeWidth - 24),
    ]),
  );
  const nodeHeight = Math.max(
    90,
    ...[...nodeLines.values()].map((lines) => lines.length * 16 + 30),
  );
  const rowStep = nodeHeight + 26;
  const height = Math.max(...columns.map((col) => col.length)) * rowStep + 48;
  const width = columns.length * 180 + 24;
  const positions = new Map();
  columns.forEach((column, rank) =>
    column.forEach((node, row) => {
      positions.set(node.id, {
        x: 20 + rank * 180,
        y: 45 + (height - 48 - column.length * rowStep) / 2 + row * rowStep,
      });
    }),
  );
  let returnLane = 0;
  const connections = edges
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      let path;
      if (from.x < to.x) {
        const x = from.x + nodeWidth;
        const y = from.y + nodeHeight / 2;
        path = `M${x},${y} C${x + 24},${y} ${to.x - 24},${to.y + nodeHeight / 2} ${to.x - 5},${to.y + nodeHeight / 2}`;
      } else if (from.x === to.x) {
        const downward = to.y > from.y;
        path = `M${from.x + 78},${from.y + (downward ? nodeHeight : 0)} L${to.x + 78},${to.y + (downward ? -5 : nodeHeight + 5)}`;
      } else {
        path = `M${from.x + 78},${from.y} V${14 + returnLane++ * 12} H${to.x + 78} V${to.y - 5}`;
      }
      const active = edge.from === selectedNode || edge.to === selectedNode;
      return `<path d="${path}" class="learn-edge${active ? " selected" : ""}" marker-end="url(#${active ? "arrow-active" : "arrow"})"/>`;
    })
    .join("");
  const boxes = nodes
    .map((node) => {
      const point = positions.get(node.id);
      const lines = nodeLines.get(node.id);
      return `<g class="learn-node${node.id === selectedNode ? " selected" : ""}" data-node="${escape(node.id)}" role="button" tabindex="0" aria-label="${escape(node.label)}" aria-pressed="${node.id === selectedNode}" transform="translate(${point.x} ${point.y})">
      <rect width="${nodeWidth}" height="${nodeHeight}" rx="7"/>
      <text x="12" y="${nodeHeight / 2 - (lines.length - 1) * 8 + 4}">${lines.map((line, index) => `<tspan x="12" dy="${index ? 16 : 0}">${escape(line)}</tspan>`).join("")}</text></g>`;
    })
    .join("");
  $("architecture-map").innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-label="Hallvi components and directed connections">
    <defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" /></marker>
      <marker id="arrow-active" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" /></marker></defs>
    ${connections}${boxes}</svg>`;
  const name = (id) => nodes.find((node) => node.id === id)?.label ?? id;
  const link = (id) =>
    `<button type="button" class="text-button" data-node="${escape(id)}">${escape(name(id))}</button>`;
  const list = (direction) =>
    edges
      .filter((edge) => edge[direction] === selectedNode)
      .map(
        (edge) =>
          `<li>${link(edge[direction === "from" ? "to" : "from"])}${edge.label ? ` <span class="muted">· ${escape(edge.label)}</span>` : ""}</li>`,
      )
      .join("");
  const incoming = list("to");
  const outgoing = list("from");
  $("map-detail").innerHTML = `<h3>${escape(name(selectedNode))}</h3><div>
    ${incoming ? `<div><h4>Receives from</h4><ul>${incoming}</ul></div>` : ""}
    ${outgoing ? `<div><h4>Connects to</h4><ul>${outgoing}</ul></div>` : ""}</div>`;
}
function renderTopics() {
  if (!state) return;
  const search = $("concept-search").value.trim().toLowerCase();
  const opened = new Set(
    [...$("topics").querySelectorAll("details[open]")].map(
      (el) => el.dataset.topic,
    ),
  );
  $("topics").innerHTML =
    groups()
      .map((group) => {
        const all = state.questions.filter((q) => q.topic === group);
        const shown = all.filter((q) =>
          `${q.title} ${q.description} ${q.answer}`
            .toLowerCase()
            .includes(search),
        );
        if (!shown.length) return "";
        const learned = all.filter((q) => q.status === "learned").length;
        return `<details class="learn-topic" data-topic="${escape(group)}" ${search || opened.has(group) ? "open" : ""}>
      <summary><span>${escape(group)}</span><span class="muted">${learned} / ${all.length} learned</span></summary>
      <div class="learn-topic-body"><button class="secondary" data-practice="${escape(group)}">Learn this topic</button>
      <dl>${shown
        .map(
          (
            q,
          ) => `<div><dt>${escape(q.title)} <span class="learn-status" data-status="${q.status}">${labels[q.status]}</span></dt>
        <dd>${escape(q.explanation)} <a class="learn-source-link" href="${sourceLink(q.source)}">Source</a></dd></div>`,
        )
        .join("")}</dl></div></details>`;
      })
      .join("") ||
    '<p class="empty">No concepts match. Try another search.</p>';
}
function renderQuiz() {
  if (!state) return;
  const topics = ["", ...groups()];
  if (!topics.includes(topic)) topic = "";
  $("mobile-topic").innerHTML = topics
    .map(
      (group) =>
        `<option value="${escape(group)}" ${group === topic ? "selected" : ""}>${escape(group || "All topics")}</option>`,
    )
    .join("");
  $("quiz-topics").innerHTML = topics
    .map((group) => {
      const count = state.questions.filter(
        (q) => due(q) && (!group || q.topic === group),
      ).length;
      return `<button type="button" data-quiz-topic="${escape(group)}" aria-pressed="${group === topic}"><span>${escape(group || "All topics")}</span><span>${count}</span></button>`;
    })
    .join("");
  renderQuestion();
}
function renderQuestion() {
  let question = state.questions.find((q) => key(q) === activeKey);
  if (!question || question.status === "archived") {
    question = queue()[0];
    activeKey = question ? key(question) : "";
    selected = "";
    result = null;
  }
  if (!state.questions.length) {
    $("question").innerHTML =
      '<h2 tabindex="-1">Your learning catalog is being prepared.</h2><p>Ask Codex to update the learning dashboard, or check the daily task in Codex if a review failed. Your saved progress is kept.</p>';
    return;
  }
  if (!question) {
    $("question").innerHTML =
      `<h2 tabindex="-1">You're up to date${topic ? " on this topic" : ""}.</h2>
      <p class="learn-empty-copy">Every active question here is learned. New or changed material will join your queue automatically.</p>
      <a href="#overview" class="text-button">Explore the architecture</a> · <a href="#progress" class="text-button">Review your progress or restore archived questions</a>`;
    return;
  }
  const learned = question.status === "learned";
  const answered = Boolean(result) || learned;
  const disabled = busy || !connected;
  $("question").innerHTML = `
    <h2 tabindex="-1">${escape(question.prompt)}</h2>
    <p class="learn-question-meta">${escape(question.topic)} · <span class="learn-status" data-status="${question.status}">${labels[question.status]}</span> · ${queue().length} remaining</p>
    <p class="learn-prompt">${escape(question.description)}</p>
    <form id="answer-form"><fieldset ${disabled || answered ? "disabled" : ""}><legend class="visually-hidden">Choose an answer</legend>
      <div class="learn-options">${question.options
        .map(
          (option, index) => `
        <label class="learn-option${answered && option === question.answer ? " correct" : ""}${result && !result.correct && option === selected ? " incorrect" : ""}">
          <input type="radio" name="answer" value="${escape(option)}" ${selected === option ? "checked" : ""} required>
          <span class="learn-option-letter" aria-hidden="true">${String.fromCharCode(65 + index)}</span><span>${escape(option)}</span>
        </label>`,
        )
        .join("")}</div></fieldset>
      ${
        answered
          ? ""
          : `<div class="learn-answer-actions"><button class="primary" type="submit" ${disabled ? "disabled" : ""}>${busy ? "Saving…" : "Check answer"}</button>
        <button class="text-button" type="button" data-next ${disabled ? "disabled" : ""}>Later</button>
        <button class="text-button" type="button" data-archive ${disabled ? "disabled" : ""}>Archive question</button></div>`
      }
    </form>
    ${
      answered
        ? `<section class="learn-explanation" aria-label="Answer explanation">
      <h3 tabindex="-1">${result && !result.correct ? "Not quite. Keep this one in your queue." : "Correct. Your progress is saved."}</h3>
      <p><strong>${escape(question.answer)}.</strong> ${escape(question.explanation)}</p>
      <button class="primary" type="button" data-next ${disabled ? "disabled" : ""}>Next question</button></section>`
        : ""
    }
    <p class="learn-question-source"><a href="${sourceLink(question.source)}">Read the source</a> <span class="footnote">${escape(question.source.path)}:${question.source.line}</span></p>`;
}
function renderHistory() {
  if (!state) return;
  const filter = $("history-filter").value;
  const rows = state.history.filter(
    (row) =>
      filter === "all" ||
      (filter === "obsolete"
        ? ["removed", "changed"].includes(row.reason)
        : row.reason === filter),
  );
  const opened = new Set(
    [...$("learning-history").querySelectorAll("details[open]")].map(
      (el) => el.dataset.key,
    ),
  );
  $("learning-history").innerHTML =
    rows
      .map((row) => {
        const q = row.question;
        const label =
          row.reason === "changed" ? "Earlier version" : labels[row.reason];
        return `<details class="learn-history-row" data-key="${escape(key(q))}" ${opened.has(key(q)) ? "open" : ""}>
      <summary><span>${escape(q.title)}</span><span class="learn-status" data-status="${row.reason}">${label}</span>
        <time datetime="${escape(row.updatedAt)}">${new Date(row.updatedAt).toLocaleDateString()}</time></summary>
      <div class="learn-history-body"><p>${escape(q.description)}</p><p><strong>Answer: ${escape(q.answer)}</strong></p>
        <p class="muted">${row.attempts} attempt${row.attempts === 1 ? "" : "s"}${row.selected ? ` · last answer: ${escape(row.selected)}` : ""}${row.completedAt ? ` · learned ${new Date(row.completedAt).toLocaleString()}` : ""}</p>
        ${
          ["removed", "changed"].includes(row.reason)
            ? '<p class="footnote">Kept as history. This version no longer belongs to the current quiz.</p>'
            : `<button class="secondary" data-history-action="${row.reason === "archived" ? "restore" : "archive"}" data-id="${escape(q.id)}" data-version="${escape(q.version)}" ${busy || !connected ? "disabled" : ""}>${row.reason === "archived" ? "Restore question" : "Archive question"}</button>`
        }</div></details>`;
      })
      .join("") ||
    '<p class="learn-history-empty">No saved progress here yet. Answer a question or archive one, and it will appear here.</p>';
}
async function save(action) {
  if (busy || !connected) return;
  const savedFrom = view();
  let saved = false;
  busy = true;
  mutation++;
  renderQuestion();
  renderHistory();
  try {
    const answer = await request(action);
    if (action.action === "answer") result = answer;
    if (action.action === "archive") {
      activeKey = "";
      result = null;
    }
    // Read back what reached disk before claiming that it is saved.
    state = await request();
    signature = JSON.stringify([
      state.sourceVersion,
      state.history,
      state.checkout,
    ]);
    $("learning-error").hidden = true;
    $("quiz-message").textContent =
      action.action === "answer"
        ? answer.correct
          ? "Correct answer saved."
          : "Attempt saved. This question stays in your queue."
        : action.action === "archive"
          ? "Question archived. You can restore it from Your progress."
          : "Question restored.";
    saved = true;
  } catch (error) {
    result = null;
    fail(error);
    // A source change during an answer must never become a completed question.
    connected = false;
  } finally {
    busy = false;
    render();
    if (view() === savedFrom) {
      const target = !saved
        ? $("learning-error")
        : savedFrom === "quiz"
          ? $("question").querySelector(
              action.action === "answer" && result
                ? ".learn-explanation h3"
                : "h2",
            )
          : $("learning-history").querySelector(
              `[data-key="${CSS.escape(`${action.id}@${action.version}`)}"] summary`,
            ) || $("progress-title");
      if (target) {
        if (!target.matches("summary")) target.tabIndex = -1;
        target.focus();
      }
    }
  }
}
$("continue").addEventListener("click", () => openQuiz());
$("concept-search").addEventListener("input", renderTopics);
$("history-filter").addEventListener("change", renderHistory);
$("mobile-topic").addEventListener("change", (event) =>
  openQuiz(event.target.value),
);
document.addEventListener("change", (event) => {
  if (event.target.matches('input[name="answer"]'))
    selected = event.target.value;
});
document.addEventListener("submit", (event) => {
  if (event.target.id !== "answer-form") return;
  event.preventDefault();
  const question = state.questions.find((q) => key(q) === activeKey);
  if (question && selected)
    void save({
      action: "answer",
      id: question.id,
      version: question.version,
      selected,
    });
});
function chooseNode(node) {
  selectedNode = node;
  const focusedInMap = $("architecture-map").contains(document.activeElement);
  renderMap();
  if (focusedInMap)
    $("architecture-map")
      .querySelector(`[data-node="${CSS.escape(node)}"]`)
      ?.focus();
}
document.addEventListener("click", (event) => {
  const node = event.target.closest("[data-node]");
  if (node) {
    chooseNode(node.dataset.node);
    return;
  }
  const practice = event.target.closest("[data-practice]");
  if (practice) {
    openQuiz(practice.dataset.practice);
    return;
  }
  const group = event.target.closest("[data-quiz-topic]");
  if (group) {
    openQuiz(group.dataset.quizTopic);
    return;
  }
  const next = event.target.closest("[data-next]");
  if (next && !busy) {
    deferred.add(activeKey);
    activeKey = "";
    selected = "";
    result = null;
    renderQuiz();
    $("question").querySelector("h2")?.focus();
  }
  const archive = event.target.closest("[data-archive]");
  if (archive) {
    const question = state.questions.find((q) => key(q) === activeKey);
    void save({
      action: "archive",
      id: question.id,
      version: question.version,
    });
  }
  const history = event.target.closest("[data-history-action]");
  if (history)
    void save({
      action: history.dataset.historyAction,
      id: history.dataset.id,
      version: history.dataset.version,
    });
});
document.addEventListener("keydown", (event) => {
  const node = event.target.closest("g[data-node]");
  if (node && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    chooseNode(node.dataset.node);
  }
});
window.addEventListener("hashchange", renderView);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refresh();
});
renderView();
void refresh();
setInterval(() => {
  if (!document.hidden) void refresh();
}, 5000);
