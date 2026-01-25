// core/supabase.js
// R5 — Browser-safe Supabase bootstrap (NO ESM, NO jsDelivr, NO Node)

// This file assumes Supabase is loaded globally via <script>
// It exposes window.FE_SUPABASE for the rest of FE to use

(function () {
  // ---- CONFIG ----
  const SUPABASE_URL = "https://snspeeohcnjtbisexwxp.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuc3BlZW9oY25qdGJpc2V4d3hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNjMyNjUsImV4cCI6MjA4NDYzOTI2NX0.VSm29h9luLDAqQCoRfUp0JtqcG_4D-qCdyEnS9duijM";

  // ---- GUARD ----
  if (!window.supabase) {
    console.error(
      "[FE] Supabase library not found. " +
      "Did you forget to include the Supabase <script> tag?"
    );
    return;
  }

  // ---- CREATE CLIENT ----
  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    }
  );

  // ---- EXPOSE ----
  window.FE_SUPABASE = client;

  console.log("[FE] Supabase client initialised");
})();
