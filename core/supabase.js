// core/supabase.js
// R5: Minimal Supabase client bootstrap (ESM via CDN)

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

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
