import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Markdown } from "../../../src/components/hallvi/markdown";

const render = (source: string) =>
  renderToStaticMarkup(<Markdown source={source} />);

describe("chat markdown", () => {
  it("renders the constructs Pi uses in replies", () => {
    const html = render(
      [
        "Hi! The **todo-fastapi** Launch Brief is *complete*.",
        "",
        "Ensure the App can read `https://github.com/qa/todo`:",
        "",
        "1. In GitHub, check the integration has access—select it if access is",
        "   limited to specific repositories.",
        "2. Return to Hallvi and retry.",
        "",
        "- one",
        "- two",
        "",
        "```sh",
        "npm test <x>",
        "```",
        "",
        "> quoted",
        "",
        "## Next",
        "See [the docs](https://example.com/docs) or https://example.com/plain.",
      ].join("\n"),
    );
    expect(html).toContain(
      "<p>Hi! The <strong>todo-fastapi</strong> Launch Brief is <em>complete</em>.</p>",
    );
    expect(html).toContain("<code>https://github.com/qa/todo</code>:</p>");
    expect(html).toContain(
      "<ol><li>In GitHub, check the integration has access—select it if access is limited to specific repositories.</li><li>Return to Hallvi and retry.</li></ol>",
    );
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<pre><code>npm test &lt;x&gt;</code></pre>");
    expect(html).toContain("<blockquote>quoted</blockquote>");
    expect(html).toContain(
      '<p class="hv-md-heading"><strong>Next</strong></p>',
    );
    expect(html).toContain(
      '<a href="https://example.com/docs" rel="noreferrer" target="_blank">the docs</a>',
    );
    expect(html).toContain(
      '<a href="https://example.com/plain" rel="noreferrer" target="_blank">https://example.com/plain</a>.</p>',
    );
  });

  it("leaves plain text, brackets, and unsafe links alone", () => {
    expect(render("[QA fixture reply] Hello [slow]")).toBe(
      "<p>[QA fixture reply] Hello [slow]</p>",
    );
    expect(render("priority: Fast recovery matters most")).toBe(
      "<p>priority: Fast recovery matters most</p>",
    );
    expect(render("snake_case_name stays_put and 5 * 3 * 2")).toBe(
      "<p>snake_case_name stays_put and 5 * 3 * 2</p>",
    );
    expect(render("**bold with *nested* emphasis**")).toBe(
      "<p><strong>bold with <em>nested</em> emphasis</strong></p>",
    );
    expect(render("<script>alert(1)</script> [x](javascript:alert(1))")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt; [x](javascript:alert(1))</p>",
    );
  });

  it("never puts a link inside a link", () => {
    // The handover sentence: the link text is the URL, so the bare-URL rule
    // used to wrap it in a second anchor. Nested anchors are invalid HTML and
    // React's hydration threw away the whole message when it met them.
    const handover = render(
      "**[http://127.0.0.1:3000](http://127.0.0.1:3000)**",
    );
    expect(handover).toBe(
      '<p><strong><a href="http://127.0.0.1:3000" rel="noreferrer" target="_blank">http://127.0.0.1:3000</a></strong></p>',
    );
    expect(handover.match(/<a /g)).toHaveLength(1);
    const labelled = render("Open [the app](https://example.com/app) now.");
    expect(labelled).toBe(
      '<p>Open <a href="https://example.com/app" rel="noreferrer" target="_blank">the app</a> now.</p>',
    );
    // A bare URL on its own still becomes one link.
    expect(render("Reach it at https://example.com/app.")).toBe(
      '<p>Reach it at <a href="https://example.com/app" rel="noreferrer" target="_blank">https://example.com/app</a>.</p>',
    );
  });

  it("keeps single newlines visible inside a paragraph", () => {
    expect(render("Application: todo\nPermission policy: Pi decides")).toBe(
      "<p>Application: todo<br/>Permission policy: Pi decides</p>",
    );
  });
});
