export type MarkdownBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; text: string }
  | { type: "quote"; lines: string[] }
  | { type: "table"; head: string[]; rows: string[][] };

export function markdownBlocks(source: string): MarkdownBlock[];
