export interface TranslateOptions {
  /** Optional MyMemory email (raises quota to ~50k words/day). Not required. */
  email?: string;
  /** Hard per-request timeout. MyMemory caps a query at MAX_QUERY_LENGTH chars. */
  timeoutMs?: number;
  maxQueryLength?: number;
}

export interface TranslateResult {
  ok: boolean;
  translated: string;
  detectedSourceLanguage?: string;
  error?: { code: string; message: string };
}

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";

export const MAX_QUERY_LENGTH = 500;

/** Short, human-friendly message for "quota exhausted" errors. */
function quotaMessage(detail: string, status: number): string {
  const m = detail.match(/NEXT AVAILABLE IN\s+([^.]*)/i);
  if (m && m[1]) return `ใช้ quota แปลฟรีของวันนี้หมดแล้ว (HTTP ${status}) — แปลได้อีกใน ${m[1].trim()}`;
  return `ใช้ quota แปลฟรีของวันนี้หมดแล้ว (HTTP ${status}) — รอ reset แล้วลองใหม่`;
}

/**
 * Turn a block of text into chunks no longer than `max` chars, breaking at
 * whitespace when possible so words stay intact. Never throws.
 */
export function splitLongText(text: string, max = MAX_QUERY_LENGTH): string[] {
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  let current = "";
  for (const word of text.split(/(\s+)/)) {
    if ((current + word).length > max) {
      if (current.trim()) chunks.push(current.trim());
      // A single word longer than max: hard-cut it.
      let rest = word;
      while (rest.length > max) {
        chunks.push(rest.slice(0, max));
        rest = rest.slice(max);
      }
      current = rest;
    } else {
      current += word;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}

function callMyMemory(q: string, email: string | undefined, timeoutMs: number): Promise<TranslateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const params = new URLSearchParams({ q, langpair: "en|th" });
  if (email) params.set("de", email);

  return fetch(`${MYMEMORY_URL}?${params.toString()}`, {
    signal: controller.signal,
    headers: { Accept: "application/json" },
  })
    .then(async (res) => {
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        const isQuota =
          res.status === 429 ||
          res.status === 403 ||
          /USED ALL AVAILABLE|QUOTA|RATE.LIMIT/i.test(detail);
        throw {
          code: isQuota ? "QUOTA" : "API_ERROR",
          message: isQuota ? quotaMessage(detail, res.status) : `MyMemory HTTP ${res.status}: ${detail}`,
        };
      }
      return res.json();
    })
    .then((data) => {
      const status = Number((data as { responseStatus?: number }).responseStatus);
      if (status !== 200) {
        const d = data as { responseDetails?: string };
        if (status === 429 || /USED ALL AVAILABLE|QUOTA|RATE.LIMIT/i.test(d.responseDetails || "")) {
          throw { code: "QUOTA", message: quotaMessage(d.responseDetails || "", status) };
        }
        throw {
          code: status === 403 ? "QUOTA" : "API_ERROR",
          message: d.responseDetails || `MyMemory error status ${status}`,
        };
      }
      const translated = (data as { responseData?: { translatedText?: string } })
        .responseData?.translatedText;
      if (typeof translated !== "string" || translated.trim().length === 0) {
        throw { code: "EMPTY_RESPONSE", message: "MyMemory returned no translation" };
      }
      return { ok: true as const, translated, detectedSourceLanguage: "en" as const };
    })
    .catch((err) => {
      if (err instanceof Error && err.name === "AbortError") {
        return {
          ok: false as const,
          translated: "",
          error: { code: "TIMEOUT", message: "Translation timed out" },
        };
      }
      if (err && typeof err === "object" && "code" in err) {
        return { ok: false as const, translated: "", error: err as { code: string; message: string } };
      }
      return {
        ok: false as const,
        translated: "",
        error: { code: "NETWORK", message: err instanceof Error ? err.message : String(err) },
      };
    })
    .finally(() => clearTimeout(timer));
}

/**
 * Translate a single paragraph EN->TH. If the paragraph exceeds the API's
 * query length, it is split into sub-chunks, each translated, then joined
 * back so the caller gets one translated paragraph back.
 */
export async function translateText(
  text: string,
  opts: TranslateOptions = {},
): Promise<TranslateResult> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const max = opts.maxQueryLength ?? MAX_QUERY_LENGTH;

  if (text.length <= max) {
    return callMyMemory(text, opts.email, timeoutMs);
  }

  const parts = splitLongText(text, max);
  const translatedParts: string[] = [];
  for (const part of parts) {
    const r = await callMyMemory(part, opts.email, timeoutMs);
    if (!r.ok) return r;
    translatedParts.push(r.translated);
  }
  return { ok: true, translated: translatedParts.join(" "), detectedSourceLanguage: "en" };
}

/**
 * Translate several distinct segments in one HTTP call where the combined
 * length stays under the limit, then return them in the same order. Segments
 * are joined with a separator unlikely to occur in plain prose; after
 * translation we split on the same separator.
 */
export async function translateSegments(
  segments: string[],
  opts: TranslateOptions = {},
): Promise<Array<TranslateResult>> {
  if (segments.length === 0) return [];

  const timeoutMs = opts.timeoutMs ?? 15000;
  const max = opts.maxQueryLength ?? MAX_QUERY_LENGTH;
  const sep = "\n<<<SEP>>>\n";

  const batches: string[][] = [[]];
  let currentLen = 0;
  for (const s of segments) {
    const add = s.length + (currentLen === 0 ? 0 : sep.length);
    if (currentLen + add <= max) {
      batches[batches.length - 1]!.push(s);
      currentLen += add;
    } else {
      batches.push([s]);
      currentLen = s.length;
    }
  }

  // A single segment could still exceed the limit just like translateText.
  const results: TranslateResult[] = [];
  for (const batch of batches) {
    const combined = batch.join(sep);
    const res = await translateText(combined, opts); // reuses split logic if needed
    if (!res.ok) {
      results.push(...batch.map(() => res));
      continue;
    }
    const pieces = res.translated.split(sep);
    batch.forEach((_, i) => {
      const piece = pieces[i]?.trim() ?? "";
      if (piece.length === 0) {
        results.push({
          ok: false,
          translated: "",
          error: { code: "EMPTY_RESPONSE", message: "ส่วนนี้แปลกลับมาเป็นข้อความว่าง (ผลอาจถูกกระจายผิดตำแหน่ง)" },
        });
      } else {
        results.push({ ok: true, translated: piece, detectedSourceLanguage: "en" });
      }
    });
  }
  return results;
}
