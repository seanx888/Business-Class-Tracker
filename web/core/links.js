// Deep links that open a search pre-filled on popular metasearch sites.
import { AIRLINES } from './airlines.js';
import { routeSegments, includeAirlines, isFiltered } from './search.js';
import { placeList, CITY_GROUPS } from './places.js';

const yymmdd = (iso) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);

const CABIN_WORDS = { business: 'business class', first: 'first class', premium: 'premium economy', economy: 'economy' };

// `gl` (optional, ISO country) opens Google Flights as that country's market — used for foreign-site price checks.
// `nonstop` appends the word Google's query parser understands.
export function googleFlightsUrl({ origin, destination, departDate, returnDate, currency = 'TWD', lang = 'zh-TW', gl, cabin = 'business', nonstop = false }) {
  const q = `Flights from ${origin} to ${destination} on ${departDate}` +
    (returnDate ? ` through ${returnDate}` : ' one way') + ` ${CABIN_WORDS[cabin] || CABIN_WORDS.business}` + (nonstop ? ' nonstop' : '');
  const hl = lang.startsWith('zh') ? 'zh-TW' : lang.startsWith('ko') ? 'ko' : 'en';
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${currency}&hl=${hl}` + (gl ? `&gl=${String(gl).toUpperCase()}` : '');
}

export function skyscannerUrl({ origin, destination, departDate, returnDate, currency = 'TWD', lang = 'zh-TW' }) {
  const host = lang.startsWith('zh') ? 'www.skyscanner.com.tw' : lang.startsWith('ko') ? 'www.skyscanner.co.kr' : 'www.skyscanner.net';
  const path = `${origin.toLowerCase()}/${destination.toLowerCase()}/${yymmdd(departDate)}/` + (returnDate ? `${yymmdd(returnDate)}/` : '');
  return `https://${host}/transport/flights/${path}?adultsv2=1&cabinclass=business&rtn=${returnDate ? 1 : 0}&currency=${currency}`;
}

export function kayakUrl({ origin, destination, departDate, returnDate, lang = 'zh-TW' }) {
  const host = lang.startsWith('ko') ? 'www.kayak.co.kr' : 'www.kayak.com';
  return `https://${host}/flights/${origin}-${destination}/${departDate}` + (returnDate ? `/${returnDate}` : '') + '/business?sort=price_a';
}

export function airlineUrl(code) {
  return AIRLINES[code]?.url || null;
}

export function searchLinks(q) {
  return [
    { key: 'google', label: 'Google Flights', url: googleFlightsUrl(q) },
    { key: 'skyscanner', label: 'Skyscanner', url: skyscannerUrl(q) },
    { key: 'kayak', label: 'KAYAK', url: kayakUrl(q) },
  ];
}

// ───────────────────────── Searches with filters, passengers and several legs ─────────────────────────

const first = (v) => placeList(v)[0] || '';
// A search box may hold several airports. A whole city ("TYO") is understood by name; otherwise the first airport stands in.
const cityWord = (v) => {
  const codes = placeList(v);
  const g = Object.entries(CITY_GROUPS).find(([, list]) => list.length === codes.length && list.every((c) => codes.includes(c)));
  return g ? g[0] : codes[0] || '';
};

// ── Google Flights "tfs": a small protobuf (proto3) message, base64-encoded ──
//   Info { repeated FlightData data = 3; repeated Passenger passengers = 8; Seat seat = 9; Trip trip = 19; }
//   FlightData { string date = 2; optional int32 max_stops = 5; repeated string airlines = 6; Airport from = 13; Airport to = 14; }
//   Airport { string airport = 2; }
// Same layout the open-source "fast-flights" client sends. If Google ever changes it the page simply opens un-filtered.
const SEAT = { economy: 1, premium: 2, business: 3, first: 4 };
const TRIP = { rt: 1, ow: 2, mc: 3 };
const PASSENGER = { adult: 1, child: 2, infantSeat: 3, infantLap: 4 };
const utf8 = new TextEncoder();

function varint(n) {
  const out = [];
  let v = n;
  while (v > 127) {
    out.push((v % 128) | 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
}
const tag = (num, wire) => varint(num * 8 + wire);
const lenField = (num, bytes) => [...tag(num, 2), ...varint(bytes.length), ...bytes];
const strField = (num, s) => lenField(num, [...utf8.encode(s)]);
const intField = (num, n) => [...tag(num, 0), ...varint(n)];

/** Raw bytes of the Google Flights query for a search (exported so tests can decode them). */
export function tfsBytes(search) {
  const legs = routeSegments(search);
  const airlines = includeAirlines(search);
  const out = [];
  for (const leg of legs) {
    const flight = [
      ...strField(2, leg.date),
      ...(search.maxStops != null ? intField(5, search.maxStops) : []),
      ...airlines.flatMap((c) => strField(6, c)),
      ...lenField(13, strField(2, first(leg.o))),
      ...lenField(14, strField(2, first(leg.d))),
    ];
    out.push(...lenField(3, flight));
  }
  const pax = [
    ...Array(search.adults || 1).fill(PASSENGER.adult),
    ...Array(search.children || 0).fill(PASSENGER.child),
    ...Array(search.infantsSeat || 0).fill(PASSENGER.infantSeat),
    ...Array(search.infantsLap || 0).fill(PASSENGER.infantLap),
  ];
  for (const p of pax) out.push(...intField(8, p));
  out.push(...intField(9, SEAT[search.cabin] || SEAT.business));
  out.push(...intField(19, TRIP[search.trip] || TRIP.rt));
  return Uint8Array.from(out);
}

const base64 = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export function googleFlightsTfsUrl(search, { currency = 'TWD', lang = 'zh-TW', gl } = {}) {
  const hl = lang.startsWith('zh') ? 'zh-TW' : lang.startsWith('ko') ? 'ko' : 'en';
  return `https://www.google.com/travel/flights?tfs=${encodeURIComponent(base64(tfsBytes(search)))}&tfu=EgQIABABIgA&hl=${hl}&curr=${currency}` + (gl ? `&gl=${String(gl).toUpperCase()}` : '');
}

/** Google Flights for a whole search: the plain query for simple trips, the full filter set for the rest. */
export function googleSearchUrl(search, opts = {}) {
  const simple = search.trip !== 'mc' && !search.alliance && !(search.airlines || []).length && (search.maxStops == null || search.maxStops === 0) &&
    (search.adults || 1) === 1 && !search.children && !search.infantsSeat && !search.infantsLap;
  if (!simple) return googleFlightsTfsUrl(search, opts);
  return googleFlightsUrl({
    origin: cityWord(search.o), destination: cityWord(search.d), departDate: search.depart, returnDate: search.trip === 'rt' ? search.return : null,
    cabin: search.cabin, nonstop: search.maxStops === 0, ...opts,
  });
}

const KAYAK_CABIN = { business: 'business', first: 'first', premium: 'premium', economy: '' };
const SKY_CABIN = { business: 'business', first: 'first', premium: 'premiumeconomy', economy: 'economy' };

export function kayakSearchUrl(search, { lang = 'zh-TW' } = {}) {
  const host = lang.startsWith('ko') ? 'www.kayak.co.kr' : 'www.kayak.com';
  // KAYAK: a round trip is "A-B/depart/return", a one way "A-B/date", a multi-city trip one "A-B/date" pair per flight.
  const flights = routeSegments(search);
  const legs = search.trip === 'rt' && search.return
    ? `${first(search.o)}-${first(search.d)}/${search.depart}/${search.return}`
    : flights.map((l) => `${first(l.o)}-${first(l.d)}/${l.date}`).join('/');
  const parts = [legs, KAYAK_CABIN[search.cabin] ?? 'business', (search.adults || 1) > 1 ? `${search.adults}adults` : ''].filter(Boolean);
  return `https://${host}/flights/${parts.join('/')}?sort=price_a${search.maxStops === 0 ? '&fs=stops=0' : ''}`;
}

export function skyscannerSearchUrl(search, { currency = 'TWD', lang = 'zh-TW' } = {}) {
  const host = lang.startsWith('zh') ? 'www.skyscanner.com.tw' : lang.startsWith('ko') ? 'www.skyscanner.co.kr' : 'www.skyscanner.net';
  const rt = search.trip === 'rt' && search.return;
  const path = `${first(search.o).toLowerCase()}/${first(search.d).toLowerCase()}/${yymmdd(search.depart)}/` + (rt ? `${yymmdd(search.return)}/` : '');
  return `https://${host}/transport/flights/${path}?adultsv2=${search.adults || 1}&cabinclass=${SKY_CABIN[search.cabin] || 'business'}&rtn=${rt ? 1 : 0}&currency=${currency}` +
    (search.maxStops === 0 ? '&preferdirects=true' : '');
}

/**
 * One-tap links for a search: Google Flights (always), KAYAK, Skyscanner (not for multi-city), and the airline's own site
 * when exactly one airline is chosen. `hint` marks links that cannot carry every filter.
 */
export function searchLinksFor(search, { lang = 'zh-TW', currency = 'TWD', gl } = {}) {
  const links = [{ key: 'google', label: 'Google Flights', url: googleSearchUrl(search, { lang, currency, gl }) }];
  links.push({ key: 'kayak', label: 'KAYAK', url: kayakSearchUrl(search, { lang }) });
  if (search.trip !== 'mc') links.push({ key: 'skyscanner', label: 'Skyscanner', url: skyscannerSearchUrl(search, { lang, currency }) });
  if ((search.airlines || []).length === 1 && airlineUrl(search.airlines[0])) links.push({ key: 'airline', label: AIRLINES[search.airlines[0]].en, url: airlineUrl(search.airlines[0]) });
  return links;
}

/** The same search on other countries' Google Flights markets — free, manual "where is it cheapest to pay" check. */
export function marketLinks(search, markets, { lang = 'zh-TW' } = {}) {
  return markets.map((m) => ({ country: m.country, currency: m.currency, url: googleSearchUrl(search, { lang, currency: m.currency, gl: m.country }) }));
}

export { isFiltered };
