// core/auth.js
// R6 — Auth overlay (single modal)
// - Shell + gizmos load underneath (no janky pop-in).
// - Supports email magic link (Supabase OTP).
// - Guest mode is session-only (cleared when tab closes).
//
// NOTE: This is intentionally minimal. Business/org world assignment comes next.

import { createSupabaseClient } from "./supabase.js";

const SS = {
  guest: "fe.guest_mode", // sessionStorage only
};

function qs(id) {
  return document.getElementById(id);
}

function setOpen(overlay, open) {
  overlay.dataset.open = open ? "1" : "0";
  overlay.setAttribute("aria-hidden", open ? "false" : "true");
}

function setMsg(el, text, kind = "") {
  if (!el) return;
  el.textContent = text || "";
  el.dataset.kind = kind || "";
}

function inferRedirectUrl() {
  // Use current location (must be allowed in Supabase Auth redirect URLs).
  // This preserves /core/ deployments.
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  return url.toString();
}

export async function initAuthOverlay({ accountButton, releaseTag } = {}) {
  const overlay = qs("fe-auth-overlay");
  const emailInput = qs("fe-auth-email");
  const btnSend = qs("fe-auth-send");
  const btnGuest = qs("fe-auth-guest");
  const msg = qs("fe-auth-msg");

  if (!overlay) return;

  // Create supabase client (non-fatal if missing).
  const sb = createSupabaseClient();
  if (!sb.ok) {
    // If Supabase isn't configured, we still let user proceed as guest.
    setMsg(msg, "Auth unavailable (Supabase not configured). Continue as guest.", "error");
  }
  const supabase = sb.ok ? sb.client : null;

  const updateAccountButton = async () => {
    if (!accountButton) return;

    if (!supabase) {
      accountButton.textContent = "Guest";
      accountButton.title = "Auth unavailable";
      return;
    }

    const { data } = await supabase.auth.getSession();
    const email = data?.session?.user?.email || "";
    if (email) {
      accountButton.textContent = email.length > 18 ? ("Signed in") : email;
      accountButton.title = "Signed in — click to sign out";
      accountButton.dataset.mode = "signedin";
    } else {
      const isGuest = sessionStorage.getItem(SS.guest) === "1";
      accountButton.textContent = isGuest ? "Guest" : "Sign in";
      accountButton.title = isGuest ? "Guest mode — click to sign in" : "Sign in";
      accountButton.dataset.mode = isGuest ? "guest" : "signedout";
    }
  };

  const openOverlay = () => {
    setMsg(msg, "");
    setOpen(overlay, true);
    setTimeout(() => emailInput?.focus?.(), 0);
  };

  const closeOverlay = () => {
    setOpen(overlay, false);
  };

  // Default: show overlay unless already in guest session OR signed in.
  const decideInitial = async () => {
    if (!supabase) {
      openOverlay();
      return;
    }
    const isGuest = sessionStorage.getItem(SS.guest) === "1";
    const { data } = await supabase.auth.getSession();
    const hasSession = !!data?.session;
    if (!hasSession && !isGuest) openOverlay();
    else closeOverlay();
  };

  // Buttons
  accountButton?.addEventListener("click", async () => {
    if (!supabase) {
      openOverlay();
      return;
    }
    const { data } = await supabase.auth.getSession();
    const hasSession = !!data?.session;
    if (hasSession) {
      await supabase.auth.signOut();
      sessionStorage.removeItem(SS.guest);
      await updateAccountButton();
      openOverlay();
    } else {
      openOverlay();
    }
  });

  btnGuest?.addEventListener("click", async () => {
    sessionStorage.setItem(SS.guest, "1");
    closeOverlay();
    await updateAccountButton();
  });

  btnSend?.addEventListener("click", async () => {
    if (!supabase) {
      setMsg(msg, "Supabase not configured. Continue as guest.", "error");
      return;
    }
    const email = String(emailInput?.value || "").trim();
    if (!email || !email.includes("@")) {
      setMsg(msg, "Enter a valid email address.", "error");
      return;
    }
    btnSend.disabled = true;
    setMsg(msg, "Sending magic link…", "");

    try {
      const redirectTo = inferRedirectUrl();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        setMsg(msg, error.message || "Failed to send link.", "error");
      } else {
        setMsg(
          msg,
          "Link sent. Check your email and click the sign-in link.",
          "ok"
        );
      }
    } catch (e) {
      setMsg(msg, String(e?.message || e), "error");
    } finally {
      btnSend.disabled = false;
    }
  });

  // Auth state change
  if (supabase) {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        sessionStorage.removeItem(SS.guest);
        closeOverlay();
      }
      if (event === "SIGNED_OUT") {
        openOverlay();
      }
      await updateAccountButton();
    });
  }

  await updateAccountButton();
  await decideInitial();

  // Expose minimal controls for debugging (optional)
  window.FE_AUTH = {
    open: openOverlay,
    close: closeOverlay,
    status: async () => {
      if (!supabase) return { mode: "no-supabase" };
      const { data } = await supabase.auth.getSession();
      return {
        mode: data?.session ? "signedin" : (sessionStorage.getItem(SS.guest) === "1" ? "guest" : "signedout"),
        email: data?.session?.user?.email || "",
        release: releaseTag || "",
      };
    },
  };
}
