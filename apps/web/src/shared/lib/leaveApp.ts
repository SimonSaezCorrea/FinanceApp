/** Leaving the app for another site (the public landing, spec 031) — in one module so tests can
 * replace it: jsdom can't navigate. `replace` drops the current history entry (a gate sending the
 * visitor away), `assign` keeps it (an action the person took). */
export function replaceLocation(url: string): void {
  window.location.replace(url);
}

export function assignLocation(url: string): void {
  window.location.assign(url);
}
