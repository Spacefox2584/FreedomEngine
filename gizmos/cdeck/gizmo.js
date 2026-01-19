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
  btn.onclick = () => createCard(ctx);

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

function createCard(ctx) {
  const id = crypto.randomUUID();
  ctx.store.mutate({
    type: "card",
    op: "put",
    id,
    data: {
      title: "New customer interaction",
      lane: "0",
      notes: [],
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

  // Keep pane content aligned if this card is open
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
      meta.textContent = `Lane: ${laneName}`;

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

        // Re-open to refresh pane content
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
