import {
  uid,
  getAllStories,
  getStory,
  putStory,
  deleteStory,
} from "./db.js";

const app = document.getElementById("app");
const status = document.getElementById("status");
const storyDialog = document.getElementById("story-dialog");
const homeBtn = document.getElementById("home-btn");
const fontSm = document.getElementById("font-sm");
const fontLg = document.getElementById("font-lg");
const toastEl = document.getElementById("toast");

let currentMode = "alternate";
let translating = false; // กันกดปุ่ม translate ซ้ำหลายครั้งพร้อมกัน

function setStatus(msg, isError = false) {
  status.textContent = msg;
  status.style.color = isError ? "#c0392b" : "var(--muted)";
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toast._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(ts) {
  return ts ? new Date(ts).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "";
}

async function translateOne(source) {
  const res = await fetch("/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data?.error?.message ?? `HTTP ${res.status}`,
      errorCode: data?.error?.code,
    };
  }
  return { ok: true, translated: data.translated };
}

function countByStatus(chapter) {
  const pending = chapter.paragraphs.filter((p) => p.status === "pending").length;
  const done = chapter.paragraphs.filter((p) => p.status === "done").length;
  const errors = chapter.paragraphs.filter((p) => p.status === "error").length;
  return { pending, done, errors };
}

/* =========================================================
 * LIBRARY VIEW
 * ========================================================= */
async function renderLibrary() {
  homeBtn.style.visibility = "hidden";
  const stories = await getAllStories().catch((e) => {
    setStatus("อ่าน IndexedDB ไม่สำเร็จ: " + (e?.message ?? e), true);
    return [];
  });

  let cards = "";
  for (const s of stories.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))) {
    const totalPending = s.chapters.reduce((n, ch) => n + countByStatus(ch).pending, 0);
    const cardPending = totalPending > 0 ? ` · ค้างแปล ${totalPending} ย่อหน้า` : "";
    cards += `
      <div class="book-card">
        <h3 class="book-title">${escapeHtml(s.title)}</h3>
        ${s.author ? `<div class="book-author">${escapeHtml(s.author)}</div>` : ""}
        <div class="book-meta">${s.chapters.length} ตอน · แก้ไข ${fmtDate(s.updatedAt)}${cardPending}</div>
        <div class="book-actions">
          <a href="#" class="btn-link" data-open-story="${escapeHtml(s.id)}">เปิดอ่าน</a>
          <a href="#" class="btn-link danger" data-del-story="${escapeHtml(s.id)}">ลบเรื่อง</a>
        </div>
      </div>`;
  }

  app.innerHTML = `
    <section class="library">
      <div class="lib-head">
        <h1>ชั้นวางหนังสือ</h1>
        <button id="new-story" class="btn" type="button">+ สร้างเรื่องใหม่</button>
      </div>
      ${stories.length ? `<div class="book-grid">${cards}</div>` : `<p class="empty">ยังไม่มีเรื่อง กด "สร้างเรื่องใหม่" เพื่อเริ่ม</p>`}
    </section>`;

  document.getElementById("new-story").addEventListener("click", openNewStoryDialog);
  app.querySelectorAll("[data-open-story]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      renderStory(el.dataset.openStory);
    }),
  );
  app.querySelectorAll("[data-del-story]").forEach((el) =>
    el.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("ลบเรื่องนี้และทุกตอน?") ) return;
      try {
        await deleteStory(el.dataset.delStory);
        toast("ลบเรื่องแล้ว");
        renderLibrary();
      } catch (err) {
        setStatus("ลบไม่สำเร็จ: " + (err?.message ?? err), true);
      }
    }),
  );
}

function openNewStoryDialog() {
  storyDialog.innerHTML = `
    <h2>สร้างเรื่องใหม่</h2>
    <form id="story-form">
      <label>ชื่อเรื่อง *</label>
      <input id="s-title" required placeholder="เช่น เรื่อง A" />
      <label>ผู้แต่ง (ไม่บังคับ)</label>
      <input id="s-author" placeholder="ผู้แต่ง / แหล่งที่มา" />
      <div class="dlg-actions">
        <button type="button" class="btn ghost" data-close-dlg>ยกเลิก</button>
        <button type="submit" class="btn">สร้าง</button>
      </div>
    </form>`;
  storyDialog.showModal();
  storyDialog.querySelector("[data-close-dlg]").addEventListener("click", () => storyDialog.close());
  storyDialog.querySelector("#story-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("s-title").value.trim();
    if (!title) return;
    const story = {
      id: uid(),
      title,
      author: document.getElementById("s-author").value.trim() || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: [],
    };
    try {
      await putStory(story);
      storyDialog.close();
      renderStory(story.id);
    } catch (err) {
      setStatus("บันทึกเรื่องไม่สำเร็จ: " + (err?.message ?? err), true);
    }
  });
}

/* =========================================================
 * STORY VIEW
 * ========================================================= */
async function renderStory(storyId, openChapterId = null) {
  homeBtn.style.visibility = "visible";
  const story = await getStory(storyId);
  if (!story) {
    setStatus("ไม่พบเรื่อง", true);
    renderLibrary();
    return;
  }

  let chapterItems = "";
  for (const ch of story.chapters) {
    const { pending, done, errors } = countByStatus(ch);
    const statusBadge = ` แปลแล้ว ${done} / รอ ${pending}${errors ? ` / พลาด ${errors}` : ""}`;
    chapterItems += `
      <div class="chapter-card">
        <button class="chapter-head" data-toggle-ch="${escapeHtml(ch.id)}" type="button">
          <span class="ch-title">${escapeHtml(ch.title || `ตอนที่ ${story.chapters.findIndex((c) => c.id === ch.id) + 1}`)}</span>
          <span class="ch-status">${statusBadge}</span>
          <span class="chevron">▸</span>
        </button>
        <div class="chapter-body hidden" id="ch-body-${escapeHtml(ch.id)}">
          <div class="chapter-actions">
            <a href="#" class="btn-link" data-read-ch="${escapeHtml(ch.id)}">อ่าน / แปล</a>
            <a href="#" class="btn-link" data-edit-ch="${escapeHtml(ch.id)}">แก้ไขชื่อ</a>
            <a href="#" class="btn-link danger" data-del-ch="${escapeHtml(ch.id)}">ลบตอน</a>
          </div>
        </div>
      </div>`;
  }

  app.innerHTML = `
    <section class="story">
      <div class="story-head">
        <h1>${escapeHtml(story.title)}</h1>
        ${story.author ? `<div class="book-author">${escapeHtml(story.author)}</div>` : ""}
        <div class="story-actions">
          <button id="add-chapter" class="btn" type="button">+ เพิ่มตอน</button>
        </div>
      </div>
      <div class="chapter-list">${chapterItems || `<p class="empty">ยังไม่มีตอน กด "เพิ่มตอน"</p>`}</div>
    </section>`;

  // toggle collapse
  app.querySelectorAll("[data-toggle-ch]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const body = document.getElementById(`ch-body-${btn.dataset.toggleCh}`);
      const chev = btn.querySelector(".chevron");
      if (!body) return;
      const hidden = body.classList.toggle("hidden");
      chev.textContent = hidden ? "▸" : "▾";
    }),
  );

  // open chapter
  app.querySelectorAll("[data-read-ch]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openChapter(storyId, el.dataset.readCh);
    }),
  );

  // delete chapter
  app.querySelectorAll("[data-del-ch]").forEach((el) =>
    el.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("ลบตอนนี้?")) return;
      story.chapters = story.chapters.filter((c) => c.id !== el.dataset.delCh);
      try {
        await putStory(story);
        toast("ลบตอนแล้ว");
        renderStory(storyId);
      } catch (err) {
        setStatus("ลบไม่สำเร็จ: " + (err?.message ?? err), true);
      }
    }),
  );

  // edit chapter title
  app.querySelectorAll("[data-edit-ch]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const ch = story.chapters.find((c) => c.id === el.dataset.editCh);
      if (!ch) return;
      storyDialog.innerHTML = `
        <h2>แก้ไขชื่อตอน</h2>
        <form id="edit-ch-form">
          <label>ชื่อตอน</label>
          <input id="ec-title" value="${escapeHtml(ch.title ?? "")}" placeholder="ตอนที่ 1" />
          <div class="dlg-actions">
            <button type="button" class="btn ghost" data-close-dlg>ยกเลิก</button>
            <button type="submit" class="btn">บันทึก</button>
          </div>
        </form>`;
      storyDialog.showModal();
      storyDialog.querySelector("[data-close-dlg]").addEventListener("click", () => storyDialog.close());
      storyDialog.querySelector("#edit-ch-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        ch.title = document.getElementById("ec-title").value.trim() || undefined;
        try {
          await putStory(story);
          storyDialog.close();
          renderStory(storyId);
        } catch (err) {
          setStatus("บันทึกไม่สำเร็จ: " + (err?.message ?? err), true);
        }
      });
    }),
  );

  // add chapter
  document.getElementById("add-chapter").addEventListener("click", () => openAddChapterDialog(storyId, story));

  // auto-open a chapter asked
  if (openChapterId) {
    openChapter(storyId, openChapterId);
  }
}

/* =========================================================
 * ADD CHAPTER
 * ========================================================= */
function openAddChapterDialog(storyId, story) {
  storyDialog.innerHTML = `
    <h2>เพิ่มตอนให้ "${escapeHtml(story.title)}"</h2>
    <p class="dlg-hint">วางเนื้อหาได้ 2 ทาง แล้วเลือกว่าจะใส่ในเรื่องนี้ตอนไหน</p>
    <form id="add-ch-form">
      <label>ชื่อตอน (ไม่บังคับ) — "ตอนที่" และลำดับจะนับให้อัตโนมัติ</label>
      <input id="ac-title" placeholder="ตอนที่ 1 / บทนำ" />
      <label>เนื้อหา: วางข้อความ หรือ วาง URL เพื่อดึงอัตโนมัติ</label>
      <textarea id="ac-text" rows="6" placeholder="วางข้อความ หรือ ลิงก์ AO3/Wattpad ที่นี่…"></textarea>
      <div class="dlg-actions">
        <button type="button" class="btn ghost" data-close-dlg>ยกเลิก</button>
        <button type="submit" class="btn">เพิ่มตอน</button>
      </div>
    </form>`;
  storyDialog.showModal();
  storyDialog.querySelector("[data-close-dlg]").addEventListener("click", () => storyDialog.close());

  storyDialog.querySelector("#add-ch-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = document.getElementById("ac-text").value.trim();
    const title = document.getElementById("ac-title").value.trim() || undefined;
    if (!raw) {
      setStatus("กรุณาวางข้อความหรือลิงก์", true);
      return;
    }
    setStatus("กำลังเพิ่มตอน…");
    let sourceEN = [];
    let sourceUrl;
    try {
      const isUrl = /^https?:\/\//i.test(raw);
      if (isUrl) {
        const res = await fetch(`/read?url=${encodeURIComponent(raw)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setStatus("ดึง URL ไม่สำเร็จ: " + (data?.error?.message ?? `HTTP ${res.status}`), true);
          return;
        }
        sourceUrl = data.url;
        sourceEN = (data.chapters?.[0]?.paragraphs ?? []).map((p) => p.source);
        if (!title && data.chapters?.[0]?.title) {
          // keep title from chapter if provided by user? use empty->auto naming
        }
      } else {
        const res = await fetch(`/read?text=${encodeURIComponent(raw)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setStatus("อ่านข้อความไม่สำเร็จ: " + (data?.error?.message ?? `HTTP ${res.status}`), true);
          return;
        }
        sourceEN = (data.chapters?.[0]?.paragraphs ?? []).map((p) => p.source);
      }
    } catch (err) {
      setStatus("เกิดข้อผิดพลาด: " + (err?.message ?? err), true);
      return;
    }

    if (sourceEN.length === 0) {
      setStatus("ไม่พบย่อหน้าในเนื้อหาที่วาง", true);
      return;
    }

    const chapter = {
      id: uid(),
      title,
      sourceUrl,
      paragraphs: sourceEN.map((text, i) => ({
        id: i,
        sourceEN: text,
        sourceTH: undefined,
        status: "pending",
        error: undefined,
      })),
    };
    story.chapters.push(chapter);
    try {
      await putStory(story);
      storyDialog.close();
      toast("เพิ่มตอนแล้ว (รอแปล)");
      renderStory(storyId);
    } catch (err) {
      setStatus("บันทึกตอนไม่สำเร็จ: " + (err?.message ?? err), true);
    }
  });
}

/* =========================================================
 * CHAPTER VIEW
 * ========================================================= */
async function openChapter(storyId, chapterId) {
  const story = await getStory(storyId);
  const ch = story?.chapters?.find((c) => c.id === chapterId);
  if (!story || !ch) {
    setStatus("ไม่พบตอน", true);
    return;
  }
  const { pending, done } = countByStatus(ch);
  const backBtn = `<a href="#" id="back-story" class="btn-link">← กลับไปเรื่อง</a>`;

  app.innerHTML = `
    <section class="chapter-view">
      <div class="chv-head">
        ${backBtn}
        <h1>${escapeHtml(ch.title || `ตอนที่ ${story.chapters.findIndex((c) => c.id === ch.id) + 1}`)}</h1>
        <div class="chv-actions">
          <button id="translate-now" class="btn" type="button">${pending ? "แปลต่อ" : "แปลทั้งหมด"}</button>
          <button id="copy-ch" class="btn ghost" type="button">คัดลอกบทแปล</button>
        </div>
      </div>
      <div class="chv-progress">แปลแล้ว ${done}/${ch.paragraphs.length} · รอ ${pending}</div>
      <div id="chapter-content" class="chapter-content"></div>
    </section>`;

  document.getElementById("back-story").addEventListener("click", (e) => {
    e.preventDefault();
    renderStory(storyId);
  });

  document.getElementById("translate-now").addEventListener("click", () => {
    translateChapterLoop(storyId, chapterId);
  });
  document.getElementById("copy-ch").addEventListener("click", () => copyChapter(ch));

  renderChapterBody(story, ch);
}

function renderChapterBody(story, ch) {
  const box = document.getElementById("chapter-content");
  let html = "";
  ch.paragraphs.forEach((p, i) => {
    const num = i + 1;
    if (p.status === "done" && p.sourceTH) {
      html += `<div class="para-row">
        <div class="para-col"><div class="label">อังกฤษ</div><p>${escapeHtml(p.sourceEN)}</p></div>
        <div class="para-col"><div class="label">ไทย</div><p>${escapeHtml(p.sourceTH)}</p></div>
      </div>`;
    } else if (p.status === "error") {
      html += `<div class="para-row"><div class="para-col" style="flex:1"><div class="label">อังกฤษ</div><p>${escapeHtml(p.sourceEN)}</p></div>
      <div class="para-col"><div class="label">ไทย</div><p class="para-failed">⚠ ${escapeHtml(p.error || "แปลไม่สำเร็จ")}</p></div></div>`;
    } else {
      html += `<div class="para-row pending"><div class="para-col" style="flex:1"><div class="label">อังกฤษ</div><p>${escapeHtml(p.sourceEN)}</p></div>
      <div class="para-col"><div class="label">ไทย</div><p class="para-pending">…ยังไม่แปล (${num})</p></div></div>`;
    }
  });
  box.innerHTML = html || `<p class="empty">ตอนนี้ยังไม่มีเนื้อหา</p>`;
}

async function translateChapterLoop(storyId, chapterId, update = renderChapterBody) {
  if (translating) return; // กันสแปม: กำลังแปลอยู่แล้ว ไม่เริ่มซ้ำ
  translating = true;

  let story = await getStory(storyId);
  let ch = story?.chapters?.find((c) => c.id === chapterId);
  if (!ch) {
    translating = false;
    return;
  }

  const btn = document.getElementById("translate-now");
  if (btn) btn.disabled = true;
  setStatus("กำลังแปลทีละย่อหน้า…");

  try {
    if (countByStatus(ch).pending === 0) {
      setStatus("ตอนนี้แปลครบแล้ว");
      return;
    }

    for (const p of [...ch.paragraphs]) {
      if (p.status === "done") continue;

      const r = await translateOne(p.sourceEN);
      const target = ch.paragraphs.find((cp) => cp.id === p.id);
      if (!target) continue;

      if (r.ok) {
        target.sourceTH = r.translated;
        target.status = "done";
        target.error = undefined;
      } else {
        target.status = "error";
        target.error = r.error || "translation failed";
        // ถ้า quota หมด → หยุดทันที ไม่เสียเวลา
        if (r.errorCode === "QUOTA") {
          try { await putStory(story); } catch {}
          setStatus("⚠ " + (target.error || "quota หมดแล้ว") + " — หยุดชั่วคราว กด 'แปลต่อ' ภายหลังได้", true);
          return;
        }
      }

      try {
        await putStory(story); // save-as-you-go
      } catch (err) {
        setStatus("บันทึกไม่สำเร็จ: " + (err?.message ?? err), true);
      }
      renderChapterBody(story, ch);
    }
  } finally {
    translating = false;
    if (btn) btn.disabled = false;
  }

  const { pending } = countByStatus(ch);
  setStatus(pending === 0 ? "แปลครบแล้ว" : "แปลจบรอบหนึ่ง ยังค้างบางย่อหน้า — กด 'แปลต่อ' ได้");
  renderChapterBody(story, ch);
}

async function copyChapter(ch) {
  const text = ch.paragraphs
    .filter((p) => p.status === "done" && p.sourceTH)
    .map((p) => p.sourceTH)
    .join("\n\n");
  if (!text) {
    toast("ยังไม่มีย่อหน้าที่แปลแล้ว");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("คัดลอกบทแปลแล้ว");
  } catch (err) {
    setStatus("คัดลอกไม่สำเร็จ: " + (err?.message ?? err), true);
  }
}

/* ========================================================= */
homeBtn.addEventListener("click", renderLibrary);

fontSm.addEventListener("click", () => {
  const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--font-size")) || 16;
  document.documentElement.style.setProperty("--font-size", `${Math.max(12, cur - 1)}px`);
});
fontLg.addEventListener("click", () => {
  const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--font-size")) || 16;
  document.documentElement.style.setProperty("--font-size", `${Math.min(26, cur + 1)}px`);
});

renderLibrary();
