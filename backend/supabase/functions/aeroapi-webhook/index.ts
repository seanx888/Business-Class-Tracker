// POST /functions/v1/aeroapi-webhook?secret=…  — FlightAware AeroAPI alert deliveries.
// Alerts are pushed to us (departure, arrival, delay, gate, cancellation, diversion…), so we never
// poll flights that nothing is happening to. Each delivery updates the shared `flights` row and
// appends to `flight_events`; Supabase Realtime forwards both to the app. Push notifications
// (FCM + iOS Live Activity) are sent by a follow-up function reading new flight_events.
//
// Secrets: AEROAPI_WEBHOOK_SECRET (also put in the alert's target URL), SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { alertToEvent, normalizeAeroFlight, type AeroFlight } from '../_shared/aeroapi.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const secret = Deno.env.get('AEROAPI_WEBHOOK_SECRET');
  if (!secret || new URL(req.url).searchParams.get('secret') !== secret) return new Response('forbidden', { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const event = body && alertToEvent(body);
  if (!event) return new Response('ignored', { status: 202 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const f = normalizeAeroFlight(body!.flight as AeroFlight);
  await db.from('flights').update({
    out_estimated: f.out.estimated, out_actual: f.out.actual,
    off_estimated: f.off.estimated, off_actual: f.off.actual,
    on_estimated: f.on.estimated, on_actual: f.on.actual,
    in_estimated: f.in.estimated, in_actual: f.in.actual,
    gate_origin: f.origin.gate, gate_destination: f.destination.gate, baggage_claim: f.destination.baggage,
    terminal_origin: f.origin.terminal, terminal_destination: f.destination.terminal,
    cancelled: f.cancelled, diverted: f.diverted, status_text: f.status,
    raw: body!.flight, updated_at: new Date().toISOString(),
  }).eq('id', event.flightId);
  await db.from('flight_events').insert({ flight_id: event.flightId, kind: event.kind, summary: event.summary, payload: body, source: 'aeroapi' });
  return new Response('ok');
});
