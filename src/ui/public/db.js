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

export async function getAllStories() {
  try {
    const res = await fetch("/api/stories");
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && Array.isArray(data.stories)) {
      for (const s of data.stories) {
        putStoryLocal(s).catch(() => {});
      }
      return data.stories;
    }
  } catch {}
  return getAllStoriesLocal();
}

export async function getStory(id) {
  try {
    const res = await fetch(`/api/stories/${encodeURIComponent(id)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.story) {
      putStoryLocal(data.story).catch(() => {});
      return data.story;
    }
  } catch {}
  return getStoryLocal(id);
}

export async function putStory(story) {
  const payload = { ...story, updatedAt: Date.now() };
  await putStoryLocal(payload).catch(() => {});
  try {
    await fetch("/api/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {}
}

export async function deleteStory(id) {
  await deleteStoryLocal(id).catch(() => {});
  try {
    await fetch(`/api/stories/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {}
}
