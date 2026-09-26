// Per-route daily low price history: routes[key] = [[scanDate, priceTWD, carrier, departDate, returnDate], …]
// Full-service lows live in `routes` (used for reference prices); LCC lows are kept apart in `lcc`.
import { median } from '../../web/core/scoring.js';

const MAX_DAYS = 400;

export function emptyHistory() {
  return { version: 1, provider: null, routes: {}, lcc: {} };
}

export function recordLow(history, key, { date, priceTWD, carrier, departDate, returnDate }, bucket = 'routes') {
  const store = (history[bucket] ||= {});
  const list = (store[key] ||= []);
  const existing = list.find((e) => e[0] === date);
  if (existing) {
    if (priceTWD < existing[1]) {
      existing[1] = priceTWD;
      existing[2] = carrier;
      existing[3] = departDate;
      existing[4] = returnDate;
    }
  } else {
    list.push([date, priceTWD, carrier, departDate, returnDate]);
    list.sort((a, b) => a[0].localeCompare(b[0]));
  }
}

export function pruneHistory(history, today) {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - MAX_DAYS * 86400000).toISOString().slice(0, 10);
  for (const bucket of ['routes', 'lcc']) {
    const store = history[bucket] || {};
    for (const k of Object.keys(store)) {
      store[k] = store[k].filter((e) => e[0] >= cutoff);
      if (!store[k].length) delete store[k];
    }
  }
}

export function routeStats(history, key, today, windowDays = 90) {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - windowDays * 86400000).toISOString().slice(0, 10);
  const recent = (history.routes[key] || []).filter((e) => e[0] >= cutoff).map((e) => e[1]);
  return { median: median(recent), count: recent.length, min: recent.length ? Math.min(...recent) : null };
}
