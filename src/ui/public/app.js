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

let currentMode = "th";
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

function setLastRead(storyId, chapterId) {
  try {
    localStorage.setItem("retell_last_read", JSON.stringify({ storyId, chapterId, timestamp: Date.now() }));
  } catch {}
}

function getLastRead() {
  try {
    const raw = localStorage.getItem("retell_last_read");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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

  const sortedStories = [...stories].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const lastRead = getLastRead();
  let targetStory = null;
  let targetCh = null;

  if (lastRead && lastRead.storyId && lastRead.chapterId) {
    targetStory = stories.find((s) => s.id === lastRead.storyId);
    targetCh = targetStory?.chapters?.find((c) => c.id === lastRead.chapterId);
  }

  // Fallback to most recently updated story and its first chapter if no explicit last read
  if ((!targetStory || !targetCh) && sortedStories.length > 0) {
    targetStory = sortedStories[0];
    targetCh = targetStory.chapters?.[0] || null;
  }

  let quickReadHtml = "";
  if (targetStory && targetCh) {
    const chIdx = targetStory.chapters.findIndex((c) => c.id === targetCh.id);
    const chTitle = targetCh.title || `ตอนที่ ${chIdx + 1}`;
    quickReadHtml = `
      <div class="quick-read-card">
        <div class="quick-read-info">
          <span class="quick-read-badge">📖 อ่านค้างไว้ / อ่านล่าสุด</span>
          <div class="quick-read-title">${escapeHtml(targetStory.title)}</div>
          <div class="quick-read-sub">${escapeHtml(chTitle)}</div>
        </div>
        <button id="quick-read-btn" class="btn" type="button" data-story-id="${escapeHtml(targetStory.id)}" data-ch-id="${escapeHtml(targetCh.id)}">▶ อ่านต่อด่วน</button>
      </div>`;
  }

  let cards = "";
  for (const s of sortedStories) {
    cards += `
      <div class="book-card">
        <h3 class="book-title">${escapeHtml(s.title)}</h3>
        ${s.author ? `<div class="book-author">${escapeHtml(s.author)}</div>` : ""}
        <div class="book-meta">${s.chapters.length} ตอน · แก้ไข ${fmtDate(s.updatedAt)}</div>
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
      ${quickReadHtml}
      ${stories.length ? `<div class="book-grid">${cards}</div>` : `<p class="empty">ยังไม่มีเรื่อง กด "สร้างเรื่องใหม่" เพื่อเริ่ม</p>`}
    </section>`;

  const qrBtn = document.getElementById("quick-read-btn");
  if (qrBtn) {
    qrBtn.addEventListener("click", () => {
      renderStory(qrBtn.dataset.storyId, qrBtn.dataset.chId);
    });
  }

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
    chapterItems += `
      <div class="chapter-card">
        <button class="chapter-head" data-toggle-ch="${escapeHtml(ch.id)}" type="button">
          <span class="ch-title">${escapeHtml(ch.title || `ตอนที่ ${story.chapters.findIndex((c) => c.id === ch.id) + 1}`)}</span>
          <span class="ch-status hidden"></span>
          <span class="chevron">▸</span>
        </button>
        <div class="chapter-body hidden" id="ch-body-${escapeHtml(ch.id)}">
          <div class="chapter-actions">
            <a href="#" class="btn-link" data-read-ch="${escapeHtml(ch.id)}">เปิดอ่าน / ฟัง</a>
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
        const res = await fetch("/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: raw }),
        });
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
        sourceTH: text,
        status: "done",
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
const scrollSpeed = { value: 3 };
let scrollRaf = null;
let autoScrollOn = false;

function scrollPxPerFrame() {
  // slider 1..7 -> px/frame (~60fps). value 3 => 60px/s, 7 => 240px/s
  const fps = 60;
  const pxs = [20, 40, 60, 90, 120, 170, 240];
  return pxs[scrollSpeed.value - 1] / fps;
}

function stopAutoScroll() {
  autoScrollOn = false;
  if (scrollRaf) {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = null;
  }
  const btn = document.getElementById("scroll-toggle");
  if (btn) btn.textContent = "▶ เลื่อน";
}

function initAutoScroll(storyId, chapterId) {
  document.getElementById("scroll-top").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.getElementById("scroll-bottom").addEventListener("click", () => {
    const el = document.getElementById("chapter-content");
    if (el) el.scrollIntoView({ block: "end", behavior: "smooth" });
  });

  const speedInput = document.getElementById("scroll-speed");
  const speedVal = document.getElementById("speed-val");
  speedInput.addEventListener("input", () => {
    scrollSpeed.value = Number(speedInput.value);
    speedVal.textContent = String(scrollSpeed.value);
  });

  document.getElementById("scroll-toggle").addEventListener("click", () => {
    if (autoScrollOn) {
      stopAutoScroll();
      return;
    }
    autoScrollOn = true;
    const btn = document.getElementById("scroll-toggle");
    btn.textContent = "⏸ หยุด";
    btn.classList.add("active");

    let last = performance.now();
    const step = (now) => {
      if (!autoScrollOn) return;
      const dt = now - last;
      last = now;
      const pxPerFrame = scrollPxPerFrame();
      window.scrollBy({ top: pxPerFrame * Math.min(dt, 50) / 16.67 });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
        stopAutoScroll();
        return;
      }
      scrollRaf = requestAnimationFrame(step);
    };
    scrollRaf = requestAnimationFrame(step);
  });
}

function bindUserScrollStop() {
  const kill = () => stopAutoScroll();
  window.addEventListener("wheel", kill, { passive: true });
  window.addEventListener("touchstart", kill, { passive: true });
  window.addEventListener("touchmove", kill, { passive: true });
}

bindUserScrollStop();

let ttsActive = false;
let keepAliveTimer = null;

const ttsPrefs = { rate: 1.0, voiceURI: null };

function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    if (window.speechSynthesis && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 10000);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

function allThaiVoices() {
  if (!window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("th"));
}

function getThaiVoice() {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  // ถ้า user เลือกเสียงไว้แล้ว ใช้ทันที
  if (ttsPrefs.voiceURI) {
    const chosen = voices.find((v) => v.voiceURI === ttsPrefs.voiceURI);
    if (chosen) return chosen;
  }
  // ลำดับแรก: เสียง Natural/Online/Neural (คุณภาพดีกว่า) -> แล้วค่อยตัวเก่า
  return (
    voices.find((v) => /th-TH/i.test(v.lang) && /natural|online|neural/i.test(v.name)) ||
    voices.find((v) => /th-TH/i.test(v.lang) && /kanya|-female|woman/i.test(v.name)) ||
    voices.find((v) => /th-TH/i.test(v.lang)) ||
    voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("th")) ||
    null
  );
}

function allThaiVoicesLabel(v) {
  const type = v.localService ? "local" : "online";
  return `${v.name} (${v.lang}) · ${type}`;
}

function populateVoiceSelect() {
  const sel = document.getElementById("tts-voice");
  if (!sel) return;
  const voices = allThaiVoices();
  const current = sel.dataset.touched ? ttsPrefs.voiceURI : null;
  sel.innerHTML = "";
  if (voices.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "ไม่พบเสียงไทยในระบบ";
    opt.value = "";
    sel.appendChild(opt);
  } else {
    voices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      opt.textContent = allThaiVoicesLabel(v);
      sel.appendChild(opt);
    });
  }
  sel.value = current || ttsPrefs.voiceURI || "";
}

function initTtsBar(story, currentChapterId) {
  const sel = document.getElementById("tts-voice");
  const rate = document.getElementById("tts-rate");
  const rateVal = document.getElementById("tts-rate-val");
  const chapterSel = document.getElementById("tts-chapter");

  // Populate chapter selector
  const populateChapters = () => {
    if (!chapterSel) return;
    chapterSel.innerHTML = "";
    story.chapters.forEach((ch, idx) => {
      const opt = document.createElement("option");
      opt.value = ch.id;
      opt.textContent = `${idx + 1}. ${ch.title || `ตอนที่ ${idx + 1}`}`;
      if (ch.id === currentChapterId) opt.selected = true;
      chapterSel.appendChild(opt);
    });
  };
  populateChapters();

  chapterSel.addEventListener("change", async () => {
    const newChId = chapterSel.value;
    if (newChId === currentChapterId) return;
    const wasSpeaking = ttsActive;
    stopTTS();
    await openChapter(story.id, newChId);
    if (wasSpeaking) {
      const newStory = await getStory(story.id);
      const newCh = newStory?.chapters?.find((c) => c.id === newChId);
      if (newCh) {
        startTTS(newCh, () => renderChapterBody(newStory, newCh, currentEditMode), newStory, 0);
      }
    }
  });

  // เติมรายการเสียง (เลือกเสียง Natural/Online ก่อน แล้วค่อยตัวเก่า)
  const fill = () => {
    populateVoiceSelect();
    const voices = allThaiVoices();
    const best = voices.find((v) => /th-TH/i.test(v.lang) && /natural|online|neural/i.test(v.name)) ||
      voices.find((v) => /th-TH/i.test(v.lang) && /kanya|-female|woman/i.test(v.name)) ||
      voices.find((v) => /th-TH/i.test(v.lang)) ||
      voices[0];
    if (best) {
      sel.value = best.voiceURI;
      ttsPrefs.voiceURI = best.voiceURI;
    }
  };
  if (speechSynthesis && speechSynthesis.getVoices().length) {
    fill();
  } else {
    speechSynthesis.onvoiceschanged = fill;
  }

  sel.addEventListener("change", () => {
    sel.dataset.touched = "1";
    ttsPrefs.voiceURI = sel.value || null;
  });

  rate.addEventListener("input", () => {
    ttsPrefs.rate = Number(rate.value) / 100;
    rateVal.textContent = ttsPrefs.rate.toFixed(1) + "×";
  });
}

function ttsSetState(id, speaking) {
  const btn = document.getElementById("tts-btn");
  const stop = document.getElementById("tts-stop");
  if (btn) btn.classList.toggle("hidden", speaking);
  if (stop) stop.classList.toggle("hidden", !speaking);
}

function highlightPara(i, on) {
  const rows = document.querySelectorAll("#chapter-content .para-row");
  const row = rows[i];
  if (row) row.classList.toggle("speaking", on);
}

function stopTTS() {
  ttsActive = false;
  stopKeepAlive();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  document.querySelectorAll("#chapter-content .para-row.speaking").forEach((r) => {
    r.classList.remove("speaking");
  });
  ttsSetState(false, false);
}

function startTTS(ch, render, story = null, startParaIndex = 0) {
  if (!window.speechSynthesis) {
    setStatus("เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง", true);
    return;
  }
  if (ttsActive) {
    stopTTS();
    if (startParaIndex === 0 && (arguments.length < 4 || !arguments[3])) {
      return;
    }
  }

  if (speechSynthesis.getVoices().length === 0) {
    speechSynthesis.onvoiceschanged = () => {
      ttsSetState(true, true);
      ttsActive = true;
      startKeepAlive();
      speakChapter(ch, render, story, startParaIndex);
    };
    return;
  }
  ttsActive = true;
  ttsSetState(true, true);
  startKeepAlive();
  const statusEl = document.getElementById("tts-status");
  if (statusEl) statusEl.textContent = `กำลังอ่าน: ${ch.title || "ตอนนี้"}`;
  speakChapter(ch, render, story, startParaIndex);
}

function getParaText(p) {
  return (p?.sourceTH || p?.sourceEN || "").trim();
}

function speakChapter(ch, render, story = null, startParaIndex = 0) {
  const available = ch.paragraphs.filter((p) => getParaText(p) !== "");
  if (available.length === 0) {
    setStatus("ยังไม่มีเนื้อหาให้อ่าน", true);
    stopTTS();
    return;
  }

  const voice = getThaiVoice();
  const textIndexes = [];
  ch.paragraphs.forEach((p, i) => {
    if (getParaText(p) !== "") textIndexes.push(i);
  });

  let cursor = textIndexes.findIndex((idx) => idx >= startParaIndex);
  if (cursor === -1) cursor = 0;

  const makeUtterance = (text) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "th-TH";
    if (voice) u.voice = voice;
    u.rate = ttsPrefs.rate;
    u.pitch = 1.0; // คงที่ ป้องกันเสียงผิดเพี้ยน/ขัด
    u.volume = 1.0;
    return u;
  };

  const updateTtsStatus = (msg) => {
    const el = document.getElementById("tts-status");
    if (el) el.textContent = msg;
  };

  const loadNextChapter = async () => {
    if (!story) {
      stopTTS();
      return;
    }
    const chapters = story.chapters;
    const currentIdx = chapters.findIndex((c) => c.id === ch.id);
    if (currentIdx === -1 || currentIdx >= chapters.length - 1) {
      updateTtsStatus("จบเรื่องแล้ว");
      stopTTS();
      return;
    }
    const nextCh = chapters[currentIdx + 1];
    // Load fresh story data
    const freshStory = await getStory(story.id);
    const freshCh = freshStory?.chapters?.find((c) => c.id === nextCh.id);
    if (!freshCh) {
      stopTTS();
      return;
    }
    updateTtsStatus(`อ่านต่อ: ${freshCh.title || `ตอนที่ ${currentIdx + 2}`}`);
    // Update chapter selector
    const chapterSel = document.getElementById("tts-chapter");
    if (chapterSel) chapterSel.value = freshCh.id;
    // Re-render UI to new chapter
    await openChapter(story.id, freshCh.id);
    // Continue reading next chapter from startParaIndex = 0
    speakChapter(freshCh, () => renderChapterBody(freshStory, freshCh, currentEditMode), freshStory, 0);
  };

  const speakPara = (paraIndex, done) => {
    if (!ttsActive) { highlightPara(paraIndex, false); return; }
    const text = getParaText(ch.paragraphs[paraIndex]);

    highlightPara(paraIndex, true);
    const rows = document.querySelectorAll("#chapter-content .para-row");
    const row = rows[paraIndex];
    if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });

    // อ่านทั้งย่อหน้าเป็นประโยคเดียวถ้าเป็นไปได้ (ลด gap ระหว่างชิ้น ไม่ "ติดขัด")
    // แบ่งเฉพาะเมื่อข้อความยาวเกินเกณฑ์ (browser บางตัวตัดเมื่อชิ้นยาวเกิน)
    const chunks = breakForTTS(text);

    // buffering: เตรียม speak ของย่อหน้าถัดไปล่วงหน้าก่อนจบ ลด gap สะดุด
    const playChunk = (chunkIdx) => {
      if (!ttsActive) { highlightPara(paraIndex, false); return; }
      const u = makeUtterance(chunks[chunkIdx]);
      u.onend = () => {
        if (chunkIdx < chunks.length - 1) {
          playChunk(chunkIdx + 1);
        } else {
          highlightPara(paraIndex, false);
          done();
        }
      };
      u.onerror = (e) => {
        if (e.error === "canceled" || e.error === "interrupted") {
          highlightPara(paraIndex, false);
          stopKeepAlive();
          ttsActive = false;
          ttsSetState(false, false);
          return;
        }
      };
      speechSynthesis.speak(u);
    };
    playChunk(0);
  };

  const speakNext = () => {
    if (!ttsActive || cursor >= textIndexes.length) {
      // Chapter finished - try to auto-advance
      loadNextChapter();
      return;
    }
    const paraIndex = textIndexes[cursor];
    cursor++;
    speakPara(paraIndex, speakNext);
  };

  speakNext();
}

function breakForTTS(text) {
  // อ่านทั้งย่อหน้าเป็น utterance เดียวถ้าเป็นไปได้ (ลด gap ระหว่างชิ้น -> ไม่ "ติดขัด")
  // แบ่งเป็นหลายชิ้นเฉพาะเมื่อข้อความยาวเกินเกณฑ์ (browser บางตัวตัดเมื่อชิ้นยาวเกิน)
  const MAX = 380;
  if (text.length <= MAX) return [text];

  const blocks = [];
  let cur = "";
  for (const chChar of text) {
    cur += chChar;
    const isEnd = chChar === "." || chChar === "!" || chChar === "?" ||
      chChar === "…" || chChar === "ฯ" || chChar === "”" || chChar === '"';
    if (isEnd && cur.length >= 40) {
      blocks.push(cur.trim());
      cur = "";
    } else if (cur.length >= MAX) {
      blocks.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) blocks.push(cur.trim());
  return blocks.length ? blocks : [text];
}

async function openChapter(storyId, chapterId) {
  const story = await getStory(storyId);
  const ch = story?.chapters?.find((c) => c.id === chapterId);
  if (!story || !ch) {
    setStatus("ไม่พบตอน", true);
    return;
  }
  setLastRead(story.id, ch.id);
  const { pending, done } = countByStatus(ch);
  const backBtn = `<a href="#" id="back-story" class="btn-link">← กลับไปเรื่อง</a>`;
  currentEditMode = false;

  app.innerHTML = `
    <section class="chapter-view">
      <div class="chv-head">
        ${backBtn}
        <h1>${escapeHtml(ch.title || `ตอนที่ ${story.chapters.findIndex((c) => c.id === ch.id) + 1}`)}</h1>
        <div class="chv-actions">
          <button id="translate-now" class="btn" type="button">${pending ? "แปลต่อ (API)" : "แปลทั้งหมด (API)"}</button>
          <button id="paste-th" class="btn ghost" type="button">📋 วางคำแปลทั้งตอน</button>
          <button id="edit-toggle" class="btn ghost" type="button">✏️ แก้ไข/ป้อนทีละย่อหน้า</button>
          <button id="copy-ch" class="btn ghost" type="button">คัดลอกบทแปล</button>
        </div>
        <div class="scroll-controls">
          <button id="scroll-top" class="icon-btn" type="button" title="ขึ้นบนสุด">↑</button>
          <button id="scroll-toggle" class="btn ghost" type="button">▶ เลื่อน</button>
          <button id="scroll-bottom" class="icon-btn" type="button" title="ลงล่างสุด">↓</button>
          <label class="speed-wrap">
            <span class="speed-label">ความเร็ว</span>
            <input id="scroll-speed" type="range" min="1" max="7" step="1" value="3" aria-label="ความเร็วเลื่อน" />
            <span id="speed-val" class="speed-val">3</span>
          </label>
        </div>
      </div>
      <div class="read-mode-bar">
        <span class="read-mode-label">โหมดอ่าน</span>
        <div class="seg" role="group" aria-label="โหมดอ่าน">
          <button type="button" class="seg-btn" data-mode="both" data-selected="${currentMode === "both"}">ทั้ง 2 ภาษา</button>
          <button type="button" class="seg-btn" data-mode="th" data-selected="${currentMode === "th"}">ไทยล้วน</button>
          <button type="button" class="seg-btn" data-mode="en" data-selected="${currentMode === "en"}">อังกฤษล้วน</button>
        </div>
      </div>
      <div class="chv-progress">แปลแล้ว ${done}/${ch.paragraphs.length} · รอ ${pending}</div>
      <div id="chapter-content" class="chapter-content"></div>
    </section>
    <div class="tts-bar">
      <div class="tts-bar-inner">
        <button id="tts-btn" class="btn" type="button">🔊 อ่านออกเสียง</button>
        <button id="tts-stop" class="btn ghost hidden" type="button">⏹ หยุด</button>
        <label class="tts-field">
          <span>ตอน</span>
          <select id="tts-chapter"></select>
        </label>
        <label class="tts-field">
          <span>เสียง</span>
          <select id="tts-voice"></select>
        </label>
        <label class="tts-field">
          <span>ความเร็ว</span>
          <input id="tts-rate" type="range" min="60" max="140" step="5" value="100" />
          <span id="tts-rate-val">1.0×</span>
        </label>
        <label class="tts-field">
          <span id="tts-status" class="tts-status"></span>
        </label>
      </div>
    </div>`;

  document.getElementById("back-story").addEventListener("click", (e) => {
    e.preventDefault();
    renderStory(storyId);
  });

  document.getElementById("translate-now").addEventListener("click", () => {
    translateChapterLoop(storyId, chapterId);
  });
  document.getElementById("copy-ch").addEventListener("click", () => copyChapter(ch));

  document.getElementById("tts-btn").addEventListener("click", () => startTTS(ch, () => renderChapterBody(story, ch, currentEditMode), story));
  document.getElementById("tts-stop").addEventListener("click", () => stopTTS());
  initTtsBar(story, ch.id);

  openPasteDialog(story, ch);
  initEditToggle(story, ch);

  document.querySelectorAll(".seg-btn[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentMode = btn.dataset.mode;
      refreshModeSeg();
      renderChapterBody(story, ch, currentEditMode);
    });
  });
  refreshModeSeg();

  initAutoScroll(storyId, chapterId);

  renderChapterBody(story, ch, currentEditMode);
}

function refreshModeSeg() {
  document.querySelectorAll(".seg-btn[data-mode]").forEach((btn) => {
    btn.dataset.selected = String(btn.dataset.mode === currentMode);
  });
}

let currentEditMode = false;

function initEditToggle(story, ch) {
  const btn = document.getElementById("edit-toggle");
  btn.addEventListener("click", () => {
    currentEditMode = !currentEditMode;
    btn.textContent = currentEditMode ? "✔ เสร็จสิ้นการแก้ไข" : "✏️ แก้ไข/ป้อนทีละย่อหน้า";
    renderChapterBody(story, ch, currentEditMode);
  });
}

function renderChapterBody(story, ch, editMode = false) {
  const box = document.getElementById("chapter-content");
  const byMp = (mp) => Array.from(box.querySelectorAll(".th-editor")).find((t) => t.dataset.mp === mp);

  const rows = ch.paragraphs.map((p, i) => {
    const text = p.sourceTH || p.sourceEN || "";
    let th;
    if (editMode) {
      th = `
        <div class="th-editor-wrap">
          <textarea class="th-editor" data-mp="${escapeHtml(p.id)}" placeholder="แก้ไขเนื้อหาย่อหน้านี้">${escapeHtml(text)}</textarea>
          <div class="th-editor-actions">
            <button type="button" class="btn-link save-th" data-mp="${escapeHtml(p.id)}">บันทึก</button>
            ${p.manual ? `<button type="button" class="btn-link danger reset-th" data-mp="${escapeHtml(p.id)}">ล้าง</button>` : ""}
          </div>
        </div>`;
    } else {
      th = `<p>${escapeHtml(text)}</p>`;
    }

    const playBtn = !editMode ? `<button type="button" class="para-play-btn" title="เริ่มอ่านจากย่อหน้านี้" data-para-idx="${i}">🔊</button>` : "";
    const colTh = `<div class="para-col">${th}</div>`;

    return `<div class="para-row" data-para-idx="${i}">${playBtn}${colTh}</div>`;
  });

  const saveAllBar = editMode ?
    `<div class="chv-actions edit-toolbar"><button id="save-all-th" class="btn" type="button">💾 บันทึกการป้อนทั้งหมด</button></div>` : "";

  box.innerHTML = saveAllBar + (rows.join("") || `<p class="empty">ตอนนี้ยังไม่มีเนื้อหา</p>`);

  box.querySelectorAll(".para-play-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.paraIdx, 10);
      startTTS(ch, () => renderChapterBody(story, ch, currentEditMode), story, idx);
    });
  });

  box.querySelectorAll(".para-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("textarea, button, a, input, select")) return;
      const idx = parseInt(row.dataset.paraIdx, 10);
      if (!isNaN(idx)) {
        startTTS(ch, () => renderChapterBody(story, ch, currentEditMode), story, idx);
      }
    });
  });

  if (editMode) {
    box.querySelectorAll(".save-th").forEach((btn) => {
      btn.addEventListener("click", () => {
        const para = ch.paragraphs.find((pp) => String(pp.id) === btn.dataset.mp);
        const ta = byMp(btn.dataset.mp);
        if (!para || !ta) return;
        const text = (ta.value ?? "").trim();
        if (!text) {
          setStatus("กรุณากรอกคำแปลไทยก่อนบันทึก", true);
          return;
        }
        para.sourceTH = text;
        para.status = "done";
        para.error = undefined;
        para.manual = true;
        putStory(story)
          .then(() => {
            toast("บันทึกคำแปลแล้ว");
            renderChapterBody(story, ch, true);
          })
          .catch((err) => setStatus("บันทึกไม่สำเร็จ: " + (err?.message ?? err), true));
      });
    });

    box.querySelectorAll(".reset-th").forEach((btn) => {
      btn.addEventListener("click", () => {
        const para = ch.paragraphs.find((pp) => String(pp.id) === btn.dataset.mp);
        if (!para) return;
        para.sourceTH = undefined;
        para.status = "pending";
        para.error = undefined;
        para.manual = false;
        putStory(story)
          .then(() => {
            toast("ย้ายกลับเป็นยังไม่แปลแล้ว");
            renderChapterBody(story, ch, true);
          })
          .catch((err) => setStatus("บันทึกไม่สำเร็จ: " + (err?.message ?? err), true));
      });
    });

    document.getElementById("save-all-th").addEventListener("click", () => saveAllThai(story, ch));
  }
}

// บันทึก textarea ไทยทั้งหมดของบทในครั้งเดียว (ป้อนทีละย่อหน้าในโหมดแก้ไข)
function saveAllThai(story, ch) {
  const box = document.getElementById("chapter-content");
  const tas = Array.from(box.querySelectorAll(".th-editor"));
  let changed = 0;
  tas.forEach((ta) => {
    const para = ch.paragraphs.find((pp) => String(pp.id) === ta.dataset.mp);
    if (!para) return;
    const text = (ta.value ?? "").trim();
    if (text && (para.sourceTH !== text || !para.manual)) {
      para.sourceTH = text;
      para.status = "done";
      para.error = undefined;
      para.manual = true;
      changed++;
    } else if (!text && para.manual) {
      para.sourceTH = undefined;
      para.status = "pending";
      para.error = undefined;
      para.manual = false;
      changed++;
    }
  });
  if (changed === 0) {
    toast("ไม่มีอะไรให้บันทึก");
    return;
  }
  putStory(story)
    .then(() => {
      toast(`บันทึกคำแปลทั้งหมดแล้ว (${changed} ย่อหน้า)`);
      renderChapterBody(story, ch, true);
    })
    .catch((err) => setStatus("บันทึกไม่สำเร็จ: " + (err?.message ?? err), true));
}

// วางคำแปลไทยทั้งตอน (บล็อกเดียว) -> แยกย่อหน้า -> จับคู่แทนที่คอลัมน์ไทยทีละย่อหน้า
function openPasteDialog(story, ch) {
  document.getElementById("paste-th").addEventListener("click", () => {
    storyDialog.innerHTML = `
      <h2>วางคำแปลไทยทั้งตอน</h2>
      <p class="dlg-hint">วางคำแปล (จากตัวอื่น เช่น ChatGPT/Google) ของทั้งตอนนี้ด้านล่าง — ระบบจะแยกย่อหน้าแล้วจับคู่กับคอลัมน์อังกฤษตามลำดับ. ย่อหน้าแปลที่แปะเข้ามาจะแทนที่คำแปลเดิม.</p>
      <textarea id="paste-th-input" rows="12" placeholder="วางคำแปลไทยทั้งตอนที่นี่…"></textarea>
      <div class="dlg-actions">
        <button type="button" class="btn ghost" data-close-dlg>ยกเลิก</button>
        <button type="button" id="paste-th-apply" class="btn">นำเข้า</button>
      </div>`;
    storyDialog.showModal();
    storyDialog.querySelector("[data-close-dlg]").addEventListener("click", () => storyDialog.close());
    document.getElementById("paste-th-apply").addEventListener("click", () => {
      const raw = document.getElementById("paste-th-input").value;
      const lines = raw.split(/\r?\n/);
      const paras = [];
      let cur = "";
      lines.forEach((line) => {
        if (line.trim() === "") {
          if (cur.trim()) { paras.push(cur.trim()); cur = ""; }
          return;
        }
        cur += (cur ? " " : "") + line.trim();
      });
      if (cur.trim()) paras.push(cur.trim());

      if (paras.length === 0) {
        setStatus("ไม่พบคำแปลให้นำเข้า", true);
        return;
      }

      let matched = 0;
      ch.paragraphs.forEach((p, i) => {
        const th = paras[i];
        if (th) {
          p.sourceTH = th;
          p.status = "done";
          p.error = undefined;
          p.manual = true;
          matched++;
        }
      });

      putStory(story)
        .then(() => {
          storyDialog.close();
          toast(`นำเข้าคำแปลแล้ว (${matched}/${paras.length} ย่อหน้า)`);
          renderChapterBody(story, ch);
        })
        .catch((err) => setStatus("บันทึกไม่สำเร็จ: " + (err?.message ?? err), true));
    });
  });
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
      if (p.status === "done" || p.manual) continue; // ข้ามที่แปลแล้ว / ที่แก้เอง

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
