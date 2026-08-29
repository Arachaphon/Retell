import type { Chapter } from "./base.ts";

/**
 * Split pasted text into paragraphs, using blank lines as the primary
 * paragraph separator (as most fanfic/novel text uses them). Always yields a
 * single chapter (multi-chapter splitting is out of scope for now).
 */
export function parsePastedParagraphs(text: string): string[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ");

  const hasDoubleNewline = /\n[ \t]*\n/.test(normalized);

  const blocks = hasDoubleNewline
    ? normalized.split(/\n[ \t]*\n/)
    : normalized.split(/\n+/);

  return blocks
    .map((block) => block.replace(/\n+/g, " ").replace(/[ \t]+/g, " ").trim())
    .filter((block) => block.length > 0);
}

export function parsePastedText(text: string): { chapters: Chapter[]; isEmpty: boolean } {
  const paragraphs = parsePastedParagraphs(text);
  if (paragraphs.length === 0) {
    return { chapters: [], isEmpty: true };
  }
  return { chapters: [{ index: 1, paragraphs }], isEmpty: false };
}
