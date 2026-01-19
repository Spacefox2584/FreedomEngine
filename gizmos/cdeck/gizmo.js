let unsubscribe = null;

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

  unsubscribe = ctx.store.subscribe("card", render);
  ctx.store.subscribe("lane", render);

  render();

  return {
    unmount() {
      unsubscribe?.();
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

    cards.filter(c => c.lane === lane.id).forEach(card => {
      const el = document.createElement("div");
      el.className = "card";
      el.textContent = card.title;
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

function openCard(card, ctx) {
  ctx.nav.selectCard(card.id, { openPane: true });

  ctx.pane.open({
    title: card.title,
    render: (host) => {
      host.innerHTML = `
        <div>
          <div style="margin-bottom:8px">Notes</div>
          <button class="btn small">Add note</button>
        </div>
      `;
    },
  });
}

function ensureCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}
