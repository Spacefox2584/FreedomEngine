import { initJournal, appendAction, replayJournal } from "./journal.js";

const store = new Map(); // type -> Map(id -> record)
const listeners = new Map(); // type -> Set(fn)

function ensureType(type) {
  if (!store.has(type)) store.set(type, new Map());
  if (!listeners.has(type)) listeners.set(type, new Set());
}

export async function initStore() {
  await initJournal();
  await replayJournal(applyAction);
}

export function get(type, id) {
  ensureType(type);
  return store.get(type).get(id) || null;
}

export function list(type) {
  ensureType(type);
  return Array.from(store.get(type).values());
}

export function subscribe(type, fn) {
  ensureType(type);
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}

export async function mutate(action) {
  // write-ahead
  await appendAction(action);
  applyAction(action);
}

function applyAction(action) {
  const { type, op, id, data } = action;
  ensureType(type);

  const bucket = store.get(type);

  if (op === "put") {
    bucket.set(id, {
      id,
      ...data,
      updated_at: Date.now(),
    });
  }

  if (op === "delete") {
    bucket.delete(id);
  }

  listeners.get(type).forEach((fn) => fn());
}
