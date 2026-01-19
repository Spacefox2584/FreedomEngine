import {
  initJournal,
  appendAction,
  replayJournal,
  loadSnapshot,
  saveSnapshot,
  compactJournal,
  getJournalStats,
} from "./journal.js";

const store = new Map(); // type -> Map(id -> record)
const listeners = new Map(); // type -> Set(fn)

let lastAppliedSeq = -1;

// Snapshot cadence / compaction thresholds
const SNAPSHOT_EVERY_ACTIONS = 50; // take a snapshot every N mutations
let actionsSinceSnapshot = 0;

function ensureType(type) {
  if (!store.has(type)) store.set(type, new Map());
  if (!listeners.has(type)) listeners.set(type, new Set());
}

export async function initStore() {
  await initJournal();

  // 1) Load snapshot
  const snap = await loadSnapshot();
  if (snap?.state) {
    hydrateFromSnapshot(snap.state);
    lastAppliedSeq = typeof snap.lastSeqApplied === "number" ? snap.lastSeqApplied : -1;
  }

  // 2) Replay journal tail (after snapshot seq)
  await replayJournal((action) => applyAction(action), { fromSeqExclusive: lastAppliedSeq });

  // 3) Optional: if journal is large, snapshot immediately (keeps boot fast long-term)
  const stats = await getJournalStats();
  if (stats.journalCount > 500) {
    await snapshotNow();
  }
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
  // Write-ahead
  const entry = await appendAction(action);
  // Apply
  applyAction(action);
  // Track last applied seq
  lastAppliedSeq = entry.seq;

  // Snapshot cadence
  actionsSinceSnapshot++;
  if (actionsSinceSnapshot >= SNAPSHOT_EVERY_ACTIONS) {
    await snapshotNow();
  }
}

export async function forceSnapshot() {
  await snapshotNow();
}

export async function stats() {
  const counts = {};
  for (const [type, bucket] of store.entries()) {
    counts[type] = bucket.size;
  }

  const j = await getJournalStats();

  return {
    counts,
    lastAppliedSeq,
    journal: j,
  };
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

  // Notify type listeners
  listeners.get(type).forEach((fn) => fn());
}

function hydrateFromSnapshot(stateObj) {
  store.clear();
  listeners.clear();

  for (const type of Object.keys(stateObj)) {
    ensureType(type);
    const bucket = store.get(type);
    const byId = stateObj[type] || {};
    for (const id of Object.keys(byId)) {
      bucket.set(id, byId[id]);
    }
  }
}

function serializeStateForSnapshot() {
  const out = {};
  for (const [type, bucket] of store.entries()) {
    out[type] = {};
    for (const [id, record] of bucket.entries()) {
      out[type][id] = record;
    }
  }
  return out;
}

async function snapshotNow() {
  const stateObj = serializeStateForSnapshot();
  await saveSnapshot(stateObj, { lastSeqApplied: lastAppliedSeq });

  // Compact journal up to snapshot seq (inclusive)
  if (lastAppliedSeq >= 0) {
    await compactJournal({ upToSeqInclusive: lastAppliedSeq });
  }

  actionsSinceSnapshot = 0;
}
