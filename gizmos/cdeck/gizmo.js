let unsubCards = null;
let unsubLanes = null;

const PRIORITIES = [
  { value: "urgent", label: "Urgent" },
  { value: "today", label: "Today" },
  { value: "normal", label: "Normal" },
  { value: "backlog", label: "Backlog" },
];

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
  btn.onclick = () => openCreateCardPane(ctx);

  h.append(title, btn);
  return h;
}

function renderBody(ctx) {
  const body = document.createElement("div");
  body.className = "cdeck-body";

  const lanesEl = document.createElement("div");
  lanesEl.className = "lanes";

  const lanes = getSortedLanes(ctx);
  const allCards = ctx.store.list("card");

  lanes.forEach((lane) => {
    const laneEl = document.createElement("div");
    laneEl.className = "lane";

    laneEl.dataset.laneId = lane.id;

    const head = document.createElement("div");
    head.className = "lane-head";
    head.textContent = lane.name;

    const cardsEl = document.createElement("div");
    cardsEl.className = "cards";

    const cards = allCards
      .filter((c) => c.lane === lane.id)
      .map((c) => normalizeCard(c, ctx))
      .sort((a, b) => {
        const aa = Number(a.createdAt || 0);
        const bb = Number(b.createdAt || 0);
        if (aa !== bb) return aa - bb; // oldest first, newest at bottom
        return String(a.title || "").localeCompare(String(b.title || ""));
      });

    cards.forEach((card) => {
      const el = document.createElement("div");
      el.className = `card ${priorityClass(card.priority)}`;

      // Drag/drop enabled (click/hold + drag)
      makeCardDraggable(el, card, ctx);

      const title = document.createElement("div");
      title.className = "card-title";
      title.textContent = card.title || "Untitled";

      const meta = document.createElement("div");
      meta.className = "card-meta";
      const noteCount = Array.isArray(card.notes) ? card.notes.length : 0;
      const pr = card.priority ? ` • ${labelPriority(card.priority)}` : "";
      meta.textContent = `Notes: ${noteCount}${pr}`;

      const actions = document.createElement("div");
      actions.className = "card-actions";

      const del = document.createElement("button");
      del.className = "mini danger";
      del.textContent = "×";
      del.title = "Delete card";
      del.onclick = (e) => {
        e.stopPropagation();
        openDeleteConfirmPane(card, ctx);
      };

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

      actions.append(del, left, right);

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

function getSortedLanes(ctx) {
  // Stable ordering by numeric lane id (0..N). This fixes arrows.
  return ctx.store
    .list("lane")
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id));
}

function normalizeCard(card, ctx) {
  let changed = false;
  const out = { ...card };

  // createdAt drives order (new cards should be at bottom)
  if (out.createdAt == null) {
    // best guess: first note timestamp, else now
    const notes = Array.isArray(out.notes) ? out.notes : [];
    const guess = notes.length ? Number(notes[0].ts || Date.now()) : Date.now();
    out.createdAt = guess;
    changed = true;
  }

  // priority default
  if (!out.priority) {
    out.priority = "normal";
    changed = true;
  }

  // notes should have stable ids for inline edit
  const norm = normalizeNotes(out.notes);
  if (norm.changed) {
    out.notes = norm.notes;
    changed = true;
  }

  if (changed) {
    ctx.store.mutate({
      type: "card",
      op: "put",
      id: out.id,
      data: out,
    });
  }

  return out;
}

function normalizeNotes(notes) {
  const arr = Array.isArray(notes) ? notes.slice() : [];
  let changed = false;

  const out = arr.map((n) => {
    const nn = { ...n };
    if (!nn.id) {
      nn.id = (crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2));
      changed = true;
    }
    if (nn.ts == null) {
      nn.ts = Date.now();
      changed = true;
    }
    if (nn.text == null) {
      nn.text = "";
      changed = true;
    }
    return nn;
  });

  return { notes: out, changed };
}

function priorityClass(p) {
  const v = String(p || "normal").toLowerCase();
  if (v === "urgent") return "priority-urgent";
  if (v === "today") return "priority-today";
  if (v === "backlog") return "priority-backlog";
  return "priority-normal";
}

function labelPriority(p) {
  const v = String(p || "normal").toLowerCase();
  if (v === "urgent") return "Urgent";
  if (v === "today") return "Today";
  if (v === "backlog") return "Backlog";
  return "Normal";
}

function openCreateCardPane(ctx) {
  ctx.pane.open({
    title: "Create card",
    render: (host) => {
      host.innerHTML = "";

      const ui = buildCardFormUI({
        ctx,
        mode: "create",
        initial: {
          title: "",
          lane: "0",
          priority: "normal",
          channel: "",
          summary: "",
          nextAction: "",
        },
        onSave: (values) => {
          const title = (values.title || "").trim();
          if (!title) return { ok: false, focus: "title" };

          const id = crypto.randomUUID();
          const now = Date.now();

          const notes = [];
          if (values.summary) notes.push({ id: crypto.randomUUID(), ts: now, text: `Summary: ${values.summary}` });
          if (values.nextAction) notes.push({ id: crypto.randomUUID(), ts: now, text: `Next: ${values.nextAction}` });

          ctx.store.mutate({
            type: "card",
            op: "put",
            id,
            data: {
              id,
              title,
              lane: values.lane || "0",
              priority: values.priority || "normal",
              createdAt: now,
              channel: values.channel || null,
              summary: values.summary || null,
              nextAction: values.nextAction || null,
              notes,
            },
          });

          const created = ctx.store.get("card", id);
          if (created) openCard(created, ctx);

          return { ok: true };
        },
        onCancel: () => ctx.nav.closePane?.() || ctx.pane.close(),
      });

      host.appendChild(ui.el);
      ui.focusTitle();
    },
  });
}

function moveCard(card, ctx, direction) {
  const lanes = getSortedLanes(ctx);
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

function openDeleteConfirmPane(card, ctx) {
  const latest = ctx.store.get("card", card.id) || card;

  ctx.pane.open({
    title: "Delete card",
    render: (host) => {
      host.innerHTML = "";

      const wrap = document.createElement("div");
      wrap.style.display = "grid";
      wrap.style.gap = "10px";

      const msg = document.createElement("div");
      msg.textContent = `Delete "${latest.title || "Untitled"}"?`;
      msg.style.fontWeight = "700";

      const hint = document.createElement("div");
      hint.style.color = "var(--muted)";
      hint.style.fontSize = "12px";
      hint.textContent = "This removes the card locally. (Undo/trash can comes later.)";

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "8px";

      const del = document.createElement("button");
      del.className = "btn small";
      del.textContent = "Delete";
      del.onclick = () => {
        ctx.store.mutate({ type: "card", op: "delete", id: latest.id });

        const state = ctx.state.get();
        if (state.card === latest.id) {
          ctx.nav.closePane?.() || ctx.pane.close();
        }
      };

      const cancel = document.createElement("button");
      cancel.className = "btn ghost small";
      cancel.textContent = "Cancel";
      cancel.onclick = () => openCard(latest, ctx);

      row.append(del, cancel);
      wrap.append(msg, hint, row);
      host.appendChild(wrap);
    },
  });
}

function openCard(card, ctx) {
  // ensure card has createdAt/priority/note ids
  const normalized = normalizeCard(ctx.store.get("card", card.id) || card, ctx);

  ctx.nav.selectCard(normalized.id, { openPane: true });

  const fresh = ctx.store.get("card", normalized.id) || normalized;
  const laneName = laneLabel(fresh.lane, ctx);
  const notes = Array.isArray(fresh.notes) ? fresh.notes : [];

  ctx.pane.open({
    title: fresh.title,
    render: (host) => {
      host.innerHTML = "";

      const top = document.createElement("div");
      top.style.display = "grid";
      top.style.gap = "10px";

      // Header row: meta + edit/delete
      const headRow = document.createElement("div");
      headRow.style.display = "flex";
      headRow.style.alignItems = "center";
      headRow.style.justifyContent = "space-between";
      headRow.style.gap = "10px";

      const meta = document.createElement("div");
      meta.style.color = "var(--muted)";
      meta.style.fontSize = "12px";
      const channel = fresh.channel ? ` • Channel: ${fresh.channel}` : "";
      const pr = fresh.priority ? ` • Priority: ${labelPriority(fresh.priority)}` : "";
      meta.textContent = `Lane: ${laneName}${channel}${pr}`;

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      const editBtn = document.createElement("button");
      editBtn.className = "btn ghost small";
      editBtn.textContent = "Edit";
      editBtn.onclick = () => openEditCardPane(fresh, ctx);

      const delBtn = document.createElement("button");
      delBtn.className = "btn ghost small";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => openDeleteConfirmPane(fresh, ctx);

      actions.append(editBtn, delBtn);
      headRow.append(meta, actions);

      // Notes list with inline edit
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
          noteList.appendChild(renderNoteRow(n, fresh, ctx));
        });
      }

      // Add note
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

      const addRow = document.createElement("div");
      addRow.style.display = "flex";
      addRow.style.gap = "8px";
      addRow.style.alignItems = "center";

      const add = document.createElement("button");
      add.className = "btn small";
      add.textContent = "Add note";

      add.onclick = () => {
        const text = (input.value || "").trim();
        if (!text) return;

        const latest = ctx.store.get("card", fresh.id) || fresh;
        const currentNotes = Array.isArray(latest?.notes) ? latest.notes : [];

        const updated = {
          ...latest,
          notes: [...currentNotes, { id: crypto.randomUUID(), ts: Date.now(), text }],
        };

        ctx.store.mutate({
          type: "card",
          op: "put",
          id: fresh.id,
          data: updated,
        });

        openCard(updated, ctx);
      };

      addRow.append(add);
      top.append(headRow, noteList, input, addRow);
      host.appendChild(top);
    },
  });
}

function renderNoteRow(note, card, ctx) {
  const row = document.createElement("div");
  row.className = "note-row";

  const top = document.createElement("div");
  top.className = "note-top";

  const ts = document.createElement("div");
  ts.className = "note-ts";
  ts.textContent = new Date(note.ts).toLocaleString();

  const actions = document.createElement("div");
  actions.className = "note-actions";

  const edit = document.createElement("button");
  edit.className = "note-mini";
  edit.textContent = "Edit";

  edit.onclick = () => {
    // swap into inline editor
    row.innerHTML = "";

    const editor = document.createElement("textarea");
    editor.style.width = "100%";
    editor.style.minHeight = "70px";
    editor.style.borderRadius = "12px";
    editor.style.border = "1px solid var(--border)";
    editor.style.background = "rgba(255,255,255,0.03)";
    editor.style.color = "var(--text)";
    editor.style.padding = "10px";
    editor.style.resize = "vertical";
    editor.value = note.text || "";

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.marginTop = "8px";

    const save = document.createElement("button");
    save.className = "btn small";
    save.textContent = "Save";
    save.onclick = () => {
      const text = (editor.value || "").trim();

      const latest = ctx.store.get("card", card.id) || card;
      const notes = Array.isArray(latest.notes) ? latest.notes : [];

      const updatedNotes = notes.map((n) =>
        n.id === note.id ? { ...n, text } : n
      );

      ctx.store.mutate({
        type: "card",
        op: "put",
        id: card.id,
        data: { ...latest, notes: updatedNotes },
      });

      const updatedCard = ctx.store.get("card", card.id) || latest;
      openCard(updatedCard, ctx);
    };

    const cancel = document.createElement("button");
    cancel.className = "btn ghost small";
    cancel.textContent = "Cancel";
    cancel.onclick = () => {
      const latest = ctx.store.get("card", card.id) || card;
      openCard(latest, ctx);
    };

    btnRow.append(save, cancel);
    row.append(editor, btnRow);
    editor.focus();
  };

  actions.appendChild(edit);
  top.append(ts, actions);

  const body = document.createElement("div");
  body.textContent = note.text;

  row.append(top, body);
  return row;
}

function openEditCardPane(card, ctx) {
  const latest = normalizeCard(ctx.store.get("card", card.id) || card, ctx);

  ctx.pane.open({
    title: "Edit card",
    render: (host) => {
      host.innerHTML = "";

      const ui = buildCardFormUI({
        ctx,
        mode: "edit",
        initial: {
          title: latest.title || "",
          lane: latest.lane || "0",
          priority: latest.priority || "normal",
          channel: latest.channel || "",
          summary: latest.summary || "",
          nextAction: latest.nextAction || "",
        },
        onSave: (values) => {
          const title = (values.title || "").trim();
          if (!title) return { ok: false, focus: "title" };

          const fresh = ctx.store.get("card", latest.id) || latest;

          const updated = {
            ...fresh,
            title,
            lane: values.lane || fresh.lane || "0",
            priority: values.priority || fresh.priority || "normal",
            channel: values.channel || null,
            summary: values.summary || null,
            nextAction: values.nextAction || null,
          };

          ctx.store.mutate({
            type: "card",
            op: "put",
            id: latest.id,
            data: updated,
          });

          openCard(updated, ctx);
          return { ok: true };
        },
        onCancel: () => openCard(latest, ctx),
      });

      host.appendChild(ui.el);
      ui.focusTitle();
    },
  });
}

function buildCardFormUI({ ctx, mode, initial, onSave, onCancel }) {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "10px";

  const labelStyle = "font-size:12px; color: var(--muted); margin-bottom:4px;";
  const inputStyle =
    "width:100%; border-radius:12px; border:1px solid var(--border); background:rgba(255,255,255,0.03); color:var(--text); padding:10px;";

  // Title
  const titleWrap = document.createElement("div");
  const titleLabel = document.createElement("div");
  titleLabel.style = labelStyle;
  titleLabel.textContent = "Title";
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.placeholder = "e.g. John Smith — brake pads enquiry";
  titleInput.style = inputStyle;
  titleInput.value = initial.title || "";
  titleInput.autofocus = true;
  titleWrap.append(titleLabel, titleInput);

  // Lane
  const laneWrap = document.createElement("div");
  const laneLabelEl = document.createElement("div");
  laneLabelEl.style = labelStyle;
  laneLabelEl.textContent = "Lane";
  const laneSelect = document.createElement("select");
  laneSelect.style = inputStyle;

  const lanes = getSortedLanes(ctx);
  lanes.forEach((l) => {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name;
    laneSelect.appendChild(opt);
  });
  laneSelect.value = initial.lane || "0";
  laneWrap.append(laneLabelEl, laneSelect);

  // Priority
  const prWrap = document.createElement("div");
  const prLabel = document.createElement("div");
  prLabel.style = labelStyle;
  prLabel.textContent = "Priority";
  const prSelect = document.createElement("select");
  prSelect.style = inputStyle;
  PRIORITIES.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.value;
    opt.textContent = p.label;
    prSelect.appendChild(opt);
  });
  prSelect.value = initial.priority || "normal";
  prWrap.append(prLabel, prSelect);

  // Channel
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
  channelSelect.value = initial.channel || "";
  channelWrap.append(channelLabel, channelSelect);

  // Summary
  const summaryWrap = document.createElement("div");
  const summaryLabel = document.createElement("div");
  summaryLabel.style = labelStyle;
  summaryLabel.textContent = "Summary (optional)";
  const summaryInput = document.createElement("textarea");
  summaryInput.placeholder = "One-paragraph summary…";
  summaryInput.style = inputStyle + "min-height:70px; resize:vertical;";
  summaryInput.value = initial.summary || "";
  summaryWrap.append(summaryLabel, summaryInput);

  // Next action
  const nextWrap = document.createElement("div");
  const nextLabel = document.createElement("div");
  nextLabel.style = labelStyle;
  nextLabel.textContent = "Next action (optional)";
  const nextInput = document.createElement("input");
  nextInput.type = "text";
  nextInput.placeholder = "e.g. Call back with ETA / send quote";
  nextInput.style = inputStyle;
  nextInput.value = initial.nextAction || "";
  nextWrap.append(nextLabel, nextInput);

  // Buttons
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.marginTop = "6px";

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn small";
  saveBtn.textContent = mode === "edit" ? "Save" : "Create";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn ghost small";
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = () => onCancel?.();

  function gatherValues() {
    return {
      title: (titleInput.value || "").trim(),
      lane: (laneSelect.value || "").trim(),
      priority: (prSelect.value || "").trim(),
      channel: (channelSelect.value || "").trim(),
      summary: (summaryInput.value || "").trim(),
      nextAction: (nextInput.value || "").trim(),
    };
  }

  function doSave() {
    const result = onSave?.(gatherValues());
    if (result && result.ok === false) {
      if (result.focus === "title") titleInput.focus();
    }
  }

  saveBtn.onclick = doSave;

  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSave();
  });
  nextInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSave();
  });

  row.append(saveBtn, cancelBtn);

  wrap.append(titleWrap, laneWrap, prWrap, channelWrap, summaryWrap, nextWrap, row);

  return {
    el: wrap,
    focusTitle: () => titleInput.focus(),
  };
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
    e.preventDefault(); // prevents fast-drag text selection

    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;

    try { cardEl.setPointerCapture(pointerId); } catch (_) {}

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

    if (!dragging && (dx > MOVE_PX || dy > MOVE_PX)) clearHold();
    if (!dragging) return;

    e.preventDefault();
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
      }
    }

    cleanupDrag();
  });

  cardEl.addEventListener("pointercancel", cleanupDrag);

  function clearHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  }

  function cleanupDrag() {
    clearHold();
    if (ghost) { ghost.remove(); ghost = null; }
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
