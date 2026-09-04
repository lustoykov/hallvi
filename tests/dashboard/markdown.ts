// A small Markdown renderer for the acceptance guide: headings, paragraphs, flat lists, pipe tables, fenced code,
// bold, italics, code spans and links. Every character of source text is HTML-escaped; raw HTML never passes through.

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const safeHref = (href: string) => /^(https?:\/\/|mailto:|#|\/|\.{0,2}\/|[a-z0-9_.-]+(\/|\.md|#|$))/i.test(href) && !/^[a-z]+:/i.test(href.replace(/^https?:|^mailto:/i, ""));

function inline(text: string): string {
  return text.split(/(`[^`]+`)/).map((part) => {
    if (/^`[^`]+`$/.test(part)) return `<code>${escape(part.slice(1, -1))}</code>`;
    let html = escape(part);
    html = html.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_match, label: string, href: string) => safeHref(href) ? `<a href="${href}">${label}</a>` : label);
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
    html = html.replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
    return html;
  }).join("");
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
const listItem = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  const paragraph: string[] = [];
  const flush = () => { if (paragraph.length) { out.push(`<p>${inline(paragraph.join(" "))}</p>`); paragraph.length = 0; } };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^```/.test(line)) {
      flush(); const language = line.slice(3).trim(); const code: string[] = []; index++;
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]);
      index++;
      out.push(`<pre><code${language ? ` class="language-${escape(language)}"` : ""}>${escape(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { flush(); const level = heading[1].length; const text = heading[2].trim(); out.push(`<h${level} id="${slug(text)}">${inline(text)}</h${level}>`); index++; continue; }
    if (/^\|/.test(line) && /^\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) {
      flush(); const header = cells(line); index += 2; const rows: string[][] = [];
      while (index < lines.length && /^\|/.test(lines[index])) rows.push(cells(lines[index++]));
      out.push(`<table><thead><tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (listItem.test(line)) {
      flush(); const ordered = /\d/.test(listItem.exec(line)![2]); const items: string[] = [];
      while (index < lines.length) {
        const item = listItem.exec(lines[index]);
        if (!item || /\d/.test(item[2]) !== ordered) break;
        let text = item[3]; index++;
        while (index < lines.length && /^\s{2,}\S/.test(lines[index]) && !listItem.test(lines[index])) text += ` ${lines[index++].trim()}`;
        items.push(`<li>${inline(text)}</li>`);
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush(); const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push("<hr>"); index++; continue; }
    if (!line.trim()) { flush(); index++; continue; }
    paragraph.push(line.trim()); index++;
  }
  flush();
  return out.join("\n");
}

/** The guide inside the dashboard shell: same stylesheet and topbar, no script. */
export function guidePage(body: string, title: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} · Server Guy Testing</title><link rel="stylesheet" href="/dashboard.css"></head>
<body>
  <header class="topbar">
    <a class="brand" href="/"><strong>Server Guy</strong><span class="brand-tag">Testing</span></a>
    <nav class="pages" aria-label="Pages"><a href="/">Run checks</a><a href="/evals">Eval runs</a><a href="/about">How it works</a></nav>
    <nav class="resources" aria-label="Resources"><a href="/guide" aria-current="page">Acceptance guide</a><a href="http://127.0.0.1:3000/applications" target="_blank" rel="noreferrer">Open app</a></nav>
  </header>
  <main class="guide"><article class="markdown">${body}</article></main>
</body></html>`;
}
