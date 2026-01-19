let cleanup = null;

export async function mount(host, ctx) {
  // Load CSS (dead simple, no build step)
  const cssHref = "/gizmos/cdeck/style.css";
  const link = ensureCss(cssHref);

  const root = document.createElement("div");
  root.className = "cdeck";

  const header = document.createElement("div");
  header.className = "cdeck-head";

  const left = document.createElement("div");
  const title = document.createElement("div");
  title.className = "cdeck-title";
  title.textContent = "C-Deck v0.1 (surface stub)";
  const sub = document.createElement("div");
  sub.className = "cdeck-sub";
  sub.textContent = "Lanes + cards + pane. No persistence yet.";
  left.appendChild(title);
  left.appendChild(sub);

  const right = document.createElement("div");
  const btn = document.createElement("button");
  btn.className = "btn small";
  btn.textContent = "New card (stub)";
  btn.addEventListener("click", () => {
    ctx.pane.open({
      title: "Create card (not shipped in R1)",
      render: (paneHost) => {
        paneHost.innerHTML = `
          <div style="color:var(--muted); line-height:1.45">
            R1 does not create real cards yet.<br/>
            We’re proving shell + space switching + pane.
          </div>
        `;
      },
    });
  });
  right.appendChild(btn);

  header.appendChild(left);
  header.appendChild(right);

  const body = document.createElement("div");
  body.className = "cdeck-body";

  const lanesEl = document.createElement("div");
  lanesEl.className = "lanes";

  const lanes = [
    { name: "New / Untriaged", cards: mockCards("NEW", 3) },
    { name: "In Progress", cards: mockCards("WIP", 2) },
    { name: "Awaiting External", cards: mockCards("WAIT", 2) },
    { name: "Resolved", cards: mockCards("DONE", 1) },
  ];

  lanes.forEach((lane) => lanesEl.appendChild(renderLane(lane, ctx)));

  body.appendChild(lanesEl);

  root.appendChild(header);
  root.appendChild(body);

  host.appendChild(root);

  // Restore selection if URL had a card
  const cardFromUrl = ctx.selection?.card;
  if (cardFromUrl) {
    openCard(cardFromUrl, ctx);
  }

  cleanup = () => {
    try {
      root.remove();
    } catch (_) {}
    // Keep CSS link (no harm). If you want strict cleanup later, we can ref count.
    cleanup = null;
  };

  return {
    unmount() {
      cleanup?.();
    },
  };

  function renderLane(lane, ctx) {
    const laneEl = document.createElement("div");
    laneEl.className = "lane";

    const head = document.createElement("div");
    head.className = "lane-head";

    const name = document.createElement("div");
    name.className = "lane-name";
    name.textContent = lane.name;

    const count = document.createElement("div");
    count.className = "lane-count";
    count.textContent = `${lane.cards.length}`;

    head.appendChild(name);
    head.appendChild(count);

    const cardsEl = document.createElement("div");
    cardsEl.className = "cards";

    lane.cards.forEach((c) => {
      const cardEl = document.createElement("div");
      cardEl.className = "card";
      cardEl.tabIndex = 0;

      const ct = document.createElement("div");
      ct.className = "card-title";
      ct.textContent = c.title;

      const meta = document.createElement("div");
      meta.className = "card-meta";
      meta.textContent = c.meta;

      cardEl.appendChild(ct);
      cardEl.appendChild(meta);

      cardEl.addEventListener("click", () => openCard(c.id, ctx));
      cardEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") openCard(c.id, ctx);
      });

      cardsEl.appendChild(cardEl);
    });

    laneEl.appendChild(head);
    laneEl.appendChild(cardsEl);
    return laneEl;
  }
}

function openCard(cardId, ctx) {
  ctx.nav.selectCard(cardId, { openPane: true });

  ctx.pane.open({
    title: `Card ${cardId}`,
    render: (host) => {
      host.innerHTML = `
        <div style="display:grid; gap:10px">
          <div style="font-weight:700">Customer interaction (stub)</div>
          <div style="color:var(--muted); line-height:1.45">
            This is the R1 proof: selecting a card opens the right-side pane,
            URL state updates, and refresh restores.
          </div>

          <div style="border:1px solid var(--border); border-radius:12px; padding:10px; background:rgba(255,255,255,0.03)">
            <div style="color:var(--muted); font-size:12px; margin-bottom:6px">Next</div>
            <div>R2 adds local-first objects + journal.</div>
          </div>
        </div>
      `;
    },
  });
}

function mockCards(prefix, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const id = `${prefix}-${String(i).padStart(3, "0")}`;
    out.push({
      id,
      title: `Customer: ${id}`,
      meta: `Channel: call • Summary stub • Next: follow-up`,
    });
  }
  return out;
}

function ensureCss(href) {
  const existing = document.querySelector(`link[data-fe-css="${href}"]`);
  if (existing) return existing;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.feCss = href;
  document.head.appendChild(link);
  return link;
}
