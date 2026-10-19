/**
 * The Markdown subset Pi writes, read into blocks: paragraphs, headings,
 * bullet and numbered lists, fenced code, quotes and tables. Inline text is
 * left as written; each renderer draws it its own way.
 *
 * One parser for the application and the plugin panel. The panel is a single
 * HTML file with no bundler, so the plugin server writes this function's own
 * source into it, which is why everything it uses lives inside it.
 */
export function markdownBlocks(source) {
  const FENCE = /^\s*```/;
  const HEADING = /^#{1,6}\s+(.*)$/;
  const LIST_ITEM = /^\s{0,3}(?:[-*+•]|\d{1,3}[.)])\s+(.*)$/;
  const ORDERED_ITEM = /^\s{0,3}\d{1,3}[.)]\s/;
  const QUOTE = /^\s{0,3}>\s?(.*)$/;
  const TABLE_ROW = /^\s*\|.*\|\s*$/;
  const TABLE_RULE = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/;

  /** A header row with its rule under it; pipes alone are just text. */
  const startsTable = (lines, index) =>
    TABLE_ROW.test(lines[index]) && TABLE_RULE.test(lines[index + 1] ?? "");
  /**
   * A row's cells. The closing pipe may still be on its way while a reply
   * streams, and `\|` is a pipe inside a cell rather than the end of one.
   */
  const cells = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/(?<!\\)\|$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replaceAll("\\|", "|"));

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index++;
      continue;
    }

    if (FENCE.test(line)) {
      const code = [];
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
      const items = [];
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
      const quoted = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        quoted.push(QUOTE.exec(lines[index])[1]);
        index++;
      }
      blocks.push({ type: "quote", lines: quoted });
      continue;
    }

    if (startsTable(lines, index)) {
      const head = cells(line);
      const rows = [];
      index += 2;
      // Once the table has begun, a line that opens with a pipe is a row,
      // drawn as wide as the header, so a row does not flip between text and
      // table while it is being written.
      while (index < lines.length && /^\s*\|/.test(lines[index])) {
        const row = cells(lines[index]);
        rows.push(head.map((_, column) => row[column] ?? ""));
        index++;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !FENCE.test(lines[index]) &&
      !HEADING.test(lines[index]) &&
      !LIST_ITEM.test(lines[index]) &&
      !QUOTE.test(lines[index]) &&
      !startsTable(lines, index)
    ) {
      paragraph.push(lines[index]);
      index++;
    }
    blocks.push({ type: "paragraph", lines: paragraph });
  }

  return blocks;
}
