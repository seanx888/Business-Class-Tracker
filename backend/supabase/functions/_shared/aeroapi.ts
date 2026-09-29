// FlightAware AeroAPI v3 → ÆtherSky flight contract (see apps/mobile/lib/domain/flight.dart).
// Pure functions only, so they run in Supabase Edge Functions (Deno) and in Node tests alike.
// Docs: https://www.flightaware.com/aeroapi/portal/documentation

export type FlightTime = { scheduled?: string; estimated?: string; actual?: string };

export type AetherFlight = {
  id: string;
  carrier: string;
  number: string;
  origin: { iata: string; name?: string; city?: string; tz?: string; terminal?: string; gate?: string };
  destination: { iata: string; name?: string; city?: string; tz?: string; terminal?: string; gate?: string; baggage?: string };
  out: FlightTime;
  off: FlightTime;
  on: FlightTime;
  in: FlightTime;
  cancelled: boolean;
  diverted: boolean;
  aircraft: { type?: string; registration?: string };
  distanceKm?: number;
  inbound?: { id: string };
  status?: string;
  source: 'aeroapi';
};

type AeroAirport = { code_iata?: string | null; code?: string | null; name?: string | null; city?: string | null; timezone?: string | null } | null;
export type AeroFlight = Record<string, unknown> & {
  fa_flight_id: string;
  ident?: string;
  ident_iata?: string | null;
  operator_iata?: string | null;
  flight_number?: string | null;
  origin?: AeroAirport;
  destination?: AeroAirport;
};

const MILES_TO_KM = 1.609344;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length ? v : undefined);

function times(f: AeroFlight, what: 'out' | 'off' | 'on' | 'in'): FlightTime {
  const t: FlightTime = {};
  const s = str(f[`scheduled_${what}`]);
  const e = str(f[`estimated_${what}`]);
  const a = str(f[`actual_${what}`]);
  if (s) t.scheduled = s;
  if (e) t.estimated = e;
  if (a) t.actual = a;
  return t;
}

/** "BR198" / "EVA198" style idents → carrier + number (IATA preferred). */
export function splitIdent(f: AeroFlight): { carrier: string; number: string } {
  const iata = str(f.ident_iata) || '';
  const m = /^([A-Z0-9]{2})(\d{1,4})[A-Z]?$/.exec(iata);
  if (m) return { carrier: m[1], number: m[2] };
  return { carrier: str(f.operator_iata) || '', number: str(f.flight_number) || '' };
}

export function normalizeAeroFlight(f: AeroFlight): AetherFlight {
  const { carrier, number } = splitIdent(f);
  const o = f.origin || {};
  const d = f.destination || {};
  const miles = typeof f.route_distance === 'number' ? f.route_distance : undefined;
  const flight: AetherFlight = {
    id: f.fa_flight_id,
    carrier,
    number,
    origin: { iata: str(o.code_iata) || str(o.code) || '???', name: str(o.name), city: str(o.city), tz: str(o.timezone), terminal: str(f.terminal_origin), gate: str(f.gate_origin) },
    destination: {
      iata: str(d.code_iata) || str(d.code) || '???',
      name: str(d.name),
      city: str(d.city),
      tz: str(d.timezone),
      terminal: str(f.terminal_destination),
      gate: str(f.gate_destination),
      baggage: str(f.baggage_claim),
    },
    out: times(f, 'out'),
    off: times(f, 'off'),
    on: times(f, 'on'),
    in: times(f, 'in'),
    cancelled: f.cancelled === true,
    diverted: f.diverted === true,
    aircraft: { type: str(f.aircraft_type), registration: str(f.registration) },
    status: str(f.status),
    source: 'aeroapi',
  };
  if (miles) flight.distanceKm = Math.round(miles * MILES_TO_KM);
  const inbound = str(f.inbound_fa_flight_id);
  if (inbound) flight.inbound = { id: inbound };
  return flight;
}

/** Local calendar date (yyyy-mm-dd) of an instant in an IANA zone. */
export function localDate(iso: string, timeZone = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * AeroAPI returns every instance of a flight number in the search window; pick the one whose
 * scheduled gate departure falls on `date` at the ORIGIN (how travellers think about dates).
 */
export function pickFlightForDate(flights: AeroFlight[], date: string): AeroFlight | null {
  const onDate = flights.filter((f) => {
    const s = str(f.scheduled_out) || str(f.scheduled_off);
    return s && localDate(s, str(f.origin?.timezone) || 'UTC') === date;
  });
  // Prefer the operating flight over codeshare duplicates and cancelled placeholders.
  onDate.sort((a, b) => Number(a.cancelled === true) - Number(b.cancelled === true));
  return onDate[0] || null;
}

/** Search window for `/flights/{ident}`: the given local date ±1 day covers every time zone. */
export function searchWindow(date: string): { start: string; end: string } {
  const d = Date.parse(`${date}T00:00:00Z`);
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { start: iso(d - 86400000), end: iso(d + 2 * 86400000) };
}

/** AeroAPI alert webhook body → an event row for flight_events. */
export function alertToEvent(body: Record<string, unknown>): { flightId: string; kind: string; summary?: string } | null {
  const flight = body.flight as AeroFlight | undefined;
  const id = flight?.fa_flight_id;
  if (!id) return null;
  const kind = str(body.event_code) || 'update';
  return { flightId: id, kind, summary: str(body.summary) || str(body.long_description) };
}
