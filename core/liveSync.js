// core/liveSync.js
// ------------------------------------------------------------
// FE.01.A2.R5 — Live World MVP
//
// Goals:
// - Same world open on two devices: changes sync silently.
// - Offline-first: UI reads/writes local store immediately.
// - Resync: when connection returns, queued journal changes are pushed.
// - Minimal presence: show connection status (avatars later).
//
// Non-goals (R5): permissions UI, teams, analytics, AI UI.
//

import * as Store from "./store.js";
import { scanJournalFrom } from "./journal.js";
import { createSupabaseClient } from "./supabase.js";

const LS = {
  deviceId: "fe.device_id",
  worldId: "fe.world_id",
  lastPushedSeq: "fe.sync.last_pushed_seq",
};

function getOrCreateDeviceId() {
  let id = localStorage.getItem(LS.deviceId);
  if (id) return id;
  id = crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2);
  localStorage.setItem(LS.deviceId, id);
  return id;
}

function getOrCreateWorldId() {
  const env = window.FE_ENV || {};
  const forced = String(env.FE_DEFAULT_WORLD_ID || "").trim();

  // If a default world is defined (via Vercel env var), it wins.
  // This makes every new browser/incognito/device land in the same shared world,
  // which is exactly what we want for R5 Live World MVP.
  if (forced) {
    const current = localStorage.getItem(LS.worldId);
    if (current !== forced) localStorage.setItem(LS.worldId, forced);
    return forced;
  }

  // Otherwise: legacy behavior (per-device world).
  let id = localStorage.getItem(LS.worldId);
  if (id) return id;
  id =
    crypto?.randomUUID?.() ||
    String(Date.now()) + Math.random().toString(16).slice(2);
  localStorage.setItem(LS.worldId, id);
  return id;
}

function getLastPushedSeq() {
  const raw = localStorage.getItem(LS.lastPushedSeq);
  const n = Number(raw);
  return Number.isFinite(n) ? n : -1;
}

function setLastPushedSeq(n) {
  localStorage.setItem(LS.lastPushedSeq, String(n));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isOnline() {
  return navigator.onLine !== false;
}

// Map FE local store types -> DB tables
const TABLES = {
  card: "fe_cards",
  lane: "fe_lanes",
  world: "fe_worlds",
};

// Public
export async function initLiveWorld({ setStatusText } = {}) {
  const deviceId = getOrCreateDeviceId();
  const worldId = getOrCreateWorldId();

  const sb = createSupabaseClient();
  if (!sb.ok) {
    setStatusText?.("Local");
    console.warn(sb.error);
    return {
      ok: false,
      worldId,
      deviceId,
      error: sb.error,
      stop() {},
    };
  }

  const supabase = sb.client;

  // 1) Ensure world exists (idempotent)
  await ensureWorldRow(supabase, worldId);

  // 2) Pull remote snapshot into local store (first sync)
  setStatusText?.(isOnline() ? "Syncing" : "Offline");
  await pullRemoteIntoLocal(supabase, worldId, deviceId);

  // 3) Subscribe to remote changes
  const channel = subscribeRemoteChanges({ supabase, worldId, deviceId, setStatusText });

  // 4) Push local journal tail (offline queue replay)
  let stopped = false;
  const stopFns = [];

  // Hook local mutations so they push instantly when online
  Store.setMutationHook(({ action, seq }) => {
    if (stopped) return;
    // Don't push remote-ingested changes back to server
    if (action?.meta?.source === "remote") return;
    // Tag + enqueue push
    pushOne({ supabase, worldId, deviceId, action, seq }).catch(() => {});
  });

  // Background reconciler: when offline, keep retrying
  const reconcileLoop = async () => {
    while (!stopped) {
      try {
        if (isOnline()) {
          await pushJournalTail({ supabase, worldId, deviceId, setStatusText });
          setStatusText?.("Live");
        } else {
          setStatusText?.("Offline");
        }
      } catch (e) {
        setStatusText?.(isOnline() ? "Degraded" : "Offline");
      }
      await sleep(2500);
    }
  };
  reconcileLoop();

  // Online/offline events
  const onOnline = () => setStatusText?.("Syncing");
  const onOffline = () => setStatusText?.("Offline");
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  stopFns.push(() => window.removeEventListener("online", onOnline));
  stopFns.push(() => window.removeEventListener("offline", onOffline));

  return {
    ok: true,
    worldId,
    deviceId,
    stop() {
      stopped = true;
      try {
        channel?.unsubscribe?.();
      } catch (_) {}
      stopFns.forEach((f) => {
        try {
          f();
        } catch (_) {}
      });
      // clear hook
      Store.setMutationHook(null);
    },
  };
}

// ------------------------------------------------------------
// Remote pull
// ------------------------------------------------------------

async function ensureWorldRow(supabase, worldId) {
  // Worlds are just IDs for R5. (Operators/auth comes later.)
  const payload = { id: worldId, updated_by: "system" };
  const { error } = await supabase.from(TABLES.world).upsert(payload, { onConflict: "id" });
  if (error) {
    // If the table doesn't exist yet, we don't hard-fail here; FE remains local.
    console.warn("ensureWorldRow failed:", error.message);
  }
}

async function pullRemoteIntoLocal(supabase, worldId, deviceId) {
  // Pull lanes then cards.
  // We ingest as remote actions so we don't re-push.
  const lanes = await supabase
    .from(TABLES.lane)
    .select("*")
    .eq("world_id", worldId);

  if (!lanes.error && Array.isArray(lanes.data)) {
    for (const row of lanes.data) {
      await Store.ingestRemote({
        type: "lane",
        op: "put",
        id: row.id,
        data: {
          id: row.id,
          name: row.name,
          world_id: row.world_id,
          updated_at: Date.parse(row.updated_at) || Date.now(),
        },
        meta: { source: "remote", deviceId },
      });
    }
  }

  const cards = await supabase
    .from(TABLES.card)
    .select("*")
    .eq("world_id", worldId);

  if (!cards.error && Array.isArray(cards.data)) {
    for (const row of cards.data) {
      await Store.ingestRemote({
        type: "card",
        op: "put",
        id: row.id,
        data: dbRowToCard(row),
        meta: { source: "remote", deviceId },
      });
    }
  }
}

function dbRowToCard(row) {
  return {
    id: row.id,
    title: row.title || "",
    lane: String(row.lane_id ?? "0"),
    priority: row.priority || "normal",
    createdAt: row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now(),
    channel: row.channel || null,
    summary: row.summary || null,
    nextAction: row.next_action || null,
    notes: Array.isArray(row.notes) ? row.notes : (row.notes || []),
    updated_at: row.updated_at ? Date.parse(row.updated_at) || Date.now() : Date.now(),
  };
}

// ------------------------------------------------------------
// Realtime subscriptions
// ------------------------------------------------------------

function subscribeRemoteChanges({ supabase, worldId, deviceId, setStatusText }) {
  try {
    const channel = supabase.channel(`fe-world-${worldId}`);

    // Cards
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLES.card, filter: `world_id=eq.${worldId}` },
      async (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        if (row.updated_device && String(row.updated_device) === String(getOrCreateDeviceId())) return;

        if (payload.eventType === "DELETE") {
          await Store.ingestRemote({ type: "card", op: "delete", id: row.id, meta: { source: "remote", deviceId } });
          return;
        }

        await Store.ingestRemote({
          type: "card",
          op: "put",
          id: row.id,
          data: dbRowToCard(row),
          meta: { source: "remote", deviceId },
        });
      }
    );

    // Lanes
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLES.lane, filter: `world_id=eq.${worldId}` },
      async (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        if (row.updated_device && String(row.updated_device) === String(getOrCreateDeviceId())) return;

        if (payload.eventType === "DELETE") {
          await Store.ingestRemote({ type: "lane", op: "delete", id: row.id, meta: { source: "remote", deviceId } });
          return;
        }

        await Store.ingestRemote({
          type: "lane",
          op: "put",
          id: row.id,
          data: {
            id: row.id,
            name: row.name,
            world_id: row.world_id,
            updated_at: row.updated_at ? Date.parse(row.updated_at) || Date.now() : Date.now(),
          },
          meta: { source: "remote", deviceId },
        });
      }
    );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setStatusText?.(isOnline() ? "Live" : "Offline");
      }
    });

    return channel;
  } catch (e) {
    console.warn("Realtime subscribe failed:", e);
    setStatusText?.(isOnline() ? "Degraded" : "Offline");
    return null;
  }
}

// ------------------------------------------------------------
// Push logic (offline queue via journal)
// ------------------------------------------------------------

async function pushJournalTail({ supabase, worldId, deviceId }) {
  let last = getLastPushedSeq();
  const entries = [];
  await scanJournalFrom(last + 1, (entry) => entries.push(entry));
  if (entries.length === 0) return;

  for (const entry of entries) {
    const action = entry.action;
    // Skip remote ingests
    if (action?.meta?.source === "remote") {
      setLastPushedSeq(entry.seq);
      continue;
    }

    const ok = await pushActionNow({ supabase, worldId, deviceId, action });
    if (!ok) {
      // Stop at first failure; we'll retry later.
      return;
    }
    setLastPushedSeq(entry.seq);
  }
}

async function pushOne({ supabase, worldId, deviceId, action, seq }) {
  if (!isOnline()) return;
  const ok = await pushActionNow({ supabase, worldId, deviceId, action });
  if (ok && typeof seq === "number") {
    const current = getLastPushedSeq();
    if (seq > current) setLastPushedSeq(seq);
  }
}

async function pushActionNow({ supabase, worldId, deviceId, action }) {
  try {
    const { type, op, id, data } = action;
    if (!type || !op || !id) return true;

    if (type === "lane") {
      if (op === "delete") {
        const { error } = await supabase.from(TABLES.lane).delete().eq("world_id", worldId).eq("id", id);
        return !error;
      }
      const row = {
        id,
        world_id: worldId,
        name: String(data?.name || ""),
        updated_by: "local",
        updated_device: deviceId,
      };
      const { error } = await supabase.from(TABLES.lane).upsert(row, { onConflict: "id" });
      return !error;
    }

    if (type === "card") {
      if (op === "delete") {
        const { error } = await supabase.from(TABLES.card).delete().eq("world_id", worldId).eq("id", id);
        return !error;
      }

      const row = {
        id,
        world_id: worldId,
        lane_id: String(data?.lane ?? "0"),
        sort_order: 0,
        title: String(data?.title || ""),
        body: "",
        status: "active",
        priority: String(data?.priority || "normal"),
        channel: data?.channel ?? null,
        summary: data?.summary ?? null,
        next_action: data?.nextAction ?? null,
        notes: Array.isArray(data?.notes) ? data.notes : [],
        created_at: data?.createdAt ? new Date(Number(data.createdAt)).toISOString() : new Date().toISOString(),
        updated_by: "local",
        updated_device: deviceId,
      };

      const { error } = await supabase.from(TABLES.card).upsert(row, { onConflict: "id" });
      return !error;
    }

    return true;
  } catch (e) {
    return false;
  }
}
