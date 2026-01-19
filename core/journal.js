import { openDb, txDone } from "./idb.js";

let db = null;
let seq = 0;

const SNAPSHOT_ID = "latest";
const META_KEY = "journal_seq";

export async function initJournal() {
  db = await openDb();

  // Restore seq from meta if present, else scan last journal entry
  const metaSeq = await readMeta(META_KEY);
  if (typeof metaSeq === "number") {
    seq = metaSeq;
    return;
  }

  const tx = db.transaction("journal", "readonly");
  const store = tx.objectStore("journal");

  await new Promise((resolve) => {
    const req = store.openCursor(null, "prev");
    req.onsuccess = () => {
      if (req.result) seq = req.result.key + 1;
      resolve();
    };
  });

  await writeMeta(META_KEY, seq);
}

export async function appendAction(action) {
  const entry = {
    seq,
    ts: Date.now(),
    action,
  };
  seq++;

  const tx = db.transaction(["journal", "meta"], "readwrite");
  tx.objectStore("journal").put(entry);
  tx.objectStore("meta").put({ key: META_KEY, value: seq });
  await txDone(tx);

  return entry;
}

export async function replayJournal(applyFn, { fromSeqExclusive = -1 } = {}) {
  const tx = db.transaction("journal", "readonly");
  const store = tx.objectStore("journal");

  await new Promise((resolve) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();

      const entry = cursor.value;
      if (entry.seq > fromSeqExclusive) {
        applyFn(entry.action);
      }
      cursor.continue();
    };
  });
}

export async function saveSnapshot(stateObj, { lastSeqApplied } = {}) {
  const payload = {
    id: SNAPSHOT_ID,
    ts: Date.now(),
    lastSeqApplied: typeof lastSeqApplied === "number" ? lastSeqApplied : -1,
    state: stateObj,
  };

  const tx = db.transaction("snapshot", "readwrite");
  tx.objectStore("snapshot").put(payload);
  await txDone(tx);

  return payload;
}

export async function loadSnapshot() {
  const tx = db.transaction("snapshot", "readonly");
  const store = tx.objectStore("snapshot");

  return new Promise((resolve) => {
    const req = store.get(SNAPSHOT_ID);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export async function compactJournal({ upToSeqInclusive }) {
  // Deletes journal entries <= upToSeqInclusive
  const cutoff = typeof upToSeqInclusive === "number" ? upToSeqInclusive : -1;
  if (cutoff < 0) return;

  const tx = db.transaction("journal", "readwrite");
  const store = tx.objectStore("journal");

  await new Promise((resolve) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();

      if (cursor.key <= cutoff) {
        cursor.delete();
      }
      cursor.continue();
    };
  });

  await txDone(tx);
}

export async function getJournalStats() {
  const snapshot = await loadSnapshot();
  const tx = db.transaction("journal", "readonly");
  const store = tx.objectStore("journal");

  const count = await new Promise((resolve) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => resolve(0);
  });

  return {
    nextSeq: seq,
    journalCount: count,
    snapshotTs: snapshot?.ts ?? null,
    snapshotLastSeqApplied: snapshot?.lastSeqApplied ?? null,
  };
}

async function readMeta(key) {
  const tx = db.transaction("meta", "readonly");
  const store = tx.objectStore("meta");
  return new Promise((resolve) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result?.value);
    req.onerror = () => resolve(undefined);
  });
}

async function writeMeta(key, value) {
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key, value });
  await txDone(tx);
}
