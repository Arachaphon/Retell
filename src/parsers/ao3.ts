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

const AO3_HOSTS = [
  "archiveofourown.org",
  "www.archiveofourown.org",
];

/**
 * AO3 parser.
 * Structure: each chapter sits in `div#chapters div.chapter`, with the fic
 * body inside `.userstuff` (block paragraphs in <p>). Title in `<h2.title>`,
 * author in `a[rel="author"]`. Works without JS; paragraphs are pure HTML.
 */
export class Ao3Parser implements Parser {
  hostnames = AO3_HOSTS;

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

      if (!metadata.title) {
        const h2 = $("h2.title").first().text();
        if (h2.trim()) metadata.title = normalizeText(h2);
      }

      if (!metadata.author) {
        const authorLink = $("a[rel='author']").first();
        if (authorLink.length) metadata.author = normalizeText(authorLink.text());
      }

      // Empty/no main content detection.
      const chapterCount = $(".chapter").length;
      if (chapterCount === 0 && $(".userstuff").length === 0) {
        return {
          ok: false,
          url,
          error: { code: "NO_MAIN_CONTENT", message: "No AO3 chapter content found" },
        };
      }

      const chapters: Chapter[] = [];
      $(".chapter").each((idx, el) => {
        const $ch = $(el);
        let $body = $ch.find(".userstuff").first();
        if (!$body.length) $body = $ch;

        const chTitle = normalizeText($ch.find("h3, h4.title").first().text()) || undefined;

        // Clone so we don't mutate the original tree while iterating.
        const cloneBody = $body.clone();
        stripNoise($, cloneBody);
        const paragraphs = extractParagraphs($, cloneBody);

        chapters.push({ title: chTitle, index: idx + 1, paragraphs });
      });

      // If no .chapter containers found, fall back to the single userstuff.
      if (chapters.length === 0) {
        const $userstuff = $(".userstuff").first();
        if ($userstuff.length) {
          const clone = $userstuff.clone();
          stripNoise($, clone);
          const paragraphs = extractParagraphs($, clone);
          if (paragraphs.length > 0) {
            chapters.push({ index: 1, paragraphs });
          }
        }
      }

      // Final fallback: readability-style main content scan.
      if (chapters.length === 0) {
        const main = findMainContent($, ["#chapters", ".userstuff", "article"]);
        if (main) {
          const clone = main.clone();
          stripNoise($, clone);
          const paragraphs = extractParagraphs($, clone);
          if (paragraphs.length > 0) {
            chapters.push({ index: 1, paragraphs });
          }
        }
      }

      if (chapters.length === 0) {
        return {
          ok: false,
          url,
          error: { code: "NO_MAIN_CONTENT", message: "No readable chapters extracted" },
        };
      }

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

export function isAo3Url(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return AO3_HOSTS.includes(host) || host.endsWith(".archiveofourown.org");
  } catch {
    return false;
  }
}
