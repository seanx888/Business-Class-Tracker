// Duffel — airline-direct NDC/GDS offers. https://duffel.com/docs/api/v2/offer-requests
// Pros: complete round-trip itineraries with operating carrier + airport country codes,
// so the China filter verifies BOTH directions. Needs a live-mode access token.

const ENDPOINT = 'https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=25000';

/** ISO-8601 duration (e.g. PT13H40M, P1DT2H5M) → minutes. */
export function isoDurationMin(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(s || '');
  if (!m) return null;
  return (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

// Duffel local times carry no offset; both ends of a layover are at the same airport, so a naive diff is exact.
const naive = (t) => Date.parse(`${String(t).slice(0, 19)}Z`);

function normalizeSlice(slice) {
  const segs = slice.segments || [];
  const segments = segs.map((s) => {
    const pax = s.passengers?.[0] || {};
    const mc = s.marketing_carrier?.iata_code || '';
    return {
      from: s.origin?.iata_code,
      fromCountry: s.origin?.iata_country_code,
      fromName: s.origin?.name,
      dep: s.departing_at,
      to: s.destination?.iata_code,
      toCountry: s.destination?.iata_country_code,
      toName: s.destination?.name,
      arr: s.arriving_at,
      carrier: mc,
      carrierName: s.marketing_carrier?.name,
      operatingCarrier: s.operating_carrier?.iata_code || null,
      operatingName: s.operating_carrier?.name || null,
      flightNumber: `${mc} ${s.marketing_carrier_flight_number || ''}`.trim(),
      aircraft: s.aircraft?.name || null,
      cabin: pax.cabin_class_marketing_name || pax.cabin_class || null,
      lieFlat: null,
      durationMin: isoDurationMin(s.duration),
      stops: (s.stops || []).map((st) => ({
        airport: st.airport?.iata_code,
        country: st.airport?.iata_country_code,
        name: st.airport?.name,
      })),
    };
  });
  const layovers = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const a = segs[i];
    const b = segs[i + 1];
    layovers.push({
      airport: a.destination?.iata_code,
      country: a.destination?.iata_country_code,
      name: a.destination?.name,
      durationMin: Math.round((naive(b.departing_at) - naive(a.arriving_at)) / 60000),
      overnight: String(a.arriving_at).slice(0, 10) !== String(b.departing_at).slice(0, 10),
    });
  }
  return { segments, layovers, durationMin: isoDurationMin(slice.duration) };
}

export function normalizeDuffel(json) {
  const offers = (json?.data?.offers || []).map((o) => ({
    price: Number(o.total_amount),
    currency: o.total_currency,
    owner: o.owner?.iata_code || null,
    legs: (o.slices || []).map(normalizeSlice),
    inboundVerified: (o.slices || []).length > 1,
  }));
  // Provider-supplied airport countries help the filter verify unfamiliar airports.
  const countries = {};
  for (const o of offers) {
    for (const l of o.legs) {
      for (const s of l.segments) {
        if (s.from && s.fromCountry) countries[s.from] = s.fromCountry;
        if (s.to && s.toCountry) countries[s.to] = s.toCountry;
      }
    }
  }
  return { offers: offers.filter((o) => Number.isFinite(o.price)), insights: null, countries };
}

const CABIN_CLASS = { economy: 'economy', premium: 'premium_economy', business: 'business', first: 'first' };

export function buildBody(q, maxConnections = 1) {
  const slices = [{ origin: q.origin, destination: q.destination, departure_date: q.departDate }];
  if (q.returnDate) slices.push({ origin: q.destination, destination: q.origin, departure_date: q.returnDate });
  return { data: { slices, passengers: [{ type: 'adult' }], cabin_class: CABIN_CLASS[q.cabin] || 'business', max_connections: maxConnections } };
}

export async function searchDuffel(q, { token, maxConnections = 1, fetchImpl = fetch }) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Duffel-Version': 'v2',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildBody(q, maxConnections)),
    signal: AbortSignal.timeout(90000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(`Duffel: ${msg}`);
  }
  return { ...normalizeDuffel(json), searches: 1 };
}
