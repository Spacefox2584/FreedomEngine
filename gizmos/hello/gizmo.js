let cleanup = null;

export async function mount(host, ctx) {
  ensureCss("/gizmos/hello/style.css");

  const root = document.createElement("div");
  root.className = "hello";

  const card = document.createElement("div");
  card.className = "hello-card";

  const title = document.createElement("div");
  title.className = "hello-title";
  title.textContent = "Hello gizmo";

  const sub = document.createElement("div");
  sub.className = "hello-sub";
  sub.textContent =
    "This exists to prove mount/unmount, space switching, and pane control.";

  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "Open pane";
  btn.addEventListener("click", () => {
    ctx.pane.open({
      title: "Hello pane",
      render: (paneHost) => {
        paneHost.innerHTML = `
          <div style="display:grid; gap:10px">
            <div style="font-weight:700">Core-owned pane</div>
            <div style="color:var(--muted); line-height:1.45">
              No modals. Pane lives in shell. Gizmos request content.
            </div>
          </div>
        `;
      },
    });
  });

  card.appendChild(title);
  card.appendChild(sub);
  card.appendChild(btn);
  root.appendChild(card);
  host.appendChild(root);

  cleanup = () => {
    try { root.remove(); } catch (_) {}
    cleanup = null;
  };

  return {
    unmount() {
      cleanup?.();
    },
  };
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
