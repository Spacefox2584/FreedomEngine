// core/supabase.js
// R5: Minimal Supabase client bootstrap (ESM via CDN)
//
// NOTE:
// jsDelivr's "+esm" wrapper can change export shapes over time.
// We avoid named imports and instead read createClient from the default export.
// This prevents "does not provide an export named createClient" crashes
// (which can show up in incognito / fresh cache).

import SupabasePkg from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

function resolveCreateClient() {
  // jsDelivr +esm often provides a default export object.
  const candidate =
    SupabasePkg?.createClient ||
    SupabasePkg?.default?.createClient ||
    null;

  if (typeof candidate !== "function") {
    throw new Error(
      "Supabase createClient not available from CDN module. The CDN export shape changed."
    );
  }

  return candidate;
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

  if (!url || !anonKey) {
    return {
      ok: false,
      client: null,
      error:
        "Supabase env not set. Add SUPABASE_URL and SUPABASE_ANON_KEY via Vercel env vars (or core/runtime-env.js for local dev).",
    };
  }

  let createClient;
  try {
    createClient = resolveCreateClient();
  } catch (e) {
    return {
      ok: false,
      client: null,
      error: String(e?.message || e),
    };
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
