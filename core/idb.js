const DB_NAME = "fe-core";
const DB_VERSION = 1;

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("journal")) {
        db.createObjectStore("journal", { keyPath: "seq" });
      }
      if (!db.objectStoreNames.contains("snapshot")) {
        db.createObjectStore("snapshot", { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
