import type { Chapter } from "./base.ts";

/**
 * Split pasted text into paragraphs, using blank lines as the primary
 * paragraph separator (as most fanfic/novel text uses them). Always yields a
 * single chapter (multi-chapter splitting is out of scope for now).
 */
export function parsePastedParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, " ")
    .split(/\n[ \t]*\n/)
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
