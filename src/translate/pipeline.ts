import { translateText } from "./google.ts";

export interface ParagraphPair {
  /** 0-based index into the chapter's paragraph list. */
  index: number;
  source: string;
  translated: string;
  ok: boolean;
  error?: string;
}

export interface TranslatedChapter {
  index: number;
  title?: string;
  paragraphs: ParagraphPair[];
}

export interface PipelineOptions {
  apiKey?: string;
  /** Max paragraphs processed per call; keep under function timeout. */
  batchSize?: number;
  /** Session-only cache keyed by source text. Reduces re-calling the API. */
  cache?: Map<string, string>;
}

export interface PipelineResult {
  ok: boolean;
  translated: ParagraphPair[];
  failed: number;
  error?: { code: string; message: string };
}

const DEFAULT_CACHE = new Map<string, string>();

/**
 * Translate a single chapter's paragraphs EN->TH, preserving paragraph order
 * and mapping each source paragraph to its translation. On per-paragraph
 * failure we keep the pair with ok=false so the UI can degrade gracefully
 * instead of dropping content.
 */
export async function translateChapter(
  sourceParagraphs: string[],
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const cache = opts.cache ?? DEFAULT_CACHE;
  const batchSize = opts.batchSize ?? 20;
  const translated: ParagraphPair[] = [];
  let failed = 0;

  for (let i = 0; i < sourceParagraphs.length; i++) {
    const source = sourceParagraphs[i]!;

    if (cache.has(source)) {
      translated.push({ index: i, source, translated: cache.get(source)!, ok: true });
      continue;
    }

    const res = await translateText(source, { apiKey: opts.apiKey });

    if (res.ok) {
      cache.set(source, res.translated);
      translated.push({ index: i, source, translated: res.translated, ok: true });
    } else {
      failed++;
      translated.push({
        index: i,
        source,
        translated: "",
        ok: false,
        error: res.error?.message ?? "translation failed",
      });
      // Stop early on auth/API-level failures to save quota and time.
      const code = res.error?.code;
      if (code === "NO_API_KEY" || code === "API_ERROR") {
        return { ok: false, translated, failed, error: res.error };
      }
    }

    // Respect batch size to stay under serverless timeout; yield between batches.
    if ((i + 1) % batchSize === 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return { ok: failed === 0, translated, failed };
}
