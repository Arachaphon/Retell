export interface TranslateOptions {
  apiKey?: string;
  timeoutMs?: number;
}

export interface TranslateResult {
  ok: boolean;
  translated: string;
  detectedSourceLanguage?: string;
  error?: { code: string; message: string };
}

const GOOGLE_V2_URL = "https://translation.googleapis.com/language/translate/v2";

/**
 * Translate a single text fragment EN->TH via Google Translate v2 (REST).
 * Free quota applies; caller should chunk and cache (see pipeline.ts).
 */
export async function translateText(
  text: string,
  opts: TranslateOptions = {},
): Promise<TranslateResult> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY;
  const timeoutMs = opts.timeoutMs ?? 15000;

  if (!apiKey) {
    return {
      ok: false,
      translated: "",
      error: { code: "NO_API_KEY", message: "GOOGLE_API_KEY env var is not set" },
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const body = new URLSearchParams({
      q: text,
      source: "en",
      target: "th",
      format: "text",
      key: apiKey,
    });

    const res = await fetch(GOOGLE_V2_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        translated: "",
        error: { code: "API_ERROR", message: `Google Translate HTTP ${res.status}: ${detail}` },
      };
    }

    const data = (await res.json()) as {
      data?: { translations?: Array<{ translatedText?: string; detectedSourceLanguage?: string }> };
    };

    const t = data?.data?.translations?.[0];
    if (!t || typeof t.translatedText !== "string") {
      return {
        ok: false,
        translated: "",
        error: { code: "EMPTY_RESPONSE", message: "Google Translate returned no translation" },
      };
    }

    return {
      ok: true,
      translated: t.translatedText,
      detectedSourceLanguage: t.detectedSourceLanguage,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, translated: "", error: { code: "TIMEOUT", message: "Translation timed out" } };
    }
    return {
      ok: false,
      translated: "",
      error: { code: "NETWORK", message: err instanceof Error ? err.message : String(err) },
    };
  }
}
