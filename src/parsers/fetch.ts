import type { ParseError } from "../parsers/base.ts";

export interface FetchResult {
  html: string;
  finalUrl: string;
}

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_BODY_BYTES = 15_000_000;
const BLOCK_PATTERNS: Array<{ re: RegExp; code: "NOT_CONTENT"; hint: string }> = [
  { re: /challenge-platform|cf-browser-verification|Just a moment/i, code: "NOT_CONTENT", hint: "Cloudflare challenge" },
  { re: /access denied|blocked by|unusual traffic/i, code: "NOT_CONTENT", hint: "blocked" },
  { re: /\bcaptcha\b/i, code: "NOT_CONTENT", hint: "captcha" },
  { re: /sign in|log in|login required|you must be logged/i, code: "NOT_CONTENT", hint: "login required" },
];

/**
 * Fetch a URL like a browser enough to pass basic bot checks.
 * Never throws the raw error up: returns either html or a parse-style error.
 */
export async function fetchHtml(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false; error: ParseError }> {
  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
      },
    });
    clearTimeout(timer);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: { code: "TIMEOUT", message: `Request timed out after ${timeoutMs}ms` } };
    }
    return { ok: false, error: { code: "PARSE_FAILED", message: err instanceof Error ? err.message : String(err) } };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: { code: "NOT_CONTENT", message: `HTTP ${res.status} ${res.statusText}` },
    };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml\+xml|xml/i.test(contentType)) {
    return {
      ok: false,
      error: { code: "PARSE_FAILED", message: `Unexpected content-type: ${contentType}` },
    };
  }

  let html: string;
  try {
    html = await res.text();
  } catch (err) {
    return {
      ok: false,
      error: { code: "PARSE_FAILED", message: err instanceof Error ? err.message : String(err) },
    };
  }

  if (html.length === 0) {
    return { ok: false, error: { code: "EMPTY", message: "Empty response body" } };
  }

  for (const p of BLOCK_PATTERNS) {
    if (p.re.test(html)) {
      return { ok: false, error: { code: p.code, message: `Looks like ${p.hint}, not content` } };
    }
  }

  if (html.length > MAX_BODY_BYTES) {
    return { ok: false, error: { code: "NOT_CONTENT", message: "Response body too large" } };
  }

  return { ok: true, html, finalUrl: res.url || url };
}
