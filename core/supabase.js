// core/supabase.js
// R5 — Supabase client bootstrap for browser-native FE
//
// IMPORTANT:
// - We DO NOT import Supabase as an ES module.
// - We load the UMD build in core/index.html, which provides window.supabase.
// - This file remains an ES module because liveSync imports createSupabaseClient from it.

export function getRuntimeEnv() {
  const env = window.FE_ENV || {};
  return {
    url: String(env.SUPABASE_URL || "").trim(),
    anonKey: String(env.SUPABASE_ANON_KEY || "").trim(),
    name: String(env.FE_ENV_NAME || "").trim() || "unknown",
    // Optional override for shared default world (used by liveSync.js)
    defaultWorldId: String(env.FE_DEFAULT_WORLD_ID || "").trim(),
  };
}

export function createSupabaseClient() {
  const { url, anonKey } = getRuntimeEnv();

  if (!url || !anonKey) {
    return {
      ok: false,
      client: null,
      error:
        "Supabase env not set. Missing SUPABASE_URL or SUPABASE_ANON_KEY in window.FE_ENV (runtime-env.js).",
    };
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    return {
      ok: false,
      client: null,
      error:
        "Supabase UMD library not loaded. core/index.html must include the supabase.min.js script before app.js.",
    };
  }

  const client = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return { ok: true, client, error: null };
}
