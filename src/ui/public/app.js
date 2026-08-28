const form = document.getElementById("url-form");
const urlInput = document.getElementById("url-input");
const content = document.getElementById("content");
const status = document.getElementById("status");
const docTitle = document.getElementById("doc-title");
const docAuthor = document.getElementById("doc-author");
const modeToggle = document.getElementById("mode-toggle");
const reader = document.getElementById("reader");
const fontSm = document.getElementById("font-sm");
const fontLg = document.getElementById("font-lg");
const landing = document.getElementById("landing");

let currentMode = "side";

function setStatus(msg, isError = false) {
  status.textContent = msg;
  status.style.color = isError ? "#c0392b" : "var(--muted)";
}

function showContent(result) {
  content.classList.remove("hidden");
  landing.classList.add("hidden");

  docTitle.textContent = result.title ?? "ไม่ระบุชื่อเรื่อง";
  docAuthor.textContent = result.author ? `โดย ${result.author}` : "";

  let html = "";
  for (const chapter of result.chapters) {
    if (chapter.title) html += `<h2 class="chapter-title">${escapeHtml(chapter.title)}</h2>`;
    for (const p of chapter.paragraphs) {
      const en = escapeHtml(p.source);
      const th = p.ok
        ? escapeHtml(p.translated)
        : `<span class="para-failed">⚠ แปลไม่สำเร็จ${p.error ? ` (${escapeHtml(p.error)})` : ""}</span>`;
      html += `
        <div class="para-row">
          <div class="para-col">
            <div class="label">อังกฤษ</div>
            <p>${en}</p>
          </div>
          <div class="para-col">
            <div class="label">ไทย</div>
            <p>${th}</p>
          </div>
        </div>`;
    }
  }
  content.innerHTML = html;
  applyMode();
  setStatus("");
}

function showError(msg) {
  content.classList.add("hidden");
  landing.classList.remove("hidden");
  setStatus(msg, true);
}

function applyMode() {
  reader.dataset.mode = currentMode;
  reader.classList.toggle("mode-alternate", currentMode === "alternate");
}

function setMode(mode) {
  currentMode = mode;
  applyMode();
  for (const b of modeToggle.querySelectorAll(".seg-btn")) {
    const active = b.dataset.mode === mode;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", String(active));
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  content.classList.add("hidden");
  setStatus("กำลังดึงข้อมูลและแปล…");
  try {
    const res = await fetch(`/read?url=${encodeURIComponent(url)}`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok !== true) {
      const msg = data?.error?.message ?? `ไม่สามารถอ่านได้ (HTTP ${res.status})`;
      showError(msg);
      return;
    }
    showContent(data);
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  }
});

modeToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".seg-btn");
  if (btn) setMode(btn.dataset.mode);
});

fontSm.addEventListener("click", () => {
  const root = document.documentElement;
  const cur = parseFloat(getComputedStyle(root).getPropertyValue("--font-size")) || 16;
  root.style.setProperty("--font-size", `${Math.max(12, cur - 1)}px`);
});

fontLg.addEventListener("click", () => {
  const root = document.documentElement;
  const cur = parseFloat(getComputedStyle(root).getPropertyValue("--font-size")) || 16;
  root.style.setProperty("--font-size", `${Math.min(26, cur + 1)}px`);
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

applyMode();
