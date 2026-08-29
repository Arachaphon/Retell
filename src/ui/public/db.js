const DB_NAME = "library_db";
const DB_VERSION = 1;
const STORE = "stories";

const dbPromise = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE)) {
      db.createObjectStore(STORE, { keyPath: "id" });
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function getDb() {
  return dbPromise;
}

export function uid() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function getAllStoriesLocal() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getStoryLocal(id) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function putStoryLocal(story) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(story);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteStoryLocal(id) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const SUPABASE_URL = "https://ovuwbytuthrymiyotldm.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_O39lL6Hu_N6r5FJabAS4RA_QoIiRxUl";

const HEADERS = {
  "apikey": PUBLISHABLE_KEY,
  "Authorization": `Bearer ${PUBLISHABLE_KEY}`,
  "Content-Type": "application/json",
};

export async function getAllStories() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stories?select=*&order=updatedAt.desc`, { headers: HEADERS });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const s of data) {
          putStoryLocal(s).catch(() => {});
        }
        // Also upload any local stories that might not be on Supabase yet
        const locals = await getAllStoriesLocal();
        for (const localStory of locals) {
          if (!data.some((remote) => remote.id === localStory.id)) {
            putStory(localStory).catch(() => {});
          }
        }
        return data.length > 0 ? data : locals;
      }
    } else {
      console.warn("Supabase fetch failed:", res.status, await res.text());
    }
  } catch (err) {
    console.warn("Supabase network error:", err);
  }
  return getAllStoriesLocal();
}

export async function getStory(id) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stories?id=eq.${encodeURIComponent(id)}&select=*`, { headers: HEADERS });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        putStoryLocal(data[0]).catch(() => {});
        return data[0];
      }
    }
  } catch (err) {
    console.warn("Supabase getStory error:", err);
  }
  return getStoryLocal(id);
}

export async function putStory(story) {
  const payload = { ...story, updatedAt: Date.now() };
  await putStoryLocal(payload).catch(() => {});
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stories`, {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("Supabase putStory error:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Supabase putStory network error:", err);
  }
}

export async function deleteStory(id) {
  await deleteStoryLocal(id).catch(() => {});
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stories?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: HEADERS,
    });
    if (!res.ok) {
      console.error("Supabase deleteStory error:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Supabase deleteStory network error:", err);
  }
}
