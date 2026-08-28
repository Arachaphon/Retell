import * as cheerio from "cheerio";
import type {
  Chapter,
  FicMetadata,
  ParseResult,
  Parser,
} from "./base.ts";
import {
  buildMetadata,
  extractParagraphs,
  findMainContent,
  normalizeText,
  stripNoise,
} from "./base.ts";
import { fetchHtml } from "./fetch.ts";

const WATTPAD_HOSTS = [
  "wattpad.com",
  "www.wattpad.com",
  "read-wattpad.com",
  "www.read-wattpad.com",
];

/**
 * Wattpad parser.
 * Story metadata comes from <meta> tags. Chapter paragraphs are usually in
 * `div#story-text` (server-rendered). Some pages are JS-only; in that case we
 * detect the missing body and return NOT_CONTENT with a hint rather than a
 * graceful-but-empty success.
 */
export class WattpadParser implements Parser {
  hostnames = WATTPAD_HOSTS;

  async fetch(url: string): Promise<ParseResult> {
    const fetched = await fetchHtml(url);
    if (!fetched.ok) {
      return { ok: false, url, error: fetched.error };
    }
    return this.parse(fetched.html, fetched.finalUrl);
  }

  parse(html: string, url: string): ParseResult {
    try {
      const $ = cheerio.load(html);
      const metadata: FicMetadata = buildMetadata($);

      const $body = $("#story-text").first();
      if (!$body.length) {
        // Wattpad often ships content via JS. If there's no story-text at all,
        // report it clearly instead of guessing.
        return {
          ok: false,
          url,
          error: {
            code: "NOT_CONTENT",
            message:
              "No #story-text found. Wattpad may require a JS-rendered page; try the read-wattpad.com mirror, or paste chapter text manually.",
          },
        };
      }

      const clone = $body.clone();
      stripNoise($, clone);
      const paragraphs = extractParagraphs($, clone);

      if (paragraphs.length === 0) {
        return {
          ok: false,
          url,
          error: { code: "NO_MAIN_CONTENT", message: "Chapter container found but empty" },
        };
      }

      const chapters: Chapter[] = [{ index: 1, paragraphs }];

      return {
        ok: true,
        url,
        title: metadata.title,
        author: metadata.author,
        metadata,
        chapters,
      };
    } catch (err) {
      return {
        ok: false,
        url,
        error: {
          code: "PARSE_FAILED",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

export function isWattpadUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return WATTPAD_HOSTS.includes(host) || host.endsWith(".wattpad.com");
  } catch {
    return false;
  }
}
