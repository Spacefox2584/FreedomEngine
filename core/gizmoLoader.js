export async function loadManifest(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Manifest fetch failed: ${path} (${res.status})`);
  const json = await res.json();
  if (!json.id || !json.entry) throw new Error(`Invalid manifest: ${path}`);
  return { ...json, _manifestPath: path };
}

export async function loadGizmoModule(entryPath) {
  // entryPath should be an absolute-ish path from site root (e.g. /gizmos/cdeck/gizmo.js)
  return import(entryPath);
}
