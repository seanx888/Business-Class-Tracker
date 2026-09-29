import 'dart:convert';

import 'package:aethersky/core/share_text.dart';
import 'package:aethersky/core/strings.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/ics.dart';
import 'package:aethersky/domain/trip.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'support.dart';

DateTime u(String s) => DateTime.parse(s).toUtc();

final flight = Flight(
  id: 'BR198-2026-12-20',
  carrier: 'BR',
  number: '198',
  origin: const FlightEndpoint(
    iata: 'TPE',
    name: 'Taiwan Taoyuan Intl',
    city: 'Taipei',
    timeZone: 'Asia/Taipei',
    terminal: '2',
    gate: 'B7',
  ),
  destination: const FlightEndpoint(iata: 'NRT', city: 'Tokyo', timeZone: 'Asia/Tokyo', terminal: '1', baggage: '4'),
  gateOut: FlightTime(scheduled: u('2026-12-20T00:35:00Z'), estimated: u('2026-12-20T01:10:00Z')),
  takeoff: FlightTime(scheduled: u('2026-12-20T00:55:00Z')),
  landing: FlightTime(scheduled: u('2026-12-20T03:35:00Z')),
  gateIn: FlightTime(scheduled: u('2026-12-20T03:45:00Z'), estimated: u('2026-12-20T04:20:00Z')),
);

void main() {
  setUpAll(() => initializeDateFormatting());

  group('ICS', () {
    final now = u('2026-12-19T09:00:00Z');
    final ics = flightIcs(flight, now: now, description: 'Gate B7; bring passport, e-ticket\nSeat 12A')!;
    final lines = ics.split('\r\n');

    test('valid envelope, CRLF line endings, UTC times from the best-known schedule', () {
      expect(ics.endsWith('\r\n'), isTrue);
      expect(lines.first, 'BEGIN:VCALENDAR');
      expect(lines, containsAll(['VERSION:2.0', 'BEGIN:VEVENT', 'END:VEVENT', 'END:VCALENDAR']));
      expect(lines, contains('DTSTART:20261220T011000Z'), reason: 'estimated gate-out, not the original schedule');
      expect(lines, contains('DTEND:20261220T042000Z'));
      expect(lines, contains('DTSTAMP:20261219T090000Z'));
      expect(lines, contains('STATUS:CONFIRMED'));
      expect(lines, contains('TRIGGER:-PT3H'));
    });

    test('UID is stable per flight+day (re-import updates instead of duplicating); SEQUENCE grows', () {
      expect(lines, contains('UID:BR198-2026-12-20@aethersky'));
      int seq(String s) => int.parse(s.split('\r\n').firstWhere((l) => l.startsWith('SEQUENCE:')).substring(9));
      final later = flightIcs(flight, now: now.add(const Duration(hours: 2)))!;
      expect(seq(later), greaterThan(seq(ics)));
    });

    test('text is escaped (; , newline) and the summary carries the route', () {
      final unfolded = ics.replaceAll('\r\n ', '');
      expect(unfolded, contains(r'DESCRIPTION:Gate B7\; bring passport\, e-ticket\nSeat 12A'));
      expect(unfolded, contains('SUMMARY:✈ BR198 TPE → NRT'));
      expect(unfolded, contains('LOCATION:Taiwan Taoyuan Intl T2'));
    });

    test('no physical line exceeds 75 octets, and folding never splits a multi-byte character', () {
      final long = flightIcs(flight, now: now, description: List.filled(40, '長榮航空 BR198 桃園機場第二航廈').join('，'))!;
      for (final l in long.split('\r\n')) {
        expect(utf8.encode(l).length, lessThanOrEqualTo(75), reason: l);
      }
      final restored = long.replaceAll('\r\n ', '');
      expect(restored, contains(List.filled(40, r'長榮航空 BR198 桃園機場第二航廈').join(r'\，'.replaceAll(r'\', ''))));
    });

    test('cancelled flights are marked CANCELLED; unknown departure → no event', () {
      final cancelled = Flight(
        id: flight.id,
        carrier: 'BR',
        number: '198',
        origin: flight.origin,
        destination: flight.destination,
        gateOut: flight.gateOut,
        gateIn: flight.gateIn,
        cancelled: true,
      );
      expect(flightIcs(cancelled, now: now)!, contains('STATUS:CANCELLED'));
      expect(
        flightIcs(
          Flight(id: 'z', carrier: 'BR', number: '1', origin: flight.origin, destination: flight.destination),
          now: now,
        ),
        isNull,
      );
    });
  });

  group('share text', () {
    test('English: route, local times, terminal/gate, baggage, delay — no seat or booking ref', () {
      final text = flightShareText(const S('en'), flight);
      expect(text, contains('✈ BR198 · TPE → NRT'));
      expect(text, contains('Departure 09:10 · TPE T2 Gate B7'), reason: 'estimated 01:10Z = 09:10 in Taipei');
      expect(text, contains('Arrival 13:20 · NRT T1 · Baggage 4'), reason: '04:20Z = 13:20 in Tokyo');
      expect(text, contains('35 min late'));
      expect(text, endsWith('— ÆtherSky'));
    });

    test('zh-TW', () {
      final text = flightShareText(const S('zh'), flight);
      expect(text, contains('出發 09:10'));
      expect(text, contains('晚 35 分'));
    });

    test('calendar description adds the private details (cabin, seat, booking ref), share text does not', () {
      final trip = TripInfo.clean(cabin: Cabin.business, seat: '12a', pnr: 'k7xq2p', notes: 'Meet driver at gate 3');
      final desc = flightCalendarDescription(const S('en'), flight, trip);
      expect(desc, contains('Cabin: Business'));
      expect(desc, contains('Seat: 12A'));
      expect(desc, contains('Booking ref: K7XQ2P'));
      expect(desc, contains('Meet driver at gate 3'));
      expect(desc, isNot(contains('✈ BR198')), reason: 'title line is the event summary, not repeated');
      expect(flightShareText(const S('en'), flight), isNot(contains('K7XQ2P')));
    });
  });

  testWidgets('flight page: share sends the summary; calendar attaches a .ics named after flight and day', (tester) async {
    final actions = FakeExternalActions();
    final now = DateTime.utc(2026, 12, 19, 9);
    await pumpApp(
      tester,
      actions: actions,
      source: InertFlightSource(),
      clock: () => now,
      prefs: {
        'aether.flights.v1': jsonEncode([flight.toJson()]),
        'aether.trips.v1': jsonEncode({flight.id: TripInfo.clean(pnr: 'k7xq2p').toJson()}),
      },
    );
    await tester.tap(find.text('BR198').last);
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('分享航班'));
    await tester.pump();
    expect(actions.shared.single.text, contains('✈ BR198 · TPE → NRT'));
    expect(actions.shared.single.fileName, isNull);

    await tester.tap(find.byTooltip('加入行事曆'));
    await tester.pump();
    final cal = actions.shared.last;
    expect(cal.fileName, 'BR198-2026-12-20.ics');
    expect(cal.fileText, startsWith('BEGIN:VCALENDAR'));
    expect(cal.fileText!.replaceAll('\r\n ', ''), contains('K7XQ2P'), reason: 'the booking reference travels with the calendar entry');
  });
}
