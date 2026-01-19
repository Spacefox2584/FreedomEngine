import { parseUrlState, writeUrlState, formatRouteHint } from "./urlState.js";
import { createPaneController } from "./pane.js";
import { loadManifest } from "./gizmoLoader.js";
import { createSpaceManager } from "./spaceManager.js";
import * as Store from "./store.js";

// --------------------
// MANIFESTS
// --------------------
const MANIFEST_PATHS = [
  "/gizmos/cdeck/gizmo.manifest.json",
  "/gizmos/hello/gizmo.manifest.json",
];

// --------------------
// DOM
// --------------------
const elSpaces = document.getElementById("fe-spaces");
const elMount = document.getElementById("fe-mount");
const elPane = document.getElementById("fe-pane");
const elPaneTitle = document.getElementById("fe-pane-title");
const elPaneBody = document.getElementById("fe-pane-body");
const elPaneClose = document.getElementById("fe-pane-close");
const elRouteHint = document.getElementById("fe-route-hint");
const btnTheme = document.getElementById("fe-toggle-theme");

// Inspector (R3)
const btnInspectToggle = document.getElementById("fe-inspect-toggle");
const btnInspectClose = document.getElementById("fe-inspect-close");
const elInspector = document.getElementById("fe-inspector");
const elInspectBody = document.getElementById("fe-inspect-body");
const btnSnapshotNow = document.getElementById("fe-snapshot-now");

// --------------------
// APP STATE
// --------------------
const app = {
  manifests: new Map(), // id -> manifest
  order: [],
  state: {
    space: "cdeck",
    card: null,
    pane: false,
  },
  // Per-space cached UI selection (memory-only in R1/R2/R3)
  cache: new Map(), // spaceId -> { card, pane }
};

let inspectorTimer = null;

// --------------------
// PANE
// --------------------
const pane = createPaneController({
  paneEl: elPane,
  titleEl: elPaneTitle,
  bodyEl: elPaneBody,
  closeBtn: elPaneClose,
  onStateChange: ({ open }) => {
    app.state.pane = !!open;

    if (!open) {
      app.state.card = null;
    }

    cacheSpaceUi(app.state.space);
    writeUrlState(app.state);
    renderRouteHint();
  },
});

// --------------------
// CORE API + SPACE MANAGER
// --------------------
const coreApi = createCoreApi();
const spaceManager = createSpaceManager({ mountEl: elMount, pane, coreApi });

// --------------------
// BOOT
// --------------------
boot().catch((err) => {
  console.error("FE boot failed:", err);
  elMount.innerHTML = `
    <div style="padding:16px">
      <div style="font-weight:700; margin-bottom:6px">Shell boot failed</div>
      <div style="color:var(--muted); margin-bottom:10px">
        Check console. FE should remain inspectable.
      </div>
      <div style="border:1px solid var(--border); border-radius:12px; padding:10px; background:rgba(255,255,255,0.03)">
        <div style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:12px; white-space:pre-wrap">${
          escapeHtml(err?.message || String(err))
        }</div>
      </div>
    </div>
  `;
});

async function boot() {
  // Theme toggle
  btnTheme.addEventListener("click", () => {
    document.body.dataset.theme =
      document.body.dataset.theme === "dark" ? "light" : "dark";
  });

  // R3: inspector toggle
  btnInspectToggle?.addEventListener("click", () => setInspectorOpen(true));
  btnInspectClose?.addEventListener("click", () => setInspectorOpen(false));

  btnSnapshotNow?.addEventListener("click", async () => {
    await Store.snapshotNow();
    if (isInspectorOpen()) await refreshInspector();
  });

  // R2/R3: initialise local-first store (now snapshot-aware)
  await Store.initStore();

  // Load manifests
  await loadAllManifests();

  // Initial state from URL
  const fromUrl = parseUrlState();
  app.state.space = app.manifests.has(fromUrl.space) ? fromUrl.space : "cdeck";
  app.state.card = fromUrl.card;
  app.state.pane = fromUrl.pane;

  // Render tabs
  renderSpaces();

  // Mount initial space
  const cached = app.cache.get(app.state.space);
  const card = app.state.card ?? cached?.card ?? null;

  await mountSpace(app.state.space, { card });

  // Pane restore
  if (app.state.pane && card) {
    pane.open({
      title: "Details",
      render: (host) => {
        host.innerHTML = `<div style="color:var(--muted)">Restored pane (no gizmo content yet).</div>`;
      },
    });
  } else {
    pane.close();
  }

  writeUrlState(app.state, { replace: true });
  renderRouteHint();

  // Browser navigation restore
  window.addEventListener("popstate", async () => {
    const s = parseUrlState();
    const targetSpace = app.manifests.has(s.space) ? s.space : "cdeck";
    const card2 = s.card;

    app.state.space = targetSpace;
    app.state.card = card2;
    app.state.pane = !!s.pane;

    renderSpaces();
    await mountSpace(targetSpace, { card: card2 });

    if (app.state.pane && card2) {
      pane.open({
        title: "Details",
        render: (host) => {
          host.innerHTML = `<div style="color:var(--muted)">Restored pane (no gizmo content yet).</div>`;
        },
      });
    } else {
      pane.close();
    }

    cacheSpaceUi(targetSpace);
    renderRouteHint();
  });
}

// --------------------
// MANIFEST LOADING
// --------------------
async function loadAllManifests() {
  const loaded = await Promise.all(
    MANIFEST_PATHS.map(async (p) => loadManifest(p))
  );

  loaded.forEach((m) => {
    app.manifests.set(m.id, m);
    app.order.push(m.id);
  });
}

// --------------------
// SPACE MOUNTING
// --------------------
async function mountSpace(spaceId, { card = null } = {}) {
  const manifest = app.manifests.get(spaceId);
  if (!manifest) return;

  app.state.space = spaceId;
  app.state.card = card;

  await spaceManager.mountSpace(manifest, { card });

  cacheSpaceUi(spaceId);
  writeUrlState(app.state);
  renderRouteHint();
}

// --------------------
// UI RENDERING
// --------------------
function renderSpaces() {
  elSpaces.innerHTML = "";

  for (const id of app.order) {
    const m = app.manifests.get(id);

    const btn = document.createElement("button");
    btn.className = "space-tab";
    btn.dataset.active = id === app.state.space ? "1" : "0";
    btn.type = "button";

    const icon = document.createElement("span");
    icon.className = "space-icon";
    icon.textContent = (m.icon || "•").slice(0, 2);

    const label = document.createElement("span");
    label.textContent = m.name || m.id;

    btn.appendChild(icon);
    btn.appendChild(label);

    btn.addEventListener("click", async () => {
      cacheSpaceUi(app.state.space);

      const cached = app.cache.get(id);
      const nextCard = cached?.card ?? null;

      pane.close();

      app.state.space = id;
      app.state.card = nextCard;
      app.state.pane = false;

      renderSpaces();
      await mountSpace(id, { card: nextCard });
    });

    elSpaces.appendChild(btn);
  }
}

function cacheSpaceUi(spaceId) {
  app.cache.set(spaceId, {
    card: app.state.card,
    pane: pane.isOpen(),
  });
}

function renderRouteHint() {
  elRouteHint.textContent = formatRouteHint(app.state);
}

// --------------------
// Inspector (R3)
// --------------------
function isInspectorOpen() {
  return elInspector?.dataset.open === "1";
}

function setInspectorOpen(open) {
  if (!elInspector) return;

  elInspector.dataset.open = open ? "1" : "0";

  if (open) {
    refreshInspector();
    inspectorTimer = window.setInterval(refreshInspector, 500);
  } else {
    if (inspectorTimer) window.clearInterval(inspectorTimer);
    inspectorTimer = null;
  }
}

async function refreshInspector() {
  if (!elInspectBody) return;

  try {
    const stats = await Store.getDebugStats();
    elInspectBody.textContent = JSON.stringify(stats, null, 2);
  } catch (e) {
    elInspectBody.textContent = `Inspector error: ${e?.message || String(e)}`;
  }
}

// --------------------
// CORE API (what gizmos can do)
// --------------------
function createCoreApi() {
  function log(...args) {
    console.log(...args);
  }

  const nav = {
    selectCard: (cardId, { openPane = true } = {}) => {
      app.state.card = cardId;
      if (openPane) app.state.pane = true;

      cacheSpaceUi(app.state.space);
      writeUrlState(app.state);
      renderRouteHint();
    },

    goToSpace: async (spaceId) => {
      if (!app.manifests.has(spaceId)) return;

      cacheSpaceUi(app.state.space);
      pane.close();

      app.state.space = spaceId;
      app.state.card = null;
      app.state.pane = false;

      renderSpaces();
      await mountSpace(spaceId, { card: null });
    },

    closePane: () => pane.close(),
    openPane: (payload) => pane.open(payload),
  };

  const paneApi = {
    open: (payload) => {
      app.state.pane = true;
      pane.open(payload);
      cacheSpaceUi(app.state.space);
      writeUrlState(app.state);
      renderRouteHint();
    },
    close: () => pane.close(),
    isOpen: () => pane.isOpen(),
  };

  const stateApi = {
    get: () => ({ ...app.state }),
  };

  const storeApi = {
    get: Store.get,
    list: Store.list,
    mutate: Store.mutate,
    subscribe: Store.subscribe,

    // R3 extras (harmless, optional)
    snapshotNow: Store.snapshotNow,
    getDebugStats: Store.getDebugStats,
  };

  return { nav, paneApi, stateApi, store: storeApi, log };
}

// --------------------
// UTIL
// --------------------
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
