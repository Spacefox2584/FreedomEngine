import { parseUrlState, writeUrlState, formatRouteHint } from "./urlState.js";
import { createPaneController } from "./pane.js";
import { loadManifest } from "./gizmoLoader.js";
import { createSpaceManager } from "./spaceManager.js";
import * as Store from "./store.js";

// ====================
// FE META (R3.2)
// ====================
// Keep this boring and edit it when you tag a release.
const FE_RELEASE = "FE.01.A1.R3.2";
const FE_VERSION = "0.1.x";

// Where feedback should go. Change this to your business email.
const FE_FEEDBACK_EMAIL = "ops@freedomengine.io";

// Changelog source of truth (new).
// This file must be updated first whenever you create a new R revision.
const FE_CHANGELOG_URL = "/CHANGELOG.md";

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

// R3.2 buttons
const btnChangelog = document.getElementById("fe-btn-changelog");
const btnFeedback = document.getElementById("fe-btn-feedback");

// Inspector
const btnInspectToggle = document.getElementById("fe-inspect-toggle");
const btnInspectClose = document.getElementById("fe-inspect-close");
const elInspector = document.getElementById("fe-inspector");
const elInspectBody = document.getElementById("fe-inspect-body");
const btnSnapshotNow = document.getElementById("fe-snapshot-now");

// --------------------
// APP STATE
// --------------------
const app = {
  manifests: new Map(),
  order: [],
  state: {
    space: "cdeck",
    card: null,
    pane: false,
  },
  cache: new Map(),
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

    document.body.classList.toggle("pane-open", open);

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
  elMount.innerHTML = `<div style="padding:16px">Shell boot failed</div>`;
});

async function boot() {
  // Theme toggle
  btnTheme.addEventListener("click", () => {
    document.body.dataset.theme =
      document.body.dataset.theme === "dark" ? "light" : "dark";
  });

  // R3.2: Changelog
  btnChangelog?.addEventListener("click", () => openChangelogPane());

  // R3.2: Feedback (mailto)
  btnFeedback?.addEventListener("click", () => openFeedbackMailto());

  // Inspector
  btnInspectToggle?.addEventListener("click", () => setInspectorOpen(true));
  btnInspectClose?.addEventListener("click", () => setInspectorOpen(false));

  btnSnapshotNow?.addEventListener("click", async () => {
    await Store.snapshotNow();
    if (isInspectorOpen()) await refreshInspector();
  });

  await Store.initStore();
  await loadAllManifests();

  const fromUrl = parseUrlState();
  app.state.space = app.manifests.has(fromUrl.space) ? fromUrl.space : "cdeck";
  app.state.card = fromUrl.card;
  app.state.pane = fromUrl.pane;

  renderSpaces();

  const cached = app.cache.get(app.state.space);
  const card = app.state.card ?? cached?.card ?? null;

  await mountSpace(app.state.space, { card });

  if (app.state.pane && card) {
    document.body.classList.add("pane-open");
  } else {
    pane.close();
    document.body.classList.remove("pane-open");
  }

  writeUrlState(app.state, { replace: true });
  renderRouteHint();
}

// --------------------
// MANIFEST LOADING
// --------------------
async function loadAllManifests() {
  const loaded = await Promise.all(MANIFEST_PATHS.map(loadManifest));
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
// UI
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

    btn.append(icon, label);

    btn.onclick = async () => {
      cacheSpaceUi(app.state.space);
      pane.close();
      document.body.classList.remove("pane-open");

      app.state.space = id;
      app.state.card = null;
      app.state.pane = false;

      renderSpaces();
      await mountSpace(id, { card: null });
    };

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
// CHANGELOG (now loaded from /CHANGELOG.md)
// --------------------
async function openChangelogPane() {
  coreApi.paneApi.open({
    title: "Changelog",
    render: (host) => {
      host.innerHTML = `<div style="color:var(--muted)">Loading changelog…</div>`;
    },
  });

  try {
    // cache-bust so updates show immediately during dev
    const res = await fetch(`${FE_CHANGELOG_URL}?v=${Date.now()}`);
    const text = await res.text();

    coreApi.paneApi.open({
      title: "Changelog",
      render: (host) => {
        host.innerHTML = "";

        const head = document.createElement("div");
        head.style.display = "grid";
        head.style.gap = "4px";
        head.style.marginBottom = "10px";

        const h1 = document.createElement("div");
        h1.style.fontWeight = "800";
        h1.textContent = "FreedomEngine";

        const meta = document.createElement("div");
        meta.style.color = "var(--muted)";
        meta.style.fontSize = "12px";
        meta.textContent = `Version: ${FE_VERSION} • Release: ${FE_RELEASE}`;

        const pre = document.createElement("pre");
        pre.style.margin = "0";
        pre.style.whiteSpace = "pre-wrap";
        pre.style.fontSize = "12px";
        pre.style.lineHeight = "1.45";
        pre.style.fontFamily =
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        pre.textContent = text || "(empty changelog)";

        head.append(h1, meta);
        host.append(head, pre);
      },
    });
  } catch (e) {
    coreApi.paneApi.open({
      title: "Changelog",
      render: (host) => {
        host.innerHTML = `<div style="color:var(--muted)">Failed to load /CHANGELOG.md</div>`;
      },
    });
  }
}

// --------------------
// FEEDBACK (R3.2)
// --------------------
function openFeedbackMailto() {
  const state = coreApi.stateApi.get();
  const ua = navigator.userAgent || "unknown";

  const subject = `[FreedomEngine Feedback] ${FE_RELEASE} • ${state.space}`;
  const bodyLines = [
    `Release: ${FE_RELEASE}`,
    `Version: ${FE_VERSION}`,
    `Space: ${state.space}`,
    `Card: ${state.card || ""}`,
    `URL: ${window.location.href}`,
    `UA: ${ua}`,
    ``,
    `What I was doing:`,
    ``,
    `What I expected:`,
    ``,
    `What happened:`,
    ``,
  ];

  const mailto =
    `mailto:${encodeURIComponent(FE_FEEDBACK_EMAIL)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(bodyLines.join("\n"))}`;

  window.location.href = mailto;
}

// --------------------
// INSPECTOR
// --------------------
function isInspectorOpen() {
  return elInspector?.dataset.open === "1";
}

function setInspectorOpen(open) {
  if (!elInspector) return;
  elInspector.dataset.open = open ? "1" : "0";

  if (open) {
    refreshInspector();
    inspectorTimer = setInterval(refreshInspector, 500);
  } else {
    clearInterval(inspectorTimer);
    inspectorTimer = null;
  }
}

async function refreshInspector() {
  try {
    const stats = await Store.getDebugStats();
    elInspectBody.textContent = JSON.stringify(stats, null, 2);
  } catch (e) {
    elInspectBody.textContent = String(e);
  }
}

// --------------------
// CORE API
// --------------------
function createCoreApi() {
  return {
    nav: {
      selectCard: (cardId, { openPane = true } = {}) => {
        app.state.card = cardId;
        if (openPane) {
          app.state.pane = true;
          document.body.classList.add("pane-open");
        }
        writeUrlState(app.state);
        renderRouteHint();
      },
      closePane: () => {
        pane.close();
        document.body.classList.remove("pane-open");
      },
    },
    paneApi: {
      open: (payload) => pane.open(payload),
      close: () => pane.close(),
      isOpen: () => pane.isOpen(),
    },
    stateApi: {
      get: () => ({ ...app.state }),
    },
    store: {
      get: Store.get,
      list: Store.list,
      mutate: Store.mutate,
      subscribe: Store.subscribe,
    },
  };
}
