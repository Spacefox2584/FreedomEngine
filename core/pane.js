export function createPaneController({ paneEl, titleEl, bodyEl, closeBtn, onStateChange }) {
  let current = { open: false, title: "Details", render: null };

  function open({ title = "Details", render } = {}) {
    current = { open: true, title, render: typeof render === "function" ? render : null };
    paneEl.dataset.open = "1";
    titleEl.textContent = title;
    bodyEl.innerHTML = "";

    if (current.render) {
      current.render(bodyEl);
    } else {
      bodyEl.innerHTML = `<div style="color:var(--muted)">No content.</div>`;
    }

    onStateChange?.({ open: true });
  }

  function close() {
    current = { open: false, title: "Details", render: null };
    paneEl.dataset.open = "0";
    titleEl.textContent = "Details";
    bodyEl.innerHTML = "";
    onStateChange?.({ open: false });
  }

  function isOpen() {
    return paneEl.dataset.open === "1";
  }

  closeBtn.addEventListener("click", () => close());

  return { open, close, isOpen };
}
