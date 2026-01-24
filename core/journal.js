import { openDb } from "./idb.js";

let db = null;
let nextSeq = 0;

export async function initJournal() {
  db = await openDb();

  // Find next sequence number (append position)
  const tx = db.transaction("journal", "readonly");
  const store = tx.objectStore("journal");

  return new Promise((resolve) => {
    const req = store.openCursor(null, "prev");
    req.onsuccess = () => {
      if (req.result) nextSeq = req.result.key + 1;
      resolve();
    };
  });
}

export function getSeqInfo() {
  return {
    nextSeq,
    lastSeq: Math.max(-1, nextSeq - 1),
  };
}

export async function appendAction(action) {
  const entry = {
    seq: nextSeq,
    ts: Date.now(),
    action,
  };
  nextSeq++;

  const tx = db.transaction("journal", "readwrite");
  tx.objectStore("journal").put(entry);

  return entry;
}

/**
 * R5: Scan journal entries from a minimum seq (inclusive) and stream entries to a callback.
 * This is used for offline-first resync: we replay local mutations to Supabase when online.
 */
export async function scanJournalFrom(minSeq, onEntry) {
  const tx = db.transaction("journal", "readonly");
  const store = tx.objectStore("journal");
  const range = typeof minSeq === "number" ? IDBKeyRange.lowerBound(minSeq) : null;

  return new Promise((resolve) => {
    const req = store.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        try {
          onEntry?.(cursor.value);
        } catch (_) {}
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
}

export async function replayJournal(applyFn) {
  return replayJournalFrom(0, applyFn);
}

/**
 * Replay journal entries from a minimum seq (inclusive).
 */
export async function replayJournalFrom(minSeq, applyFn) {
  const tx = db.transaction("journal", "readonly");
  const store = tx.objectStore("journal");

  const range = typeof minSeq === "number" ? IDBKeyRange.lowerBound(minSeq) : null;

  return new Promise((resolve) => {
    const req = store.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        applyFn(cursor.value.action);
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
}

/**
 * Snapshot is a durable compressed "truth" of the store at a point in time.
 * We store which journal seq the snapshot includes (uptoSeq).
 */
export async function saveSnapshot(state, uptoSeq) {
  const tx = db.transaction("snapshot", "readwrite");
  tx.objectStore("snapshot").put({
    id: "latest",
    ts: Date.now(),
    uptoSeq: typeof uptoSeq === "number" ? uptoSeq : getSeqInfo().lastSeq,
    state,
  });
}

export async function loadSnapshot() {
  const tx = db.transaction("snapshot", "readonly");
  const store = tx.objectStore("snapshot");

  return new Promise((resolve) => {
    const req = store.get("latest");
    req.onsuccess = () => resolve(req.result || null);
  });
}

/**
 * Delete journal entries through (and including) uptoSeq.
 * This is compaction: snapshot holds the truth, so old actions can be discarded.
 */
export async function clearJournalThrough(uptoSeq) {
  if (typeof uptoSeq !== "number" || uptoSeq < 0) return;

  const tx = db.transaction("journal", "readwrite");
  const store = tx.objectStore("journal");

  return new Promise((resolve) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();

      if (cursor.key <= uptoSeq) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
}

/**
 * Small stats helper for the inspector.
 */
export async function getJournalStats() {
  const tx = db.transaction("journal", "readonly");
  const store = tx.objectStore("journal");

  const out = {
    count: 0,
    firstSeq: null,
    lastSeq: null,
    nextSeq,
  };

  return new Promise((resolve) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve(out);

      out.count++;
      if (out.firstSeq === null) out.firstSeq = cursor.key;
      out.lastSeq = cursor.key;
      cursor.continue();
    };
  });
}
