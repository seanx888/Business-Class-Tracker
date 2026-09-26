// Builds today's search plan: fixed-date "watch trips" first, then a deterministic
// priority-weighted rotation over all routes so a small daily API budget still
// covers every route every few days, each time probing a different travel date.

const DAY = 86400000;
const WEIGHT = { 1: 3, 2: 2, 3: 1 };

export const dayIndex = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export const routeKey = (o, d) => `${o}-${d}`;

/** Slots: priority-1 routes appear 3×, priority-2 2×, priority-3 1× — interleaved. */
export function rotationSlots(routes) {
  const slots = [];
  for (let round = 0; round < 3; round++) {
    routes.forEach((r, idx) => {
      if ((WEIGHT[r.p] || 1) > round) slots.push(idx);
    });
  }
  return slots;
}

/** Departure date for a route on a given day. Short-haul looks 2–20 weeks out, long-haul 1–9 months. */
export function pickDates(route, routeIdx, today, visit = 0) {
  const stay = route.stay || 7;
  const longHaul = stay >= 8;
  const min = longHaul ? 30 : 14;
  const span = longHaul ? 240 : 136;
  const di = dayIndex(today);
  const offset = min + ((di * 17 + routeIdx * 31 + visit * 53) % span);
  const departDate = addDays(today, offset);
  return { departDate, returnDate: route.oneWay ? null : addDays(departDate, stay) };
}

export function buildPlan(config, { today, maxSearches }) {
  const plan = [];
  const seen = new Set();

  for (const t of config.watchTrips || []) {
    if (plan.length >= maxSearches) break;
    if (!t.depart || t.depart <= today) continue;
    plan.push({
      kind: 'watch',
      key: routeKey(t.o, t.d),
      origin: t.o,
      destination: t.d,
      departDate: t.depart,
      returnDate: t.return || null,
      label: t.label || null,
      route: { o: t.o, d: t.d, bm: t.bm, p: 1 },
    });
  }

  const routes = config.routes || [];
  const slots = rotationSlots(routes);
  if (!slots.length) return plan;
  const di = dayIndex(today);
  const budget = Math.min(maxSearches - plan.length, routes.length);
  const start = (di * Math.max(1, budget)) % slots.length;

  for (let i = 0; i < slots.length && plan.length < maxSearches; i++) {
    const idx = slots[(start + i) % slots.length];
    const r = routes[idx];
    const key = routeKey(r.o, r.d);
    if (seen.has(key)) continue;
    seen.add(key);
    const visit = Math.floor((start + i) / slots.length) + di;
    plan.push({ kind: 'rotation', key, origin: r.o, destination: r.d, ...pickDates(r, idx, today, visit), label: null, route: r });
  }
  return plan;
}
