import type { Parser, ParseResult } from "./base.ts";
import { Ao3Parser, isAo3Url } from "./ao3.ts";
import { isWattpadUrl, WattpadParser } from "./wattpad.ts";

const ao3 = new Ao3Parser();
const wattpad = new WattpadParser();

const PARSERS: Parser[] = [ao3, wattpad];

/**
 * Resolve a URL to its parser by matching hostnames, falling back to a
 * hostname suffix check that doesn't throw on malformed input.
 */
export function resolveParser(url: string): { parser: Parser } | { error: ParseResult } {
  if (isAo3Url(url)) return { parser: ao3 };
  if (isWattpadUrl(url)) return { parser: wattpad };
  return {
    error: {
      ok: false,
      url,
      error: {
        code: "UNSUPPORTED",
        message: `No parser supports this URL's site (${hostOf(url) ?? "unknown host"})`,
      },
    },
  };
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export async function fetchAndParse(url: string): Promise<ParseResult> {
  const resolved = resolveParser(url);
  if ("error" in resolved) return resolved.error;
  return resolved.parser.fetch(url);
}
