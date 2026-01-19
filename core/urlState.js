export function parseUrlState(locationLike = window.location) {
  const url = new URL(locationLike.href);
  const space = (url.searchParams.get("space") || "").trim() || "cdeck";
  const card = (url.searchParams.get("card") || "").trim() || null;
  const pane = url.searchParams.get("pane") === "1";
  return { space, card, pane };
}

export function writeUrlState(next, { replace = false } = {}) {
  const url = new URL(window.location.href);

  if (next.space) url.searchParams.set("space", next.space);
  else url.searchParams.delete("space");

  if (next.card) url.searchParams.set("card", next.card);
  else url.searchParams.delete("card");

  if (next.pane) url.searchParams.set("pane", "1");
  else url.searchParams.delete("pane");

  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", url.toString());
}

export function formatRouteHint(state) {
  const parts = [];
  parts.push(`space=${state.space}`);
  if (state.card) parts.push(`card=${state.card}`);
  if (state.pane) parts.push(`pane=1`);
  return parts.join(" • ");
}
