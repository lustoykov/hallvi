import { expect, it } from "vitest";
import { guidePage, renderMarkdown } from "../../dashboard/markdown";

const sample = `# Phase 1 guide

Status: **maintained**, with *emphasis*, \`code <b>\` and a [link](https://example.com) plus [bad](javascript:alert(1)) and <script>alert(1)</script>.

## Cases

| Entry | Expected |
| --- | --- |
| P1-01 | **Pass** with \`<run>\` |

- one
- two **bold**
  continued line

1. first
2. second

\`\`\`sh
npm test <x>
\`\`\`
`;

it("renders the guide's constructs and escapes everything else", () => {
  const html = renderMarkdown(sample);
  expect(html).toContain('<h1 id="phase-1-guide">Phase 1 guide</h1>');
  expect(html).toContain("<strong>maintained</strong>");
  expect(html).toContain("<em>emphasis</em>");
  expect(html).toContain("<code>code &lt;b&gt;</code>");
  expect(html).toContain('<a href="https://example.com">link</a>');
  expect(html).not.toContain("javascript:");
  expect(html).toContain("bad and &lt;script&gt;alert(1)&lt;/script&gt;.");
  expect(html).toContain('<h2 id="cases">Cases</h2>');
  expect(html).toContain(
    "<table><thead><tr><th>Entry</th><th>Expected</th></tr></thead><tbody><tr><td>P1-01</td><td><strong>Pass</strong> with <code>&lt;run&gt;</code></td></tr></tbody></table>",
  );
  expect(html).toContain(
    "<ul><li>one</li><li>two <strong>bold</strong> continued line</li></ul>",
  );
  expect(html).toContain("<ol><li>first</li><li>second</li></ol>");
  expect(html).toContain(
    '<pre><code class="language-sh">npm test &lt;x&gt;</code></pre>',
  );
  expect(html).not.toMatch(/<(script|img|iframe)/);
});
it("wraps the rendered guide in the dashboard shell without scripts", () => {
  const page = guidePage("<p>body</p>", "Acceptance <guide>");
  expect(page).toContain(
    "<title>Acceptance &lt;guide&gt; · Server Guy Testing</title>",
  );
  expect(page).toContain('<link rel="stylesheet" href="/dashboard.css">');
  expect(page).toContain(
    '<a href="/guide" aria-current="page">Acceptance guide</a>',
  );
  expect(page).toContain('<article class="markdown"><p>body</p></article>');
  expect(page).not.toContain("<script");
});
