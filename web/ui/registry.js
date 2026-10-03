// Click / field handlers for the feature screens in web/ui/. app.js keeps the shell (tabs, routing, sign-in,
// the original fare views) and asks this registry first; a screen registers what it owns and nothing else.
const clicks = new Map();
const fields = [];

/** @param {Record<string, (el: Element, ev: Event) => unknown>} table  data-act name → handler */
export function onClick(table) {
  for (const [name, fn] of Object.entries(table)) clicks.set(name, fn);
}

/** Returns true when a screen handled the action (so the shell must not). */
export async function runClick(act, el, ev) {
  const fn = clicks.get(act);
  if (!fn) return false;
  await fn(el, ev);
  return true;
}

/** @param {(el: Element, kind: 'input' | 'change', ev: Event) => boolean} fn  return true when the field is yours */
export function onField(fn) {
  fields.push(fn);
}

export function runField(el, kind, ev) {
  for (const fn of fields) if (fn(el, kind, ev)) return true;
  return false;
}

export const actionNames = () => [...clicks.keys()];
