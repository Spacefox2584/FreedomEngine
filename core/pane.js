export function createPaneController({
  paneEl,
  titleEl,
  bodyEl,
  closeBtn,
  onStateChange,
}) {
  // Internal truth (don’t rely solely on dataset for logic)
  let current = { open: false, title: "Details", render: null };

  // Must match (or slightly exceed) your CSS transition timing.
  // Your CSS uses ~0.22s transform + ~0.18s opacity.
  const CLOSE_DELAY_MS = 240;

  // Used to prevent race conditions if the pane is reopened during close animation
  let closeTimer = null;

  function open({ title = "Details", render } = {}) {
    // If a close is in-flight, cancel it
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    current = {
      open: true,
      title,
      render: typeof render === "function" ? render : null,
    };

    // Mark open immediately (pane can animate in via body class)
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
    // If already closed, no-op
    if (!current.open) return;

    // Set internal state closed immediately
    current = { open: false, title: "Details", render: null };

    // Tell the shell immediately so it can remove body.pane-open and update URL/state
    onStateChange?.({ open: false });

    // DO NOT instantly flip dataset to 0 or clear content:
    // that can short-circuit the slide-out.
    // Instead, wait for the CSS transition to complete.
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    closeTimer = setTimeout(() => {
      // If the pane was reopened during the delay, abort finalization
      if (current.open) return;

      paneEl.dataset.open = "0";
      titleEl.textContent = "Details";
      bodyEl.innerHTML = "";
      closeTimer = null;
    }, CLOSE_DELAY_MS);
  }

  function isOpen() {
    return current.open;
  }

  closeBtn.addEventListener("click", () => close());

  return { open, close, isOpen };
}
