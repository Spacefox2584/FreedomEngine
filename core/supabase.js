// core/supabase.js
// R6 — Supabase client bootstrap for browser-native FE

let _client = null;
let _error = null;

export function getRuntimeEnv() {
  const env = window.FE_ENV || {};
  return {
    url: String(env.SUPABASE_URL || '').trim(),
    anonKey: String(env.SUPABASE_ANON_KEY || '').trim(),
    name: String(env.FE_ENV_NAME || '').trim() || 'unknown',
  };
}

function makeStorage(prefix = 'fe.sb.auth.') {
  // First‑party storage adapter. Some browsers block direct storage access from
  // third‑party CDN scripts; this keeps persistence under FE's origin.
  return {
    getItem(key) {
      try { return localStorage.getItem(prefix + key); } catch (e) { return null; }
    },
    setItem(key, value) {
      try { localStorage.setItem(prefix + key, value); } catch (e) {}
    },
    removeItem(key) {
      try { localStorage.removeItem(prefix + key); } catch (e) {}
    },
  };
}

export function createSupabaseClient() {
  if (_client) return { ok: true, client: _client, error: null };
  if (_error) return { ok: false, client: null, error: _error };

  const { url, anonKey } = getRuntimeEnv();
  if (!url || !anonKey) {
    _error = 'Supabase env not set. Missing SUPABASE_URL or SUPABASE_ANON_KEY in window.FE_ENV (runtime-env.js).';
    return { ok: false, client: null, error: _error };
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    _error = 'Supabase UMD library not loaded. core/index.html must include the supabase.min.js script before app.js.';
    return { ok: false, client: null, error: _error };
  }

  // IMPORTANT:
  // - Use a custom storage adapter so session persistence is first‑party.
  // - Single client instance to avoid multiple GoTrueClient warnings/behaviour.
  const storage = makeStorage();

  _client = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage,
      storageKey: 'fe-auth',
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });

  // Convenience global for debugging and for any legacy code paths.
  // NOTE: The Supabase URL + anon key are already present in FE runtime env;
  // exposing the instantiated client does not meaningfully change the threat model.
  window.FE_SUPABASE = _client;

  return { ok: true, client: _client, error: null };
}

export function _resetSupabaseClientForDebug() {
  _client = null;
  _error = null;
}
