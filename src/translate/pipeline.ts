import { translateSegments } from "./free.ts";
import type { TranslateOptions } from "./free.ts";

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
  /** Max paragraphs processed per call; keep under function timeout. */
  batchSize?: number;
  /** Session-only cache keyed by source text. Reduces re-calling the API. */
  cache?: Map<string, string>;
  /** Optional MyMemory email (raises quota). */
  email?: string;
}

export interface PipelineResult {
  ok: boolean;
  translated: ParagraphPair[];
  failed: number;
  error?: { code: string; message: string };
}

const DEFAULT_CACHE = new Map<string, string>();

function makeErr(res: { error?: { code?: string; message: string } }): string {
  return res.error?.message ?? "translation failed";
}

/**
 * Translate a chapter's paragraphs EN->TH, preserving order and the
 * source<->translation mapping. Strategy to stay under MyMemory's 500-char
 * query limit while using few calls (saving the free quota):
 *   - short paragraphs are batched into single HTTP calls (translateSegments)
 *   - a paragraph too long for one call is split, translated, re-joined
 * On failure we keep the pair with ok=false so the UI degrades gracefully.
 */
export async function translateChapter(
  sourceParagraphs: string[],
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const cache = opts.cache ?? DEFAULT_CACHE;
  const batchSize = opts.batchSize ?? 20;
  const translateOpts: TranslateOptions = { email: opts.email };

  const result: ParagraphPair[] = [];
  let failed = 0;

  for (let start = 0; start < sourceParagraphs.length; start += batchSize) {
    const slice = sourceParagraphs.slice(start, start + batchSize);

    // Partition into cached/uncached.
    const need: Array<{ index: number; source: string }> = [];
    slice.forEach((source, idx) => {
      const globalIdx = start + idx;
      if (cache.has(source)) {
        result.push({ index: globalIdx, source, translated: cache.get(source)!, ok: true });
      } else {
        need.push({ index: globalIdx, source });
      }
    });

    if (need.length === 0) continue;

    // Batch all short uncached paragraphs into as few HTTP calls as possible.
    const res = await translateSegments(need.map((n) => n.source), translateOpts);
    for (let k = 0; k < need.length; k++) {
      const r = res[k];
      const item = need[k]!;
      if (r?.ok && r.translated) {
        cache.set(item.source, r.translated);
        result.push({ index: item.index, source: item.source, translated: r.translated, ok: true });
      } else {
        failed++;
        result.push({
          index: item.index,
          source: item.source,
          translated: "",
          ok: false,
          error: r ? makeErr(r) : "translation failed",
        });
        const code = r?.error?.code;
        if (code === "QUOTA" || code === "API_ERROR") {
          return { ok: false, translated: result, failed, error: r?.error };
        }
      }
    }

    // Yield between batches to avoid hammering the API / staying under timeouts.
    if (sourceParagraphs.length > batchSize) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // Preserve original order.
  result.sort((a, b) => a.index - b.index);
  return { ok: failed === 0, translated: result, failed };
}
