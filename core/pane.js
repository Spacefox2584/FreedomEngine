export function createPaneController({
  paneEl,
  titleEl,
  bodyEl,
  closeBtn,
  onStateChange,
}) {
  let open = false;

  // Must be >= CSS transition time
  const CLOSE_DELAY_MS = 240;
  let closeTimer = null;

  function openPane({ title = "Details", render } = {}) {
    // Cancel any pending close cleanup
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    open = true;

    // Informational only (optional)
    paneEl.dataset.open = "1";

    titleEl.textContent = title;
    bodyEl.innerHTML = "";

    if (typeof render === "function") {
      render(bodyEl);
    } else {
      bodyEl.innerHTML = `<div style="color:var(--muted)">No content.</div>`;
    }

    onStateChange?.({ open: true });
  }

  function closePane() {
    if (!open) return;

    open = false;

    // Tell shell immediately so body.pane-open is removed
    onStateChange?.({ open: false });

    // DO NOT touch dataset.open here.
    // Let CSS animate the slide-out.

    closeTimer = setTimeout(() => {
      if (open) return; // reopened mid-animation

      // Clear content AFTER animation
      titleEl.textContent = "Details";
      bodyEl.innerHTML = "";
    }, CLOSE_DELAY_MS);
  }

  function isOpen() {
    return open;
  }

  closeBtn?.addEventListener("click", closePane);

  return {
    open: openPane,
    close: closePane,
    isOpen,
  };
}
