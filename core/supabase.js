// core/supabase.js
// R5 — Supabase client bootstrap for browser-native FE
//
// IMPORTANT:
// - We DO NOT import Supabase as an ES module (CDN +esm is unstable and can break).
// - We load the UMD build in core/index.html, which provides window.supabase.
// - This file stays an ES module because liveSync imports createSupabaseClient from it.

export function getRuntimeEnv() {
  const env = window.FE_ENV || {};
  return {
    url: String(env.SUPABASE_URL || "https://snspeeohcnjtbisexwxp.supabase.co").trim(),
    anonKey: String(env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuc3BlZW9oY25qdGJpc2V4d3hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNjMyNjUsImV4cCI6MjA4NDYzOTI2NX0.VSm29h9luLDAqQCoRfUp0JtqcG_4D-qCdyEnS9duijM").trim(),
    name: String(env.FE_ENV_NAME || "prod").trim() || "unknown",
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
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return { ok: true, client, error: null };
}
