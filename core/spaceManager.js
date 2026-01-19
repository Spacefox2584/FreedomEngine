import { loadGizmoModule } from "./gizmoLoader.js";

export function createSpaceManager({ mountEl, pane, coreApi }) {
  let active = null; // { id, manifest, instance, cleanup }

  async function mountSpace(manifest, { card = null } = {}) {
    // Unmount current
    if (active?.cleanup) {
      try {
        active.cleanup();
      } catch (_) {}
    }

    mountEl.innerHTML = "";

    const ctx = createCtx(manifest, { card });

    try {
      const mod = await loadGizmoModule(manifest.entry);
      if (!mod || typeof mod.mount !== "function") {
        throw new Error(`Gizmo module missing mount(): ${manifest.id}`);
      }

      const result = await mod.mount(mountEl, ctx);

      active = {
        id: manifest.id,
        manifest,
        instance: result || null,
        cleanup: () => {
          try {
            pane.close();
          } catch (_) {}
          if (result && typeof result.unmount === "function") {
            result.unmount();
          }
        },
      };
    } catch (err) {
      // Isolation baseline: gizmo can fail, FE stays alive.
      mountEl.innerHTML = renderCrashed(manifest, err);
      active = {
        id: manifest.id,
        manifest,
        instance: null,
        cleanup: () => {
          mountEl.innerHTML = "";
        },
      };
    }
  }

  function createCtx(manifest, { card }) {
    // Only sanctioned surface area for gizmos.
    // Keep it small and explicit. No hidden globals.
    return {
      gizmo: {
        id: manifest.id,
        name: manifest.name || manifest.id,
        version: manifest.version || "0.0.0",
      },

      // Core services
      nav: coreApi.nav,
      pane: coreApi.paneApi,
      state: coreApi.stateApi,

      // ✅ R2: local-first store (this is what C-Deck needs)
      store: coreApi.store,

      log: (...args) => coreApi.log(`[${manifest.id}]`, ...args),

      // Optional selection restored from URL
      selection: { card },
    };
  }

  function getActiveId() {
    return active?.id || null;
  }

  return { mountSpace, getActiveId };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderCrashed(manifest, err) {
  const msg = escapeHtml(err?.message || String(err));
  return `
    <div style="padding:16px">
      <div style="font-weight:700; margin-bottom:6px">Gizmo paused</div>
      <div style="color:var(--muted); margin-bottom:10px">
        <div><b>${escapeHtml(manifest.name || manifest.id)}</b> crashed while mounting.</div>
        <div>Shell is still live.</div>
      </div>
      <div style="border:1px solid var(--border); border-radius:12px; padding:10px; background:rgba(255,255,255,0.03)">
        <div style="font-size:12px; color:var(--muted); margin-bottom:6px">Error</div>
        <div style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:12px; white-space:pre-wrap">${msg}</div>
      </div>
    </div>
  `;
}
