import {
  initJournal,
  appendAction,
  replayJournalFrom,
  loadSnapshot,
  saveSnapshot,
  clearJournalThrough,
  getSeqInfo,
  getJournalStats,
} from "./journal.js";

const store = new Map(); // type -> Map(id -> record)
const listeners = new Map(); // type -> Set(fn)

let lastSnapshotUptoSeq = -1;
let actionsSinceSnapshot = 0;
let snapshotInFlight = false;

// R5: optional hook for sync layer (push mutations to Supabase)
let mutationHook = null;

export function setMutationHook(fn) {
  mutationHook = typeof fn === "function" ? fn : null;
}

// Tuning (safe defaults)
const SNAPSHOT_EVERY_ACTIONS = 50;
const SNAPSHOT_MAX_JOURNAL_TAIL = 200;

function ensureType(type) {
  if (!store.has(type)) store.set(type, new Map());
  if (!listeners.has(type)) listeners.set(type, new Set());
}

export async function initStore() {
  await initJournal();

  // Load snapshot first (fast boot), then replay journal tail.
  const snap = await loadSnapshot();
  if (snap?.state) {
    hydrateFromSnapshot(snap.state);
    lastSnapshotUptoSeq =
      typeof snap.uptoSeq === "number" ? snap.uptoSeq : -1;
  } else {
    lastSnapshotUptoSeq = -1;
  }

  // Replay journal entries after snapshot point
  await replayJournalFrom(lastSnapshotUptoSeq + 1, applyAction);
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
  // Ensure deterministic timestamps across replay:
  // if a record is being put, we stamp updated_at into the data so replay restores identical values.
  const stamped = stampAction({
    ...action,
    meta: {
      ...(action?.meta || {}),
      source: action?.meta?.source || "local",
    },
  });

  // Tag as local unless caller provided meta
  if (!stamped.meta) stamped.meta = {};
  if (!stamped.meta.source) stamped.meta.source = "local";

  // Write-ahead (durable), then apply to memory
  const entry = await appendAction(stamped);
  applyAction(stamped);

  // Notify sync layer (never blocks UI)
  try {
    mutationHook?.({ action: stamped, seq: entry.seq });
  } catch (_) {}

  actionsSinceSnapshot++;

  // Background snapshot if needed (never blocks UI)
  maybeSnapshot(entry.seq).catch(() => {});
}

/**
 * R5: Ingest a mutation that originated from the network.
 * We record it in the local journal so the device stays offline-capable,
 * but we do NOT call the mutation hook (to avoid push loops).
 */
export async function ingestRemote(action) {
  const stamped = stampAction({
    ...action,
    meta: {
      ...(action?.meta || {}),
      source: "remote",
    },
  });

  const entry = await appendAction(stamped);
  applyAction(stamped);
  actionsSinceSnapshot++;
  maybeSnapshot(entry.seq).catch(() => {});
}

export async function snapshotNow() {
  if (snapshotInFlight) return;

  snapshotInFlight = true;
  try {
    const uptoSeq = getSeqInfo().lastSeq;
    const state = dumpState();
    await saveSnapshot(state, uptoSeq);
    await clearJournalThrough(uptoSeq);

    lastSnapshotUptoSeq = uptoSeq;
    actionsSinceSnapshot = 0;
  } finally {
    snapshotInFlight = false;
  }
}

export async function getDebugStats() {
  const journal = await getJournalStats();
  const objectCounts = {};
  store.forEach((map, type) => {
    objectCounts[type] = map.size;
  });

  return {
    snapshot: {
      lastSnapshotUptoSeq,
      actionsSinceSnapshot,
    },
    journal,
    objects: objectCounts,
  };
}

// --------------------
// Internal
// --------------------
function stampAction(action) {
  if (!action || typeof action !== "object") return action;

  const { op, data } = action;
  if (op === "put" && data && typeof data === "object") {
    // clone data (avoid mutating caller object)
    return {
      ...action,
      data: {
        ...data,
        updated_at: typeof data.updated_at === "number" ? data.updated_at : Date.now(),
      },
    };
  }

  return action;
}

function hydrateFromSnapshot(stateObj) {
  // stateObj shape: { type: [records...] }
  // Clear existing
  store.clear();
  listeners.clear();

  Object.entries(stateObj).forEach(([type, records]) => {
    ensureType(type);
    const bucket = store.get(type);
    (records || []).forEach((r) => {
      if (r && r.id != null) bucket.set(r.id, r);
    });
  });
}

function dumpState() {
  const out = {};
  store.forEach((map, type) => {
    out[type] = Array.from(map.values());
  });
  return out;
}

async function maybeSnapshot(latestSeq) {
  if (snapshotInFlight) return;

  const tailSize = latestSeq - lastSnapshotUptoSeq;
  const shouldByActions = actionsSinceSnapshot >= SNAPSHOT_EVERY_ACTIONS;
  const shouldByTail = tailSize >= SNAPSHOT_MAX_JOURNAL_TAIL;

  if (!shouldByActions && !shouldByTail) return;

  await snapshotNow();
}

function applyAction(action) {
  const { type, op, id, data } = action;
  ensureType(type);

  const bucket = store.get(type);

  if (op === "put") {
    bucket.set(id, {
      id,
      ...data,
      updated_at:
        typeof data?.updated_at === "number" ? data.updated_at : Date.now(),
    });
  }

  if (op === "delete") {
    bucket.delete(id);
  }

  listeners.get(type).forEach((fn) => fn());
}
