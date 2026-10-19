import { Fragment, type ReactNode } from "react";

import { markdownBlocks, type MarkdownBlock } from "@/lib/markdown-blocks.mjs";

/**
 * Renders the Markdown subset Pi writes in chat: paragraphs, headings, bullet
 * and numbered lists, fenced code, quotes, tables, emphasis, inline code, and
 * links.
 * Everything becomes React elements, so the text can never carry HTML through.
 * The blocks are read by the parser the plugin panel shares.
 */
export function Markdown({ source }: { source: string }) {
  return <>{markdownBlocks(source).map(renderBlock)}</>;
}

function renderBlock(block: MarkdownBlock, key: number): ReactNode {
  switch (block.type) {
    case "code":
      return (
        <pre key={key}>
          <code>{block.text}</code>
        </pre>
      );
    case "heading":
      return (
        <p className="hv-md-heading" key={key}>
          <strong>{renderInline(block.text)}</strong>
        </p>
      );
    case "list": {
      const items = block.items.map((item, itemIndex) => (
        <li key={itemIndex}>{renderInline(item)}</li>
      ));
      return block.ordered ? (
        <ol key={key}>{items}</ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case "quote":
      return <blockquote key={key}>{renderLines(block.lines)}</blockquote>;
    case "table":
      return (
        <div className="hv-md-table" key={key}>
          <table>
            <thead>
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return <p key={key}>{renderLines(block.lines)}</p>;
  }
}

/** Single newlines inside a paragraph stay visible as line breaks. */
function renderLines(lines: string[]): ReactNode {
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {renderInline(line.trim())}
    </Fragment>
  ));
}

const INLINE =
  /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*((?:[^*\n]|\*(?!\*))+?)\*\*|(?<![A-Za-z0-9])__([^_\n]+?)__(?![A-Za-z0-9])|\*([^*\s](?:[^*\n]*?[^*\s])?)\*|(?<![A-Za-z0-9])_([^_\s](?:[^_\n]*?[^_\s])?)_(?![A-Za-z0-9])|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)/g;

/**
 * `insideLink` stops a link from growing another link inside itself. The
 * commonest sentence this product writes is the one handing over the
 * application — `[http://127.0.0.1:3000](http://127.0.0.1:3000)` — whose link
 * text is a URL, and the bare-URL rule used to wrap that text in a second
 * anchor. Nested anchors are invalid HTML, so React's hydration failed and
 * threw away the whole message.
 */
function renderInline(text: string, insideLink = false): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  // matchAll iterates its own copy of the pattern, so the recursive calls
  // below cannot reset this loop's position.
  for (const match of text.matchAll(INLINE)) {
    const [
      whole,
      ,
      code,
      bold,
      boldAlt,
      emphasis,
      emphasisAlt,
      linkText,
      linkHref,
      bareUrl,
    ] = match;
    if (match.index > last) nodes.push(text.slice(last, match.index));
    last = match.index + whole.length;
    if (code !== undefined) {
      nodes.push(<code key={key++}>{code.trim()}</code>);
    } else if (bold !== undefined || boldAlt !== undefined) {
      nodes.push(
        <strong key={key++}>
          {renderInline(bold ?? boldAlt, insideLink)}
        </strong>,
      );
    } else if (emphasis !== undefined || emphasisAlt !== undefined) {
      nodes.push(
        <em key={key++}>
          {renderInline(emphasis ?? emphasisAlt, insideLink)}
        </em>,
      );
    } else if (linkText !== undefined) {
      const inner = renderInline(linkText, true);
      nodes.push(
        insideLink ? (
          <Fragment key={key++}>{inner}</Fragment>
        ) : (
          <a href={linkHref} key={key++} rel="noreferrer" target="_blank">
            {inner}
          </a>
        ),
      );
    } else if (bareUrl !== undefined) {
      // Sentence punctuation after a pasted URL is not part of it.
      const trailing = /[.,;:!?]+$/.exec(bareUrl)?.[0] ?? "";
      const href = bareUrl.slice(0, bareUrl.length - trailing.length);
      nodes.push(
        insideLink ? (
          <Fragment key={key++}>{href}</Fragment>
        ) : (
          <a href={href} key={key++} rel="noreferrer" target="_blank">
            {href}
          </a>
        ),
      );
      if (trailing) nodes.push(trailing);
    }
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
