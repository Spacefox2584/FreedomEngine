import { openDb } from "./idb.js";

let db = null;
let seq = 0;

export async function initJournal() {
  db = await openDb();

  const tx = db.transaction("journal", "readonly");
  const store = tx.objectStore("journal");

  return new Promise((resolve) => {
    const req = store.openCursor(null, "prev");
    req.onsuccess = () => {
      if (req.result) {
        seq = req.result.key + 1;
      }
      resolve();
    };
  });
}

export async function appendAction(action) {
  const entry = {
    seq,
    ts: Date.now(),
    action,
  };
  seq++;

  const tx = db.transaction("journal", "readwrite");
  tx.objectStore("journal").put(entry);

  return entry;
}

export async function replayJournal(applyFn) {
  const tx = db.transaction("journal", "readonly");
  const store = tx.objectStore("journal");

  return new Promise((resolve) => {
    const req = store.openCursor();
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
