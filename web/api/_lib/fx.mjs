// Exchange rates with TWD as base (1 TWD = rates[X] X). Free, key-less source with static fallback.
const DISPLAY = ['TWD', 'USD', 'KRW', 'JPY', 'EUR', 'THB', 'VND', 'SGD', 'PHP', 'MYR', 'GBP', 'AUD'];

// Approximate fallback (2026-09). Only used when the live source is unreachable.
export const FALLBACK_FX = {
  base: 'TWD',
  date: '2026-09-26',
  source: 'fallback',
  rates: { TWD: 1, USD: 0.0315, KRW: 43.6, JPY: 4.6, EUR: 0.0272, THB: 1.02, VND: 830, SGD: 0.0405, PHP: 1.8, MYR: 0.133, GBP: 0.0235, AUD: 0.0448 },
};

export async function fetchFx(fetchImpl = fetch) {
  try {
    const res = await fetchImpl('https://open.er-api.com/v6/latest/TWD', { signal: AbortSignal.timeout(15000) });
    const j = await res.json();
    if (j.result !== 'success' || !j.rates) throw new Error('bad fx payload');
    const rates = {};
    for (const c of Object.keys(j.rates)) rates[c] = j.rates[c];
    return { base: 'TWD', date: new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10), source: 'open.er-api.com', rates, display: DISPLAY };
  } catch {
    return { ...FALLBACK_FX, display: DISPLAY };
  }
}

export function toTWD(amount, currency, fx) {
  if (!Number.isFinite(amount)) return null;
  if (!currency || currency === 'TWD') return Math.round(amount);
  const r = fx.rates[currency] ?? FALLBACK_FX.rates[currency];
  if (!r) return null;
  return Math.round(amount / r);
}
