// core/supabase.js
// R5: Supabase client bootstrap (ESM via CDN)
//
// WHY THIS FILE EXISTS:
// - Incognito / fresh cache was crashing because jsDelivr "+esm" export shapes changed.
// - Supabase v2 ESM does NOT guarantee a stable "default" export via wrappers.
// - So we import the entire module namespace and locate createClient safely.
//
// RESULT:
// - No more "does not provide an export named createClient/default" crashes.
// - FE can boot consistently across normal/incognito/new devices.

import * as SupabaseNS from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

function pickCreateClient() {
  // Depending on wrapper behaviour, createClient may exist at top-level,
  // or nested under a default export (rare, but handle it).
  const fn =
    SupabaseNS?.createClient ||
    SupabaseNS?.default?.createClient ||
    null;

  if (typeof fn !== "function") {
    throw new Error(
      "Supabase createClient not found in CDN module. The CDN export shape changed."
    );
  }
  return fn;
}

export function getRuntimeEnv() {
  const env = window.FE_ENV || {};
  return {
    url: String(env.SUPABASE_URL || "").trim(),
    anonKey: String(env.SUPABASE_ANON_KEY || "").trim(),
    name: String(env.FE_ENV_NAME || "").trim() || "unknown",
  };
}

export function createSupabaseClient() {
  const { url, anonKey } = getRuntimeEnv();

  // Fail-safe: FE can still run local if env vars are missing.
  if (!url || !anonKey) {
    return {
      ok: false,
      client: null,
      error:
        "Supabase env not set. Add SUPABASE_URL and SUPABASE_ANON_KEY via Vercel env vars (Production/Preview) or core/runtime-env.js for local dev.",
    };
  }

  let createClient;
  try {
    createClient = pickCreateClient();
  } catch (e) {
    return { ok: false, client: null, error: String(e?.message || e) };
  }

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 8,
      },
    },
  });

  return { ok: true, client, error: null };
}
