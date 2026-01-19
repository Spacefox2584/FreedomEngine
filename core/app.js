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
const btnInspector = document.getElementById("fe-inspector-toggle");
const elInspector = document.getElementById("fe-inspector");
const elInspectorBody = document.getElementById("fe-inspector-body");

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
  cache: new Map(), // spaceId -> { card, pane }
  inspectorOpen: false,
  inspectorTimer: null,
};

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
    if (!open) app.state.card = null;

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
      <div style="color:var(--muted); margin-bottom:10px">Check console.</div>
      <div style="border:1px solid var(--border); border-radius:12px; padding:10px; background:rgba(255,255,255,0.03)">
        <div style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:12px; white-space:pre-wrap">${escapeHtml(
          err?.message || String(err)
        )}</div>
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

  // Inspector toggle (dev-only)
  btnInspector.addEventListener("click", () => toggleInspector());

  // Keyboard toggle: Ctrl+` (or Cmd+` on mac)
  window.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const metaOrCtrl = isMac ? e.metaKey : e.ctrlKey;
    if (metaOrCtrl && e.key === "`") {
      e.preventDefault();
      toggleInspector();
    }
  });

  // Init local-first store (snapshot + replay)
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

  // Mount initial space (with cached state if URL didn’t specify)
  const cached = app.cache.get(app.state.space);
  const card = app.state.card ?? cached?.card ?? null;

  await mountSpace(app.state.space, { card });

  // Pane restore (fallback only)
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

  // Update inspector quickly when switching spaces
  if (app.inspectorOpen) {
    await renderInspector();
  }
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
// INSPECTOR
// --------------------
async function toggleInspector() {
  app.inspectorOpen = !app.inspectorOpen;
  elInspector.dataset.open = app.inspectorOpen ? "1" : "0";

  btnInspector.textContent = app.inspectorOpen ? "Inspector: ON" : "Inspector";

  if (app.inspectorTimer) {
    clearInterval(app.inspectorTimer);
    app.inspectorTimer = null;
  }

  if (app.inspectorOpen) {
    await renderInspector();
    app.inspectorTimer = setInterval(renderInspector, 1000);
  }
}

async function renderInspector() {
  const s = await Store.stats();
  const active = app.manifests.get(app.state.space);
  const activeLabel = active ? `${active.id} @ ${active.version || "0.0.0"}` : "(none)";

  const countsLines = Object.entries(s.counts || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const snapTs = s.journal.snapshotTs ? new Date(s.journal.snapshotTs).toLocaleString() : "—";
  const snapSeq = s.journal.snapshotLastSeqApplied ?? "—";

  elInspectorBody.textContent =
`SPACE: ${activeLabel}
URL: ${formatRouteHint(app.state)}

OBJECT COUNTS
${countsLines || "(none)"}

JOURNAL
nextSeq: ${s.journal.nextSeq}
journalCount: ${s.journal.journalCount}
lastAppliedSeq: ${s.lastAppliedSeq}

SNAPSHOT
snapshotTs: ${snapTs}
snapshotLastSeqApplied: ${snapSeq}
`;
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
    forceSnapshot: Store.forceSnapshot,
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
