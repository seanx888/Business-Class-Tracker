// GET /functions/v1/flight-lookup?ident=BR198&date=2026-12-20
// Looks a flight up on FlightAware AeroAPI (key stays on the server), caches it in `flights`
// so everyone following the same flight shares one row, and returns the ÆtherSky contract.
//
// Secrets (supabase secrets set …): AEROAPI_KEY. Provided by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { localDate, normalizeAeroFlight, pickFlightForDate, searchWindow, type AeroFlight } from '../_shared/aeroapi.ts';

const AEROAPI = 'https://aeroapi.flightaware.com/aeroapi';
const FRESH_MS = 5 * 60 * 1000; // re-use a cached row younger than this

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' } });
  }
  const url = new URL(req.url);
  const ident = (url.searchParams.get('ident') || '').toUpperCase().replace(/\s+/g, '');
  const date = url.searchParams.get('date') || '';
  if (!/^[A-Z0-9]{2}\d{1,4}$/.test(ident) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad-request' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const carrier = ident.slice(0, 2);
  const number = ident.slice(2);

  const { data: cached } = await db.from('flights').select('id, raw, updated_at').eq('carrier', carrier).eq('number', number).eq('service_date', date).maybeSingle();
  if (cached?.raw && Date.now() - Date.parse(cached.updated_at) < FRESH_MS) {
    return json({ flight: normalizeAeroFlight(cached.raw as AeroFlight), cached: true });
  }

  const { start, end } = searchWindow(date);
  const res = await fetch(`${AEROAPI}/flights/${ident}?ident_type=designator&start=${start}&end=${end}`, {
    headers: { 'x-apikey': Deno.env.get('AEROAPI_KEY')!, Accept: 'application/json' },
  });
  if (res.status === 404) return json({ flight: null }, 404);
  if (!res.ok) return json({ error: 'upstream', status: res.status }, 502);
  const body = (await res.json()) as { flights?: AeroFlight[] };
  const raw = pickFlightForDate(body.flights || [], date);
  if (!raw) return json({ flight: null }, 404);

  const f = normalizeAeroFlight(raw);
  await db.from('flights').upsert({
    id: f.id,
    carrier: f.carrier || carrier,
    number: f.number || number,
    service_date: f.out.scheduled ? localDate(f.out.scheduled, f.origin.tz) : date,
    origin: f.origin.iata,
    destination: f.destination.iata,
    out_scheduled: f.out.scheduled, out_estimated: f.out.estimated, out_actual: f.out.actual,
    off_scheduled: f.off.scheduled, off_estimated: f.off.estimated, off_actual: f.off.actual,
    on_scheduled: f.on.scheduled, on_estimated: f.on.estimated, on_actual: f.on.actual,
    in_scheduled: f.in.scheduled, in_estimated: f.in.estimated, in_actual: f.in.actual,
    terminal_origin: f.origin.terminal, gate_origin: f.origin.gate,
    terminal_destination: f.destination.terminal, gate_destination: f.destination.gate, baggage_claim: f.destination.baggage,
    aircraft_type: f.aircraft.type, registration: f.aircraft.registration,
    distance_km: f.distanceKm, cancelled: f.cancelled, diverted: f.diverted,
    inbound_id: f.inbound?.id, status_text: f.status, source: 'aeroapi', raw, updated_at: new Date().toISOString(),
  });
  return json({ flight: f });
});
