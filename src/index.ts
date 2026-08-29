import { Hono } from "hono";
import type { Chapter, ParseResult } from "./parsers/base.ts";
import { fetchAndParse } from "./parsers/registry.ts";
import { parsePastedText } from "./parsers/paste.ts";
import { translateChapter } from "./translate/pipeline.ts";
import { translateText } from "./translate/free.ts";

const PUBLIC_DIR = `${import.meta.dir}/ui/public`;
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const app = new Hono();

app.get("/", (c) => {
  return new Response(Bun.file(`${PUBLIC_DIR}/index.html`), {
    headers: { "Content-Type": MIME[".html"] ?? "text/html; charset=utf-8" },
  });
});
app.get("/ui/*", async (c) => {
  const rel = c.req.path.replace(/^\/ui\//, "");
  const file = Bun.file(`${PUBLIC_DIR}/${rel}`);
  if (!(await file.exists())) return c.text("Not found", 404);
  const ext = "." + rel.split(".").pop();
  return new Response(file, {
    headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" },
  });
});

interface ReadSource {
  title?: string;
  author?: string;
  metadata?: Record<string, unknown>;
  url?: string;
  chapters: Chapter[];
}

async function toReadSource(
  url: string | undefined,
  text: string | undefined,
): Promise<ReadSource | { error: { code: string; message: string }; status: number }> {
  if (url && text) {
    return { error: { code: "BAD_REQUEST", message: "Provide either url or text, not both" }, status: 400 };
  }

  if (text !== undefined) {
    const trimmed = text.trim();
    if (!trimmed) {
      return { error: { code: "BAD_REQUEST", message: "Pasted text is empty" }, status: 400 };
    }
    const { chapters, isEmpty } = parsePastedText(trimmed);
    if (isEmpty || chapters.length === 0) {
      return { error: { code: "BAD_REQUEST", message: "No readable paragraphs found in pasted text" }, status: 400 };
    }
    return { chapters };
  }

  if (url) {
    let valid: URL;
    try {
      valid = new URL(url);
    } catch {
      return { error: { code: "BAD_REQUEST", message: "Invalid URL" }, status: 400 };
    }
    const parsed = await fetchAndParse(valid.href);
    if (!parsed.ok) {
      return { error: { code: parsed.error.code, message: parsed.error.message }, status: 422 };
    }
    return {
      chapters: parsed.chapters,
      title: parsed.title,
      author: parsed.author,
      metadata: parsed.metadata as Record<string, unknown>,
      url: parsed.url,
    };
  }

  return { error: { code: "BAD_REQUEST", message: "Missing url or text param" }, status: 400 };
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

const handleReadRequest = async (c: any) => {
  let url: string | undefined;
  let text: string | undefined;

  if (c.req.method === "POST") {
    try {
      const body = await c.req.json();
      url = body?.url;
      text = body?.text;
    } catch {}
  } else {
    url = c.req.query("url");
    text = c.req.query("text");
  }

  const source = await toReadSource(url, text);
  if ("error" in source) {
    return c.json({ ok: false, error: source.error }, source.status as 400, JSON_HEADERS);
  }

  const parsedChapters = source.chapters.map((chapter) => ({
    index: chapter.index,
    title: chapter.title,
    paragraphs: chapter.paragraphs.map((p, i) => ({
      index: i,
      source: p,
      translated: p,
      ok: true,
    })),
  }));

  return c.json(
    {
      ok: true,
      url: source.url,
      title: source.title,
      author: source.author,
      metadata: source.metadata ?? {},
      chapters: parsedChapters,
    },
    200,
    JSON_HEADERS,
  );
};

app.get("/read", handleReadRequest);
app.post("/read", handleReadRequest);

app.post("/translate", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid JSON body" } }, 400, JSON_HEADERS);
  }
  const text = (body as { source?: string })?.source;
  if (typeof text !== "string" || text.trim().length === 0) {
    return c.json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing source text" } }, 400, JSON_HEADERS);
  }
  const res = await translateText(text);
  return c.json({ ok: res.ok, translated: res.translated, error: res.error }, res.ok ? 200 : 422, JSON_HEADERS);
});

const port = Number(process.env.PORT ?? 3000);
export default {
  port,
  fetch: app.fetch,
};

console.log(`Bilingual Reader listening on http://localhost:${port}`);
