// Backend (Supabase Edge Function) helpers are TypeScript; Node ≥ 22.18 runs them via type stripping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAeroFlight, pickFlightForDate, searchWindow, localDate, alertToEvent, splitIdent } from '../backend/supabase/functions/_shared/aeroapi.ts';

// Shape of an AeroAPI v3 /flights/{ident} item (trimmed).
const aero = (over = {}) => ({
  fa_flight_id: 'EVA198-1797000000-schedule-0001',
  ident: 'EVA198',
  ident_iata: 'BR198',
  operator_iata: 'BR',
  flight_number: '198',
  registration: 'B-17801',
  inbound_fa_flight_id: 'EVA197-1796900000-schedule-0001',
  cancelled: false,
  diverted: false,
  origin: { code: 'RCTP', code_iata: 'TPE', name: 'Taiwan Taoyuan Intl', city: 'Taipei', timezone: 'Asia/Taipei' },
  destination: { code: 'RJAA', code_iata: 'NRT', name: 'Narita Intl', city: 'Tokyo', timezone: 'Asia/Tokyo' },
  scheduled_out: '2026-12-20T00:35:00Z',
  estimated_out: '2026-12-20T00:50:00Z',
  actual_out: null,
  scheduled_off: '2026-12-20T00:50:00Z',
  scheduled_on: '2026-12-20T03:40:00Z',
  scheduled_in: '2026-12-20T03:50:00Z',
  gate_origin: 'C5',
  terminal_origin: '2',
  gate_destination: '71',
  terminal_destination: '1',
  baggage_claim: '7',
  aircraft_type: 'B78X',
  route_distance: 1360,
  status: 'Scheduled / Delayed',
  ...over,
});

test('normalizeAeroFlight maps AeroAPI fields onto the app contract', () => {
  const f = normalizeAeroFlight(aero());
  assert.equal(f.carrier, 'BR');
  assert.equal(f.number, '198');
  assert.equal(f.origin.iata, 'TPE');
  assert.equal(f.origin.tz, 'Asia/Taipei');
  assert.equal(f.origin.gate, 'C5');
  assert.equal(f.destination.baggage, '7');
  assert.deepEqual(f.out, { scheduled: '2026-12-20T00:35:00Z', estimated: '2026-12-20T00:50:00Z' });
  assert.equal(f.distanceKm, 2189);
  assert.equal(f.inbound.id, 'EVA197-1796900000-schedule-0001');
  assert.equal(f.aircraft.type, 'B78X');
  assert.equal(f.source, 'aeroapi');
});

test('idents fall back to operator + flight number', () => {
  assert.deepEqual(splitIdent(aero({ ident_iata: null })), { carrier: 'BR', number: '198' });
});

test('pickFlightForDate uses the local date at the origin', () => {
  // 2026-12-19 17:00Z is already 12-20 01:00 in Taipei.
  const late = aero({ fa_flight_id: 'late', scheduled_out: '2026-12-19T17:00:00Z' });
  const other = aero({ fa_flight_id: 'other', scheduled_out: '2026-12-21T00:35:00Z' });
  assert.equal(pickFlightForDate([other, late], '2026-12-20').fa_flight_id, 'late');
  assert.equal(pickFlightForDate([other], '2026-12-20'), null);
  const cancelled = aero({ fa_flight_id: 'x', cancelled: true });
  assert.equal(pickFlightForDate([cancelled, aero()], '2026-12-20').fa_flight_id, 'EVA198-1797000000-schedule-0001');
  assert.equal(localDate('2026-12-19T17:00:00Z', 'Asia/Taipei'), '2026-12-20');
  assert.deepEqual(searchWindow('2026-12-20'), { start: '2026-12-19T00:00:00Z', end: '2026-12-22T00:00:00Z' });
});

test('alert webhook bodies become flight events', () => {
  assert.deepEqual(alertToEvent({ event_code: 'departure', summary: 'BR198 departed TPE', flight: aero() }), {
    flightId: 'EVA198-1797000000-schedule-0001', kind: 'departure', summary: 'BR198 departed TPE',
  });
  assert.equal(alertToEvent({ event_code: 'departure' }), null);
});
