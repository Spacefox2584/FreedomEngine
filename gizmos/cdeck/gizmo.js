let unsubCards = null;
let unsubLanes = null;

export async function mount(host, ctx) {
  ensureCss("/gizmos/cdeck/style.css");

  const root = document.createElement("div");
  root.className = "cdeck";
  host.appendChild(root);

  // Seed lanes once
  if (ctx.store.list("lane").length === 0) {
    ["New", "In Progress", "Waiting", "Resolved"].forEach((name, i) => {
      ctx.store.mutate({
        type: "lane",
        op: "put",
        id: String(i),
        data: { name },
      });
    });
  }

  const render = () => {
    root.innerHTML = "";
    root.appendChild(renderHeader(ctx));
    root.appendChild(renderBody(ctx));
  };

  unsubCards = ctx.store.subscribe("card", render);
  unsubLanes = ctx.store.subscribe("lane", render);

  render();

  // Restore selection if URL had a card
  const selectedId = ctx.selection?.card;
  if (selectedId) {
    const card = ctx.store.get("card", selectedId);
    if (card) openCard(card, ctx);
  }

  return {
    unmount() {
      try { unsubCards?.(); } catch (_) {}
      try { unsubLanes?.(); } catch (_) {}
      root.remove();
    },
  };
}

function renderHeader(ctx) {
  const h = document.createElement("div");
  h.className = "cdeck-head";

  const title = document.createElement("div");
  title.className = "cdeck-title";
  title.textContent = "C-Deck";

  const btn = document.createElement("button");
  btn.className = "btn small";
  btn.textContent = "New card";

  // R3.2: open create form in pane
  btn.onclick = () => openCreateCardPane(ctx);

  h.append(title, btn);
  return h;
}

function renderBody(ctx) {
  const body = document.createElement("div");
  body.className = "cdeck-body";

  const lanesEl = document.createElement("div");
  lanesEl.className = "lanes";

  const lanes = ctx.store.list("lane");
  const cards = ctx.store.list("card");

  lanes.forEach((lane) => {
    const laneEl = document.createElement("div");
    laneEl.className = "lane";

    // Required for drag/drop target detection
    laneEl.dataset.laneId = lane.id;

    const head = document.createElement("div");
    head.className = "lane-head";
    head.textContent = lane.name;

    const cardsEl = document.createElement("div");
    cardsEl.className = "cards";

    cards
      .filter((c) => c.lane === lane.id)
      .forEach((card) => {
        const el = document.createElement("div");
        el.className = "card";

        // Drag/drop enabled (click/hold + drag)
        makeCardDraggable(el, card, ctx);

        const title = document.createElement("div");
        title.className = "card-title";
        title.textContent = card.title || "Untitled";

        const meta = document.createElement("div");
        meta.className = "card-meta";
        const noteCount = Array.isArray(card.notes) ? card.notes.length : 0;
        meta.textContent = `Notes: ${noteCount}`;

        const actions = document.createElement("div");
        actions.className = "card-actions";

        const left = document.createElement("button");
        left.className = "mini";
        left.textContent = "←";
        left.title = "Move left";
        left.onclick = (e) => {
          e.stopPropagation();
          moveCard(card, ctx, -1);
        };

        const right = document.createElement("button");
        right.className = "mini";
        right.textContent = "→";
        right.title = "Move right";
        right.onclick = (e) => {
          e.stopPropagation();
          moveCard(card, ctx, +1);
        };

        actions.append(left, right);

        el.append(title, meta, actions);

        el.onclick = () => openCard(card, ctx);

        cardsEl.appendChild(el);
      });

    laneEl.append(head, cardsEl);
    lanesEl.appendChild(laneEl);
  });

  body.appendChild(lanesEl);
  return body;
}

function openCreateCardPane(ctx) {
  ctx.pane.open({
    title: "Create card",
    render: (host) => {
      host.innerHTML = "";

      const wrap = document.createElement("div");
      wrap.style.display = "grid";
      wrap.style.gap = "10px";

      const labelStyle = "font-size:12px; color: var(--muted); margin-bottom:4px;";
      const inputStyle =
        "width:100%; border-radius:12px; border:1px solid var(--border); background:rgba(255,255,255,0.03); color:var(--text); padding:10px;";

      // Title (required)
      const titleWrap = document.createElement("div");
      const titleLabel = document.createElement("div");
      titleLabel.style = labelStyle;
      titleLabel.textContent = "Title";
      const titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.placeholder = "e.g. John Smith — brake pads enquiry";
      titleInput.style = inputStyle;
      titleInput.autofocus = true;
      titleWrap.append(titleLabel, titleInput);

      // Channel (optional)
      const channelWrap = document.createElement("div");
      const channelLabel = document.createElement("div");
      channelLabel.style = labelStyle;
      channelLabel.textContent = "Channel (optional)";
      const channelSelect = document.createElement("select");
      channelSelect.style = inputStyle;
      const channels = ["", "Call", "Email", "Walk-in", "Web", "Other"];
      channels.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c === "" ? "—" : c;
        channelSelect.appendChild(opt);
      });
      channelWrap.append(channelLabel, channelSelect);

      // Summary (optional)
      const summaryWrap = document.createElement("div");
      const summaryLabel = document.createElement("div");
      summaryLabel.style = labelStyle;
      summaryLabel.textContent = "Summary (optional)";
      const summaryInput = document.createElement("textarea");
      summaryInput.placeholder = "One-paragraph summary…";
      summaryInput.style = inputStyle + "min-height:70px; resize:vertical;";
      summaryWrap.append(summaryLabel, summaryInput);

      // Next action (optional)
      const nextWrap = document.createElement("div");
      const nextLabel = document.createElement("div");
      nextLabel.style = labelStyle;
      nextLabel.textContent = "Next action (optional)";
      const nextInput = document.createElement("input");
      nextInput.type = "text";
      nextInput.placeholder = "e.g. Call back with ETA / send quote";
      nextInput.style = inputStyle;
      nextWrap.append(nextLabel, nextInput);

      // Buttons
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.marginTop = "6px";

      const createBtn = document.createElement("button");
      createBtn.className = "btn small";
      createBtn.textContent = "Create";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn ghost small";
      cancelBtn.textContent = "Cancel";
      cancelBtn.onclick = () => ctx.nav.closePane?.() || ctx.pane.close();

      // Create action
      const doCreate = () => {
        const title = (titleInput.value || "").trim();
        if (!title) {
          titleInput.focus();
          return;
        }

        const id = crypto.randomUUID();
        const channel = (channelSelect.value || "").trim();
        const summary = (summaryInput.value || "").trim();
        const nextAction = (nextInput.value || "").trim();

        const notes = [];
        if (summary) notes.push({ ts: Date.now(), text: `Summary: ${summary}` });
        if (nextAction) notes.push({ ts: Date.now(), text: `Next: ${nextAction}` });

        ctx.store.mutate({
          type: "card",
          op: "put",
          id,
          data: {
            title,
            lane: "0",
            channel: channel || null,
            summary: summary || null,
            nextAction: nextAction || null,
            notes,
          },
        });

        const created = ctx.store.get("card", id);
        if (created) openCard(created, ctx);
      };

      createBtn.onclick = doCreate;

      // Enter to create (when focused in title/next input)
      titleInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doCreate();
      });
      nextInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doCreate();
      });

      row.append(createBtn, cancelBtn);

      wrap.append(titleWrap, channelWrap, summaryWrap, nextWrap, row);
      host.appendChild(wrap);
    },
  });
}

function moveCard(card, ctx, direction) {
  const lanes = ctx.store.list("lane");
  const idx = lanes.findIndex((l) => l.id === card.lane);
  if (idx === -1) return;

  let nextIdx = idx + direction;
  if (nextIdx < 0) nextIdx = lanes.length - 1;
  if (nextIdx >= lanes.length) nextIdx = 0;

  const nextLane = lanes[nextIdx];

  const updated = {
    ...card,
    lane: nextLane.id,
  };

  ctx.store.mutate({
    type: "card",
    op: "put",
    id: card.id,
    data: updated,
  });

  const state = ctx.state.get();
  if (state.card === card.id && state.pane) {
    openCard(updated, ctx);
  }
}

function openCard(card, ctx) {
  ctx.nav.selectCard(card.id, { openPane: true });

  const laneName = laneLabel(card.lane, ctx);
  const notes = Array.isArray(card.notes) ? card.notes : [];

  ctx.pane.open({
    title: card.title,
    render: (host) => {
      host.innerHTML = "";

      const top = document.createElement("div");
      top.style.display = "grid";
      top.style.gap = "10px";

      const meta = document.createElement("div");
      meta.style.color = "var(--muted)";
      meta.style.fontSize = "12px";
      const channel = card.channel ? ` • Channel: ${card.channel}` : "";
      meta.textContent = `Lane: ${laneName}${channel}`;

      const noteList = document.createElement("div");
      noteList.style.display = "grid";
      noteList.style.gap = "8px";

      if (notes.length === 0) {
        const empty = document.createElement("div");
        empty.style.color = "var(--muted)";
        empty.textContent = "No notes yet.";
        noteList.appendChild(empty);
      } else {
        notes.slice().reverse().forEach((n) => {
          const row = document.createElement("div");
          row.style.border = "1px solid var(--border)";
          row.style.borderRadius = "12px";
          row.style.padding = "10px";
          row.style.background = "rgba(255,255,255,0.03)";

          const t = document.createElement("div");
          t.style.color = "var(--muted)";
          t.style.fontSize = "12px";
          t.style.marginBottom = "6px";
          t.textContent = new Date(n.ts).toLocaleString();

          const b = document.createElement("div");
          b.textContent = n.text;

          row.append(t, b);
          noteList.appendChild(row);
        });
      }

      const input = document.createElement("textarea");
      input.placeholder = "Add a note…";
      input.style.width = "100%";
      input.style.minHeight = "70px";
      input.style.borderRadius = "12px";
      input.style.border = "1px solid var(--border)";
      input.style.background = "rgba(255,255,255,0.03)";
      input.style.color = "var(--text)";
      input.style.padding = "10px";
      input.style.resize = "vertical";

      const add = document.createElement("button");
      add.className = "btn small";
      add.textContent = "Add note";
      add.onclick = () => {
        const text = (input.value || "").trim();
        if (!text) return;

        const fresh = ctx.store.get("card", card.id);
        const currentNotes = Array.isArray(fresh?.notes) ? fresh.notes : [];

        const updated = {
          ...fresh,
          notes: [...currentNotes, { ts: Date.now(), text }],
        };

        ctx.store.mutate({
          type: "card",
          op: "put",
          id: card.id,
          data: updated,
        });

        openCard(updated, ctx);
      };

      top.append(meta, noteList, input, add);
      host.appendChild(top);
    },
  });
}

function laneLabel(laneId, ctx) {
  const lane = ctx.store.get("lane", laneId);
  return lane?.name || laneId;
}

function ensureCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

/* =========================================================
   DRAG + DROP (pointer-based)
   Click/hold then drag into another lane
   ========================================================= */

function makeCardDraggable(cardEl, card, ctx) {
  const HOLD_MS = 140;
  const MOVE_PX = 6;

  let holdTimer = null;
  let dragging = false;

  let startX = 0;
  let startY = 0;
  let pointerId = null;

  let ghost = null;
  let currentLaneEl = null;

  cardEl.style.touchAction = "none";

  cardEl.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;

    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;

    try {
      cardEl.setPointerCapture(pointerId);
    } catch (_) {}

    holdTimer = setTimeout(() => {
      dragging = true;
      ghost = createGhost(cardEl);
      moveGhost(ghost, e.clientX, e.clientY);
      cardEl.classList.add("card-dragging");
    }, HOLD_MS);
  });

  cardEl.addEventListener("pointermove", (e) => {
    if (pointerId == null || e.pointerId !== pointerId) return;

    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);

    if (!dragging && (dx > MOVE_PX || dy > MOVE_PX)) {
      clearHold();
    }

    if (!dragging) return;

    moveGhost(ghost, e.clientX, e.clientY);

    const laneEl = laneFromPoint(e.clientX, e.clientY);
    if (laneEl !== currentLaneEl) {
      setLaneHover(currentLaneEl, false);
      currentLaneEl = laneEl;
      setLaneHover(currentLaneEl, true);
    }
  });

  cardEl.addEventListener("pointerup", (e) => {
    if (pointerId == null || e.pointerId !== pointerId) return;

    if (dragging) {
      const laneEl = laneFromPoint(e.clientX, e.clientY);
      const laneId = laneEl?.dataset?.laneId || null;

      if (laneId && laneId !== card.lane) {
        const fresh = ctx.store.get("card", card.id) || card;

        ctx.store.mutate({
          type: "card",
          op: "put",
          id: card.id,
          data: { ...fresh, lane: String(laneId) },
        });

        const state = ctx.state.get();
        if (state.card === card.id && state.pane) {
          const updated = ctx.store.get("card", card.id);
          if (updated) openCard(updated, ctx);
        }
      }
    }

    cleanupDrag();
  });

  cardEl.addEventListener("pointercancel", cleanupDrag);

  function clearHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function cleanupDrag() {
    clearHold();

    if (ghost) {
      ghost.remove();
      ghost = null;
    }

    setLaneHover(currentLaneEl, false);
    currentLaneEl = null;

    cardEl.classList.remove("card-dragging");

    dragging = false;
    pointerId = null;
  }
}

function createGhost(sourceEl) {
  const r = sourceEl.getBoundingClientRect();
  const g = sourceEl.cloneNode(true);

  g.style.position = "fixed";
  g.style.left = "0px";
  g.style.top = "0px";
  g.style.width = `${r.width}px`;
  g.style.pointerEvents = "none";
  g.style.zIndex = "9999";
  g.style.opacity = "0.92";
  g.style.transform = "translate(-9999px, -9999px) scale(1.02)";
  g.style.boxShadow = "0 18px 40px rgba(0,0,0,0.25)";
  g.style.borderColor = "rgba(0,0,0,0.25)";

  document.body.appendChild(g);
  return g;
}

function moveGhost(ghost, x, y) {
  if (!ghost) return;
  ghost.style.transform = `translate(${x + 10}px, ${y + 10}px) scale(1.02)`;
}

function laneFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  return el.closest?.("[data-lane-id]") || null;
}

function setLaneHover(laneEl, on) {
  if (!laneEl) return;
  if (on) laneEl.classList.add("lane-drop-hover");
  else laneEl.classList.remove("lane-drop-hover");
}
