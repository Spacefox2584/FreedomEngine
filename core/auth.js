// core/auth.js
// R6.3 → R6.4 (Auth change)
// - REMOVE magic link auth
// - REMOVE guest mode
// - IMPLEMENT manual business login (email + password)
// - ADD post-login staff selection via lightweight avatar cards
//
// Staff list (optional) via window.FE_ENV:
//   FE_STAFF_JSON = JSON string of array:
//     [
//       { "id":"alex", "name":"Alex", "initials":"AM", "pin":"1234" },
//       { "id":"sam",  "name":"Sam",  "initials":"S",  "pin":"7788" }
//     ]
// If no staff list provided, FE will create a single staff identity from the signed-in email.
//
// Notes:
// - Passwords are NOT generated client-side. Use Supabase Auth users you create/admin-manage.
// - Staff PIN is optional; if provided it is validated client-side (lightweight guard).

import { createSupabaseClient } from "./supabase.js";

const SS = {
  staff: "fe.staff", // sessionStorage: JSON { id, name, initials }
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

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function getStaffListFromEnv() {
  const env = window.FE_ENV || {};
  const raw = String(env.FE_STAFF_JSON || "").trim();
  if (!raw) return [];
  const list = safeJsonParse(raw, []);
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => ({
      id: String(s?.id || "").trim(),
      name: String(s?.name || "").trim(),
      initials: String(s?.initials || "").trim(),
      pin: String(s?.pin || "").trim(),
    }))
    .filter((s) => s.id && s.name);
}

function deriveStaffFromEmail(email) {
  const local = String(email || "").split("@")[0] || "staff";
  const nice = local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
  const initials = nice
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("") || "U";
  return { id: local.toLowerCase(), name: nice || "Staff", initials };
}

function getSelectedStaff() {
  const raw = sessionStorage.getItem(SS.staff);
  if (!raw) return null;
  const s = safeJsonParse(raw, null);
  if (!s || !s.id || !s.name) return null;
  return s;
}

function setSelectedStaff(staff) {
  sessionStorage.setItem(SS.staff, JSON.stringify(staff));
}

function clearSelectedStaff() {
  sessionStorage.removeItem(SS.staff);
}

export async function initAuthOverlay({ accountButton, releaseTag } = {}) {
  const overlay = qs("fe-auth-overlay");

  // login fields
  const emailInput = qs("fe-auth-email");
  const passInput = qs("fe-auth-pass");
  const btnLogin = qs("fe-auth-login");
  const msg = qs("fe-auth-msg");

  // staff selection
  const staffWrap = qs("fe-staff-wrap");
  const staffGrid = qs("fe-staff-grid");
  const staffTitle = qs("fe-staff-title");
  const staffHint = qs("fe-staff-hint");
  const pinWrap = qs("fe-staff-pin-wrap");
  const pinInput = qs("fe-staff-pin");
  const btnPinConfirm = qs("fe-staff-pin-confirm");
  const btnStaffBack = qs("fe-staff-back");

  if (!overlay) return;

  // Create supabase client (non-fatal if missing, but auth is required now).
  const sb = createSupabaseClient();
  const supabase = sb.ok ? sb.client : null;

  const openOverlay = () => {
    setMsg(msg, "");
    setOpen(overlay, true);
    showLogin();
    setTimeout(() => emailInput?.focus?.(), 0);
  };

  const closeOverlay = () => {
    setOpen(overlay, false);
  };

  const showLogin = () => {
    overlay.dataset.step = "login";
    if (staffWrap) staffWrap.style.display = "none";
    if (pinWrap) pinWrap.style.display = "none";
    if (emailInput) emailInput.disabled = false;
    if (passInput) passInput.disabled = false;
    if (btnLogin) btnLogin.disabled = false;
  };

  const showStaffSelect = async () => {
    overlay.dataset.step = "staff";
    if (staffWrap) staffWrap.style.display = "grid";
    if (pinWrap) pinWrap.style.display = "none";
    setMsg(msg, "");

    if (!supabase) {
      setMsg(
        msg,
        "Auth unavailable (Supabase not configured). FE cannot proceed without auth.",
        "error"
      );
      return;
    }

    const { data } = await supabase.auth.getSession();
    const email = data?.session?.user?.email || "";

    const staffList = getStaffListFromEnv();
    const fallback = deriveStaffFromEmail(email);

    if (staffTitle) staffTitle.textContent = "Choose staff";
    if (staffHint) {
      staffHint.textContent =
        staffList.length > 0
          ? "Select who you are."
          : "No staff list configured. Using signed-in email as staff identity.";
    }

    if (staffGrid) {
      staffGrid.innerHTML = "";

      const renderCard = (staff, requiresPin) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fe-staff-card";
        btn.dataset.requiresPin = requiresPin ? "1" : "0";

        const avatar = document.createElement("div");
        avatar.className = "fe-staff-avatar";
        avatar.textContent = (staff.initials || staff.name || "U")
          .trim()
          .slice(0, 2)
          .toUpperCase();

        const name = document.createElement("div");
        name.className = "fe-staff-name";
        name.textContent = staff.name;

        const meta = document.createElement("div");
        meta.className = "fe-staff-meta";
        meta.textContent = requiresPin ? "PIN required" : "Tap to enter";

        btn.append(avatar, name, meta);

        btn.addEventListener("click", () => {
          if (requiresPin) {
            // show pin gate
            overlay.dataset.pendingStaffId = staff.id;
            overlay.dataset.pendingStaffName = staff.name;
            overlay.dataset.pendingStaffInitials = staff.initials || "";
            if (pinInput) pinInput.value = "";
            if (pinWrap) pinWrap.style.display = "grid";
            setTimeout(() => pinInput?.focus?.(), 0);
            setMsg(msg, "");
          } else {
            setSelectedStaff({
              id: staff.id,
              name: staff.name,
              initials: staff.initials || "",
            });
            closeOverlay();
            updateAccountButton().catch(() => {});
          }
        });

        staffGrid.appendChild(btn);
      };

      if (staffList.length > 0) {
        staffList.forEach((s) => renderCard(s, !!s.pin));
      } else {
        renderCard(fallback, false);
      }
    }
  };

  const updateAccountButton = async () => {
    if (!accountButton) return;

    if (!supabase) {
      accountButton.textContent = "Auth offline";
      accountButton.title = "Supabase not configured";
      accountButton.dataset.mode = "noauth";
      return;
    }

    const { data } = await supabase.auth.getSession();
    const email = data?.session?.user?.email || "";

    if (!email) {
      accountButton.textContent = "Sign in";
      accountButton.title = "Sign in";
      accountButton.dataset.mode = "signedout";
      return;
    }

    const staff = getSelectedStaff();
    if (staff?.name) {
      accountButton.textContent = staff.name.length > 16 ? "Account" : staff.name;
      accountButton.title = `${email} • ${staff.name} • click to sign out`;
      accountButton.dataset.mode = "signedin";
    } else {
      accountButton.textContent = "Select staff";
      accountButton.title = `${email} • select staff`;
      accountButton.dataset.mode = "needstaff";
    }
  };

  const decideInitial = async () => {
    if (!supabase) {
      openOverlay();
      setMsg(
        msg,
        "Auth unavailable (Supabase not configured). FE cannot proceed without auth.",
        "error"
      );
      return;
    }

    const { data } = await supabase.auth.getSession();
    const hasSession = !!data?.session;

    if (!hasSession) {
      openOverlay();
      return;
    }

    // session exists: ensure staff chosen
    const staff = getSelectedStaff();
    if (!staff) {
      setOpen(overlay, true);
      await showStaffSelect();
    } else {
      closeOverlay();
    }
  };

  // Account button behaviour
  accountButton?.addEventListener("click", async () => {
    if (!supabase) {
      openOverlay();
      return;
    }

    const { data } = await supabase.auth.getSession();
    const hasSession = !!data?.session;

    if (hasSession) {
      // sign out hard
      await supabase.auth.signOut();
      clearSelectedStaff();
      await updateAccountButton();
      openOverlay();
    } else {
      openOverlay();
    }
  });

  // Login submit
  btnLogin?.addEventListener("click", async () => {
    if (!supabase) {
      setMsg(
        msg,
        "Auth unavailable (Supabase not configured). FE cannot proceed without auth.",
        "error"
      );
      return;
    }

    const email = String(emailInput?.value || "").trim();
    const password = String(passInput?.value || "").trim();

    if (!email || !email.includes("@")) {
      setMsg(msg, "Enter a valid email address.", "error");
      return;
    }
    if (!password || password.length < 6) {
      setMsg(msg, "Enter your password.", "error");
      return;
    }

    btnLogin.disabled = true;
    setMsg(msg, "Signing in…", "");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMsg(msg, error.message || "Sign in failed.", "error");
      } else {
        // go to staff selection step
        await updateAccountButton();
        await showStaffSelect();
      }
    } catch (e) {
      setMsg(msg, String(e?.message || e), "error");
    } finally {
      btnLogin.disabled = false;
    }
  });

  // Staff PIN confirm
  btnPinConfirm?.addEventListener("click", async () => {
    const pendingId = String(overlay.dataset.pendingStaffId || "");
    const pendingName = String(overlay.dataset.pendingStaffName || "");
    const pendingInitials = String(overlay.dataset.pendingStaffInitials || "");
    const pin = String(pinInput?.value || "").trim();

    const staffList = getStaffListFromEnv();
    const staff = staffList.find((s) => s.id === pendingId);

    if (!pendingId || !pendingName || !staff) {
      setMsg(msg, "Staff selection invalid. Choose staff again.", "error");
      if (pinWrap) pinWrap.style.display = "none";
      return;
    }

    if (!staff.pin) {
      // no pin required
      setSelectedStaff({ id: pendingId, name: pendingName, initials: pendingInitials });
      closeOverlay();
      await updateAccountButton();
      return;
    }

    if (!pin) {
      setMsg(msg, "Enter PIN.", "error");
      return;
    }

    if (pin !== staff.pin) {
      setMsg(msg, "Invalid PIN.", "error");
      return;
    }

    setSelectedStaff({ id: pendingId, name: pendingName, initials: pendingInitials });
    closeOverlay();
    await updateAccountButton();
  });

  // Back to login from staff step
  btnStaffBack?.addEventListener("click", async () => {
    showLogin();
    setMsg(msg, "");
  });

  // Auth state change
  if (supabase) {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        // keep overlay open to force staff select
        setOpen(overlay, true);
        await showStaffSelect();
      }
      if (event === "SIGNED_OUT") {
        clearSelectedStaff();
        openOverlay();
      }
      await updateAccountButton();
    });
  }

  await updateAccountButton();
  await decideInitial();

  // Minimal debug (optional)
  window.FE_AUTH = {
    open: openOverlay,
    close: closeOverlay,
    staff: () => getSelectedStaff(),
    clearStaff: () => clearSelectedStaff(),
    status: async () => {
      if (!supabase) return { mode: "no-supabase" };
      const { data } = await supabase.auth.getSession();
      const email = data?.session?.user?.email || "";
      const staff = getSelectedStaff();
      return {
        mode: email ? (staff ? "ready" : "need-staff") : "signedout",
        email,
        staff,
        release: releaseTag || "",
      };
    },
  };
}
