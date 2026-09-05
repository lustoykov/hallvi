import { Fragment, type ReactNode } from "react";

/**
 * Renders the Markdown subset Pi writes in chat: paragraphs, headings, bullet
 * and numbered lists, fenced code, quotes, emphasis, inline code, and links.
 * Everything becomes React elements, so the text can never carry HTML through.
 */
export function Markdown({ source }: { source: string }) {
  return <>{parseBlocks(source).map(renderBlock)}</>;
}

type Block =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; text: string }
  | { type: "quote"; lines: string[] };

const FENCE = /^\s*```/;
const HEADING = /^#{1,6}\s+(.*)$/;
const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+(.*)$/;
const ORDERED_ITEM = /^\s{0,3}\d{1,3}[.)]\s/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index++;
      continue;
    }

    if (FENCE.test(line)) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !FENCE.test(lines[index])) {
        code.push(lines[index]);
        index++;
      }
      index++;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", text: heading[1].trim() });
      index++;
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const ordered = ORDERED_ITEM.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const item = LIST_ITEM.exec(lines[index]);
        if (item && ORDERED_ITEM.test(lines[index]) === ordered) {
          items.push(item[1]);
          index++;
          // Wrapped item text continues until a blank line or the next item.
          while (
            index < lines.length &&
            lines[index].trim() &&
            !LIST_ITEM.test(lines[index]) &&
            !FENCE.test(lines[index]) &&
            !HEADING.test(lines[index])
          ) {
            items[items.length - 1] += ` ${lines[index].trim()}`;
            index++;
          }
          // A single blank line between items keeps the list together.
          if (
            index < lines.length - 1 &&
            !lines[index].trim() &&
            LIST_ITEM.test(lines[index + 1]) &&
            ORDERED_ITEM.test(lines[index + 1]) === ordered
          )
            index++;
        } else break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        quoted.push(QUOTE.exec(lines[index])![1]);
        index++;
      }
      blocks.push({ type: "quote", lines: quoted });
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !FENCE.test(lines[index]) &&
      !HEADING.test(lines[index]) &&
      !LIST_ITEM.test(lines[index]) &&
      !QUOTE.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index++;
    }
    blocks.push({ type: "paragraph", lines: paragraph });
  }

  return blocks;
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case "code":
      return (
        <pre key={key}>
          <code>{block.text}</code>
        </pre>
      );
    case "heading":
      return (
        <p className="sg-md-heading" key={key}>
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

function renderInline(text: string): ReactNode[] {
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
      nodes.push(<strong key={key++}>{renderInline(bold ?? boldAlt)}</strong>);
    } else if (emphasis !== undefined || emphasisAlt !== undefined) {
      nodes.push(<em key={key++}>{renderInline(emphasis ?? emphasisAlt)}</em>);
    } else if (linkText !== undefined) {
      nodes.push(
        <a href={linkHref} key={key++} rel="noreferrer" target="_blank">
          {renderInline(linkText)}
        </a>,
      );
    } else if (bareUrl !== undefined) {
      // Sentence punctuation after a pasted URL is not part of it.
      const trailing = /[.,;:!?]+$/.exec(bareUrl)?.[0] ?? "";
      const href = bareUrl.slice(0, bareUrl.length - trailing.length);
      nodes.push(
        <a href={href} key={key++} rel="noreferrer" target="_blank">
          {href}
        </a>,
      );
      if (trailing) nodes.push(trailing);
    }
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
