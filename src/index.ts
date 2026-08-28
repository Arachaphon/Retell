import { Hono } from "hono";
import { fetchAndParse } from "./parsers/registry.ts";
import { translateChapter } from "./translate/pipeline.ts";

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

app.get("/read", async (c) => {
  const url = c.req.query("url");
  if (!url) {
    return c.json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing url param" } }, 400);
  }

  let valid: URL;
  try {
    valid = new URL(url);
  } catch {
    return c.json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid URL" } }, 400);
  }

  const parsed = await fetchAndParse(valid.href);
  if (!parsed.ok) {
    return c.json(parsed, 422);
  }

  const translatedChapters = [];
  for (const chapter of parsed.chapters) {
    const res = await translateChapter(chapter.paragraphs);
    translatedChapters.push({
      index: chapter.index,
      title: chapter.title,
      paragraphs: res.translated,
    });
  }

  return c.json({
    ok: true,
    url: parsed.url,
    title: parsed.title,
    author: parsed.author,
    metadata: parsed.metadata,
    chapters: translatedChapters,
  });
});

const port = Number(process.env.PORT ?? 3000);
export default {
  port,
  fetch: app.fetch,
};

console.log(`Bilingual Reader listening on http://localhost:${port}`);
