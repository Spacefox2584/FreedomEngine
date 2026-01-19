import { parseUrlState, writeUrlState, formatRouteHint } from "./urlState.js";
import { createPaneController } from "./pane.js";
import { loadManifest } from "./gizmoLoader.js";
import { createSpaceManager } from "./spaceManager.js";

const MANIFEST_PATHS = [
  "/gizmos/cdeck/gizmo.manifest.json",
  "/gizmos/hello/gizmo.manifest.json",
];

const elSpaces = document.getElementById("fe-spaces");
const elMount = document.getElementById("fe-mount");
const elPane = document.getElementById("fe-pane");
const elPaneTitle = document.getElementById("fe-pane-title");
const elPaneBody = document.getElementById("fe-pane-body");
const elPaneClose = document.getElementById("fe-pane-close");
const elRouteHint = document.getElementById("fe-route-hint");
const btnTheme = document.getElementById("fe-toggle-theme");

const app = {
  manifests: new Map(),  // id -> manifest
  order: [],
  state: {
    space: "cdeck",
    card: null,
    pane: false,
  },
  // Per-space cached UI selection (memory only in R1)
  cache: new Map(), // id -> { card, pane }
};

const pane = createPaneController({
  paneEl: elPane,
  titleEl: elPaneTitle,
  bodyEl: elPaneBody,
  closeBtn: elPaneClose,
  onStateChange: ({ open }) => {
    app.state.pane = !!open;
    if (!open) {
      // If pane closes, clear card selection from URL (keeps it clean)
      app.state.card = null;
    }
    cacheSpaceUi(app.state.space);
    writeUrlState(app.state);
    renderRouteHint();
  },
});

const coreApi = createCoreApi();
const spaceManager = createSpaceManager({ mountEl: elMount, pane, coreApi });

boot();

async function boot() {
  // Theme toggle (R1)
  btnTheme.addEventListener("click", () => {
    document.body.dataset.theme = document.body.dataset.theme === "dark" ? "light" : "dark";
  });

  // Load manifests
  await loadAllManifests();

  // Initial state from URL
  const fromUrl = parseUrlState();
  // If URL asks for something invalid, fall back safely
  app.state.space = app.manifests.has(fromUrl.space) ? fromUrl.space : "cdeck";
  app.state.card = fromUrl.card;
  app.state.pane = fromUrl.pane;

  // Render tabs
  renderSpaces();

  // Mount initial space (with cached state if URL didn’t specify)
  const cached = app.cache.get(app.state.space);
  const card = app.state.card ?? cached?.card ?? null;

  await mountSpace(app.state.space, { card });

  // Pane restore
  if (app.state.pane && card) {
    // Let gizmo decide what pane content is; we provide a default if it doesn’t.
    // (Gizmo will usually open it when selecting a card. This is a safety.)
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

    // Update + mount
    app.state.space = targetSpace;
    app.state.card = card2;
    app.state.pane = !!s.pane;
    renderSpaces();

    await mountSpace(targetSpace, { card: card2 });

    if (app.state.pane && card2) {
      // Gizmo should open; fallback default:
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

async function loadAllManifests() {
  const loaded = await Promise.all(
    MANIFEST_PATHS.map(async (p) => {
      const m = await loadManifest(p);
      return m;
    })
  );

  loaded.forEach((m) => {
    app.manifests.set(m.id, m);
    app.order.push(m.id);
  });
}

async function mountSpace(spaceId, { card = null } = {}) {
  const manifest = app.manifests.get(spaceId);
  if (!manifest) return;

  app.state.space = spaceId;
  app.state.card = card;
  // Pane open state is a per-space cached preference (unless URL explicitly says otherwise)
  const cached = app.cache.get(spaceId);
  if (cached && app.state.pane === false && cached.pane === true && !app.state.card) {
    // If we had pane open but no card, we don't force it. Keep it closed.
  }

  await spaceManager.mountSpace(manifest, { card });

  // Persist UI cache (memory only in R1)
  cacheSpaceUi(spaceId);

  // Update URL + hint
  writeUrlState(app.state);
  renderRouteHint();
}

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
      // Cache outgoing space UI
      cacheSpaceUi(app.state.space);

      // Restore incoming space UI (memory only)
      const cached = app.cache.get(id);
      const nextCard = cached?.card ?? null;

      // Close pane now; gizmo will open it if needed
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

/**
 * Core API: what gizmos can do in R1.
 * Keep it small.
 */
function createCoreApi() {
  function log(...args) {
    // Dev-simple logging. Can be swapped later.
    console.log(...args);
  }

  const nav = {
    /**
     * Select an object (e.g. a card) and optionally open the pane.
     * This writes URL state immediately.
     */
    selectCard: (cardId, { openPane = true } = {}) => {
      app.state.card = cardId;
      if (openPane) {
        app.state.pane = true;
      }
      cacheSpaceUi(app.state.space);
      writeUrlState(app.state);
      renderRouteHint();
    },

    /**
     * Switch to another space (gizmo).
     */
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
    close: () => {
      pane.close();
    },
    isOpen: () => pane.isOpen(),
  };

  const stateApi = {
    get: () => ({ ...app.state }),
  };

  return { nav, paneApi, stateApi, log };
}
