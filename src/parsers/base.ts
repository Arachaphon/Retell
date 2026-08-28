import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { Cheerio, CheerioAPI } from "cheerio";

export interface FicMetadata {
  author?: string;
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
  publishedAt?: string;
  language?: string;
}

export interface Chapter {
  title?: string;
  index: number;
  paragraphs: string[];
}

export type ParseErrorCode =
  | "NOT_CONTENT"
  | "EMPTY"
  | "NO_MAIN_CONTENT"
  | "PARSE_FAILED"
  | "UNSUPPORTED"
  | "TIMEOUT";

export interface ParseError {
  code: ParseErrorCode;
  message: string;
}

export type ParseResult =
  | {
      ok: true;
      url: string;
      title?: string;
      author?: string;
      metadata: FicMetadata;
      chapters: Chapter[];
    }
  | {
      ok: false;
      url: string;
      error: ParseError;
    };

export interface Parser {
  /** Hostname patterns this parser handles, e.g. ["archiveofourown.org"] */
  hostnames: string[];
  /** Fetch the URL and parse it. Must never throw. */
  fetch(url: string): Promise<ParseResult>;
  /** Parse fetched HTML into structured fic content. Must never throw. */
  parse(html: string, url: string): ParseResult;
}

export const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "form",
  "button",
  "svg",
  "nav",
  "header",
  "footer",
  "aside",
  "ad",
  "ads",
  "advertisement",
  ".ad",
  ".ads",
  ".advertisement",
  ".sponsor",
  ".promo",
  ".banner",
  ".affiliate",
  ".breadcrumb",
  ".menu",
  ".sidebar",
  ".pagination",
  ".social",
  ".share",
  ".twitter-tweet",
];

const HIDDEN_ATTRS = /(^|\s)(hidden|sr-only|visually-hidden|offscreen|screen-reader-text)(\s|$)/i;

function isHidden($el: Cheerio<AnyNode>): boolean {
  if ($el.attr("hidden") !== undefined) return true;
  const aria = $el.attr("aria-hidden");
  if (aria && aria.toLowerCase() === "true") return true;
  const cls = $el.attr("class");
  if (cls && HIDDEN_ATTRS.test(cls)) return true;
  const style = $el.attr("style");
  if (style && /display\s*:\s*none/i.test(style)) return true;
  return false;
}

/** Remove noise elements from a cloned root before extracting text. */
export function stripNoise($: CheerioAPI, root: Cheerio<AnyNode>): void {
  root.find(NOISE_SELECTORS.join(",")).each((_, el) => {
    const $el = $(el);
    if (isHidden($el)) $el.remove();
    else if (el.tagName) {
      const tag = el.tagName.toLowerCase();
      // Remove standalone ad/nav containers; keep inline content fallback.
      if (/^(script|style|noscript|iframe|form|button|svg|nav|footer|aside)$/.test(tag)) {
        $el.remove();
      } else {
        // For class/attr-matched noise, remove entirely.
        $el.remove();
      }
    }
  });
  root.find("*").each((_, el) => {
    const $el = $(el);
    if (isHidden($el)) $el.remove();
  });
}

/**
 * Readability-style: pick the content node by text density (text length
 * minus link text, per container). Falls back gracefully, never throws.
 */
export function findMainContent($: CheerioAPI, candidates: string[]): Cheerio<AnyNode> | null {
  for (const sel of candidates) {
    const $c = $(sel).first();
    if ($c.length > 0) {
      // A direct match on a known content container is good enough.
      return $c;
    }
  }

  // Fallback: score paragraph-dense containers.
  let best: Cheerio<AnyNode> | null = null;
  let bestScore = -1;
  $("article, main, section, div").each((_, el) => {
    const $el = $(el);
    if (isHidden($el)) return;
    const text = $el.text();
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned.length < 200) return;
    const linkText = $el.find("a").text().replace(/\s+/g, "").length;
    const score = cleaned.length - linkText;
    if (score > bestScore) {
      bestScore = score;
      best = $el;
    }
  });
  return best;
}

/** Extract paragraphs from a content node (text of <p> or block text blocks). */
export function extractParagraphs(
  $: CheerioAPI,
  content: Cheerio<AnyNode>,
): string[] {
  const paragraphs: string[] = [];
  content.find("p, pre, blockquote, h1, h2, h3, h4, h5, h6, li, br").each((_, el) => {
    if (el.tagName?.toLowerCase() === "br") {
      return;
    }
    const $el = $(el);
    if (isHidden($el)) return;
    const text = normalizeText($el.text());
    if (text.length > 0) paragraphs.push(text);
  });

  // If no block elements found, split the whole text on blank lines.
  if (paragraphs.length === 0) {
    const whole = normalizeText(content.text());
    for (const block of splitOnBlankLines(whole)) {
      const t = block.trim();
      if (t.length > 0) paragraphs.push(t);
    }
  }
  return paragraphs;
}

export function normalizeText(input: string): string {
  return input.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function splitOnBlankLines(input: string): string[] {
  return input
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((s) => s.replace(/\n+/g, " ").trim())
    .filter((s) => s.length > 0);
}

export function getMeta($: CheerioAPI, name: string): string | undefined {
  const v =
    $(`meta[property="${name}"]`).attr("content") ||
    $(`meta[name="${name}"]`).attr("content");
  return v ? v.trim() : undefined;
}

export function buildMetadata($: CheerioAPI): FicMetadata {
  return {
    title:
      getMeta($, "og:title") ||
      getMeta($, "twitter:title") ||
      $("title").first().text().trim() ||
      undefined,
    description:
      getMeta($, "og:description") ||
      getMeta($, "twitter:description") ||
      getMeta($, "description") ||
      undefined,
    author: getMeta($, "article:author") || getMeta($, "author") || undefined,
    image: getMeta($, "og:image") || getMeta($, "twitter:image") || undefined,
    publishedAt:
      getMeta($, "article:published_time") ||
      getMeta($, "datePublished") ||
      undefined,
    siteName: getMeta($, "og:site_name") || undefined,
    language: $("html").attr("lang") || undefined,
  };
}
