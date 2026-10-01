// A small Markdown renderer for developer documents: headings, paragraphs,
// flat lists, pipe tables, fenced code,
// bold, italics, code spans and links. Every character of source text is
// HTML-escaped; raw HTML never passes through.

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
const safeHref = (href: string) =>
  /^(https?:\/\/|mailto:|#|\/|\.{0,2}\/|[a-z0-9_.-]+(\/|\.md|#|$))/i.test(
    href,
  ) && !/^[a-z]+:/i.test(href.replace(/^https?:|^mailto:/i, ""));

function inline(text: string, linkBase?: string): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (/^`[^`]+`$/.test(part))
        return `<code>${escape(part.slice(1, -1))}</code>`;
      let html = escape(part);
      html = html.replace(
        /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g,
        (_match, label: string, href: string) =>
          safeHref(href)
            ? `<a href="${linkBase && !/^(#|https?:|mailto:)/i.test(href) ? escape(new URL(href.replace(/&amp;/g, "&"), linkBase).href) : href}">${label}</a>`
            : label,
      );
      html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      html = html.replace(
        /(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g,
        "$1<em>$2</em>",
      );
      html = html.replace(
        /(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,;:!?]|$)/g,
        "$1<em>$2</em>",
      );
      return html;
    })
    .join("");
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
const listItem = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

export function renderMarkdown(source: string, linkBase?: string): string {
  const renderInline = (text: string) => inline(text, linkBase);
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  const paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      out.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph.length = 0;
    }
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^```/.test(line)) {
      flush();
      const language = line.slice(3).trim();
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^```/.test(lines[index]))
        code.push(lines[index++]);
      index++;
      out.push(
        `<pre><code${language ? ` class="language-${escape(language)}"` : ""}>${escape(code.join("\n"))}</code></pre>`,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const text = heading[2].trim();
      out.push(
        `<h${level} id="${slug(text)}">${renderInline(text)}</h${level}>`,
      );
      index++;
      continue;
    }
    if (/^\|/.test(line) && /^\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) {
      flush();
      const header = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && /^\|/.test(lines[index]))
        rows.push(cells(lines[index++]));
      out.push(
        `<table><thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
      );
      continue;
    }
    if (listItem.test(line)) {
      flush();
      const ordered = /\d/.test(listItem.exec(line)![2]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = listItem.exec(lines[index]);
        if (!item || /\d/.test(item[2]) !== ordered) break;
        let text = item[3];
        index++;
        while (
          index < lines.length &&
          /^\s{2,}\S/.test(lines[index]) &&
          !listItem.test(lines[index])
        )
          text += ` ${lines[index++].trim()}`;
        items.push(`<li>${renderInline(text)}</li>`);
      }
      out.push(
        `<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`,
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index]))
        quote.push(lines[index++].replace(/^>\s?/, ""));
      out.push(
        `<blockquote>${renderMarkdown(quote.join("\n"), linkBase)}</blockquote>`,
      );
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      out.push("<hr>");
      index++;
      continue;
    }
    if (!line.trim()) {
      flush();
      index++;
      continue;
    }
    paragraph.push(line.trim());
    index++;
  }
  flush();
  return out.join("\n");
}

const icon = (paths: string) =>
  `<svg class="nav-icon" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

// One navigation for every page. The client-routed pages (data-route) keep the
// ids dashboard.js uses to mark the current one without a reload.
const navigation: [
  string,
  [href: string, label: string, paths: string, id?: string][],
][] = [
  [
    "Checks",
    [
      [
        "/",
        "Run checks",
        '<circle cx="8" cy="8" r="6.25"/><path d="M6.75 5.75v4.5L10.25 8z"/>',
        "checks-link",
      ],
      [
        "/evals",
        "Eval archive",
        '<rect x="2" y="2.75" width="12" height="3.25" rx="1"/><path d="M3 6v6.25a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6M6.5 9h3"/>',
        "reviews-link",
      ],
      [
        "/about",
        "How it works",
        '<circle cx="8" cy="8" r="6.25"/><path d="M8 7.25v3.5M8 5.25v.01"/>',
        "about-link",
      ],
      [
        "/guide",
        "Acceptance guide",
        '<path d="M4 1.75h5.25l3.25 3.25v8.75a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2.25a.5.5 0 0 1 .5-.5z"/><path d="M9.25 1.75V5h3.25M6 8.5h4M6 11h3"/>',
      ],
    ],
  ],
  [
    "Learn",
    [
      [
        "/learn",
        "Learn Hallvi",
        '<circle cx="4" cy="4" r="1.75"/><circle cx="12" cy="4" r="1.75"/><circle cx="8" cy="12" r="1.75"/><path d="M5.75 4h4.5M4.8 5.6l2.4 4.8M11.2 5.6l-2.4 4.8"/>',
      ],
    ],
  ],
  [
    "Environment",
    [
      [
        "/development",
        "Development",
        '<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5"/><path d="m4.5 6.25 2 1.75-2 1.75M8 10h3.5"/>',
        "development-link",
      ],
      [
        "/releases",
        "Releases",
        '<path d="M8 1.75 13.75 5v6L8 14.25 2.25 11V5z"/><path d="M2.25 5 8 8.25 13.75 5M8 8.25v6"/>',
        "releases-link",
      ],
    ],
  ],
  [
    "Agents",
    [
      [
        "/feedback",
        "Agent feedback",
        '<path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H6.5l-3 2.5V11a1 1 0 0 1-1-1z"/>',
      ],
      [
        "/features",
        "Agent features",
        '<path d="M6 12.25h4M6.75 14.25h2.5M8 1.75a4.25 4.25 0 0 0-2.5 7.7c.4.3.5.7.5 1.05v.25h4v-.25c0-.35.1-.75.5-1.05A4.25 4.25 0 0 0 8 1.75z"/>',
      ],
    ],
  ],
];

/**
 * The dashboard's sidebar. `page` marks the current server-rendered page;
 * dashboard.html passes none and lets its script mark the routed one.
 */
export function sidebar(appUrl: string, page = "") {
  const groups = navigation
    .map(
      ([group, links]) =>
        `<div class="nav-group"><h2>${group}</h2>${links
          .map(([href, label, paths, id]) => {
            const current =
              href === page || (href === "/learn" && page.startsWith("/learn"));
            return `<a href="${href}"${id ? ` id="${id}" data-route` : ""}${current ? ' aria-current="page"' : ""}>${icon(paths)}<span>${label}</span>${id === "reviews-link" ? '<span id="pending" class="chip discuss" hidden></span>' : ""}</a>`;
          })
          .join("")}</div>`,
    )
    .join("");
  return `<aside class="sidebar">
    <a class="brand" href="/"${page ? "" : " data-route"}><span class="brand-mark" aria-hidden="true">H</span><strong>Hallvi</strong><span class="brand-tag">Dev</span></a>
    <nav class="pages" aria-label="Pages">${groups}</nav>
    <div class="sidebar-foot"><a href="${escape(appUrl)}/applications" target="_blank" rel="noreferrer">${icon('<path d="M9.5 2.25h4.25V6.5M13.75 2.25 7.5 8.5M12 9.5v3.25a1 1 0 0 1-1 1H3.25a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1H6.5"/>')}<span>Open app</span><span class="visually-hidden"> (opens in a new tab)</span></a><span id="origin" class="local"></span></div>
  </aside>`;
}

/**
 * Read-only documents inside the dashboard shell, without a client script.
 */
export function guidePage(
  body: string,
  title: string,
  appUrl: string,
  page = "/guide",
) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} · Hallvi Testing</title><link rel="stylesheet" href="/dashboard.css"></head>
<body>
  ${sidebar(appUrl, page)}
  <main class="guide"><article class="markdown">${body}</article></main>
</body></html>`;
}
