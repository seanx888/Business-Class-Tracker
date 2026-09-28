import 'package:aethersky/core/format.dart';
import 'package:aethersky/data/flight_repository.dart';
import 'package:aethersky/domain/fares.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/membership.dart';
import 'package:aethersky/domain/plans.dart';
import 'package:flutter_test/flutter_test.dart';

DateTime u(String s) => DateTime.parse(s).toUtc();

Flight flight({FlightTime out = const FlightTime(), FlightTime off = const FlightTime(), FlightTime on = const FlightTime(), FlightTime into = const FlightTime(), bool cancelled = false}) =>
    Flight(
      id: 'BR198-2026-12-20',
      carrier: 'BR',
      number: '198',
      origin: const FlightEndpoint(iata: 'TPE', timeZone: 'Asia/Taipei'),
      destination: const FlightEndpoint(iata: 'NRT', timeZone: 'Asia/Tokyo'),
      gateOut: out,
      takeoff: off,
      landing: on,
      gateIn: into,
      cancelled: cancelled,
    );

void main() {
  group('flight phase', () {
    final sched = u('2026-12-20T00:35:00Z');
    test('on time, delayed, departed, en route, landed, arrived, cancelled', () {
      expect(flight(out: FlightTime(scheduled: sched)).phase, FlightPhase.scheduled);
      expect(flight(out: FlightTime(scheduled: sched, estimated: sched.add(const Duration(minutes: 10)))).phase, FlightPhase.scheduled, reason: '<15 min is on time');
      expect(flight(out: FlightTime(scheduled: sched, estimated: sched.add(const Duration(minutes: 40)))).phase, FlightPhase.delayed);
      expect(flight(out: FlightTime(scheduled: sched, actual: sched)).phase, FlightPhase.departed);
      expect(flight(out: FlightTime(actual: sched), off: FlightTime(actual: sched)).phase, FlightPhase.enRoute);
      expect(flight(off: FlightTime(actual: sched), on: FlightTime(actual: sched)).phase, FlightPhase.landed);
      expect(flight(into: FlightTime(actual: sched)).phase, FlightPhase.arrived);
      expect(flight(out: FlightTime(scheduled: sched), cancelled: true).phase, FlightPhase.cancelled);
    });

    test('delay minutes and progress', () {
      final f = flight(
        out: FlightTime(scheduled: sched, estimated: sched.add(const Duration(minutes: 25))),
        off: FlightTime(actual: u('2026-12-20T01:00:00Z')),
        on: FlightTime(estimated: u('2026-12-20T03:00:00Z')),
        into: FlightTime(scheduled: u('2026-12-20T03:30:00Z'), estimated: u('2026-12-20T03:20:00Z')),
      );
      expect(f.departureDelay, 25);
      expect(f.arrivalDelay, -10);
      expect(f.progress(u('2026-12-20T02:00:00Z')), closeTo(0.5, 0.001));
      expect(f.progress(u('2026-12-20T09:00:00Z')), 0.99, reason: 'never 100% until landed');
      expect(flight(into: FlightTime(actual: sched)).progress(sched), 1);
    });

    test('JSON round trip keeps the contract', () {
      final f = flight(out: FlightTime(scheduled: sched, estimated: sched), into: FlightTime(scheduled: sched.add(const Duration(hours: 3))));
      final back = Flight.fromJson(f.toJson());
      expect(back.ident, 'BR198');
      expect(back.gateOut.scheduled, sched);
      expect(back.destination.timeZone, 'Asia/Tokyo');
      expect(back.blockTime, const Duration(hours: 3));
    });
  });

  test('parseFlightNumber', () {
    expect(parseFlightNumber('br198'), (carrier: 'BR', number: '198'));
    expect(parseFlightNumber(' CI 0160 '), (carrier: 'CI', number: '160'));
    expect(parseFlightNumber('7C1101'), (carrier: '7C', number: '1101'));
    expect(parseFlightNumber('12345'), isNull);
    expect(parseFlightNumber('hello'), isNull);
  });

  test('times are shown in each airport’s zone, with +1 on next-day arrivals', () {
    initTimeZones();
    final dep = u('2026-12-20T15:30:00Z'); // 23:30 in Taipei
    final arr = u('2026-12-20T18:40:00Z'); // 03:40 next day in Tokyo
    expect(hhmm(dep, 'Asia/Taipei'), '23:30');
    expect(hhmm(arr, 'Asia/Tokyo'), '03:40');
    expect(dayOffset(dep, 'Asia/Taipei', arr, 'Asia/Tokyo'), '+1');
    expect(twd(98500), r'NT$98,500');
  });

  test('demo source moves flights through phases relative to the clock', () async {
    final now = u('2026-09-28T06:00:00Z');
    final src = DemoFlightDataSource(clock: () => now);
    final phases = <FlightPhase>{};
    for (final id in DemoFlightDataSource.sampleIdents) {
      final p = parseFlightNumber(id)!;
      phases.add((await src.lookup(p.carrier, p.number, now))!.phase);
    }
    expect(phases.length, greaterThan(2));
    expect(await src.lookup('ZZ', '1', now), isNull);
  });

  test('trackers.json and deals.json parsing (same files as the PWA)', () {
    final trackers = TrackerResult.listFrom({
      'trackers': {
        'tparis': {
          'def': {'o': 'TPE', 'd': 'CDG', 'depart': '2026-12-20', 'return': '2027-01-05', 'flex': 3, 'cabin': 'business', 'target': 100000},
          'status': 'tracking',
          'best': {'p': 98000, 'dep': '2026-12-21', 'ret': '2027-01-06', 'c': 'CI', 's': 1},
          'history': [
            ['2026-09-27', 101000, '2026-12-20', '2027-01-05', 'CI'],
            ['2026-09-28', 98000, '2026-12-21', '2027-01-06', 'CI'],
          ],
          'low': {'p': 98000},
        },
        'told': {'def': {'o': 'TPE', 'd': 'NRT', 'depart': '2026-10-01'}, 'status': 'removed'},
      },
    });
    expect(trackers, hasLength(1));
    expect(trackers.single.changeSinceLast, -3000);
    expect(trackers.single.targetHit, isTrue);
    expect(trackers.single.flexDays, 3);

    final deals = Deal.topFrom({
      'deals': [
        {'id': 'a', 'origin': 'TPE', 'destination': 'NRT', 'priceTWD': 30000, 'primaryCarrier': 'CI', 'departDate': '2026-11-01', 'score': 70},
        {'id': 'b', 'origin': 'TPE', 'destination': 'CDG', 'priceTWD': 99000, 'primaryCarrier': 'BR', 'departDate': '2026-11-01', 'score': 90},
        {'id': 'c', 'origin': 'TPE', 'destination': 'ICN', 'priceTWD': 9000, 'primaryCarrier': 'TW', 'departDate': '2026-11-01', 'score': 99, 'budget': true},
      ],
    });
    expect(deals.map((d) => d.id), ['b', 'a'], reason: 'LCC excluded, best score first');
  });

  test('membership: masking, expiry, PWA backup compatibility', () {
    final m = Membership.fromJson({'id': 'm1', 'program': 'AFKL', 'number': '2045 1234 56', 'expiry': '2026-10-28', 'owner': 'Sean'})!;
    expect(m.masked, '•••• 3456');
    expect(m.daysToExpiry(DateTime(2026, 9, 28)), 30);
    expect(m.displayName(chinese: true), 'Flying Blue 藍天飛行');
    expect(Membership.fromJson({'program': 'NOPE', 'number': '1'}), isNull);
    expect(Membership.fromJson({'program': 'OTHER', 'programName': 'Priority Pass', 'number': 'PP123'})!.displayName(), 'Priority Pass');
  });

  test('plan gates', () {
    expect(includes(Tier.elite, Tier.pro), isTrue);
    expect(includes(Tier.free, Tier.pro), isFalse);
    expect(planFeatures.where((f) => f.minTier == Tier.free).length, greaterThanOrEqualTo(5), reason: 'competitors’ free features stay free');
  });
}
