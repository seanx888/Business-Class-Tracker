import 'package:aethersky/core/strings.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/schedule.dart';
import 'package:aethersky/domain/trip.dart';
import 'package:flutter_test/flutter_test.dart';

final now = DateTime.utc(2026, 12, 20, 12);

Flight flightAt(DateTime dep, {Duration block = const Duration(hours: 3), Duration? landedAgo, bool cancelled = false, String id = 'x'}) {
  final arr = dep.add(block);
  final landed = landedAgo == null ? null : now.subtract(landedAgo);
  return Flight(
    id: id,
    carrier: 'BR',
    number: '198',
    origin: const FlightEndpoint(iata: 'TPE', timeZone: 'Asia/Taipei'),
    destination: const FlightEndpoint(iata: 'NRT', timeZone: 'Asia/Tokyo'),
    gateOut: FlightTime(scheduled: dep, actual: landed == null ? null : dep),
    takeoff: FlightTime(scheduled: dep, actual: landed == null ? null : dep),
    landing: FlightTime(scheduled: arr, actual: landed),
    gateIn: FlightTime(scheduled: arr, actual: landed),
    cancelled: cancelled,
  );
}

void main() {
  group('isFinished', () {
    test('a landed flight stays current for 2 h (baggage belt), then moves to Past', () {
      final f1 = flightAt(now.subtract(const Duration(hours: 4)), landedAgo: const Duration(hours: 1));
      final f2 = flightAt(now.subtract(const Duration(hours: 6)), landedAgo: const Duration(hours: 3));
      expect(isFinished(f1, now), isFalse);
      expect(isFinished(f2, now), isTrue);
    });

    test('in-air and future flights are not finished', () {
      expect(isFinished(flightAt(now.add(const Duration(hours: 3))), now), isFalse);
      expect(isFinished(flightAt(now.subtract(const Duration(hours: 1))), now), isFalse);
    });

    test('a cancelled flight retires 3 h after it should have ended; a future cancellation stays visible', () {
      expect(isFinished(flightAt(now.add(const Duration(days: 1)), cancelled: true), now), isFalse);
      expect(isFinished(flightAt(now.subtract(const Duration(days: 1)), cancelled: true), now), isTrue);
    });

    test('a flight with only a departure time is assumed to last 12 h', () {
      const f = Flight(
        id: 'y',
        carrier: 'CI',
        number: '1',
        origin: FlightEndpoint(iata: 'TPE'),
        destination: FlightEndpoint(iata: 'LAX'),
      );
      expect(isFinished(f, now), isFalse, reason: 'no times at all → keep it visible');
    });
  });

  test('splitFlights: upcoming soonest first, past most recent first; nextFlight is the earliest upcoming', () {
    final soon = flightAt(now.add(const Duration(hours: 3)), id: 'soon');
    final later = flightAt(now.add(const Duration(days: 9)), id: 'later');
    final old1 = flightAt(now.subtract(const Duration(days: 5)), landedAgo: const Duration(days: 5), id: 'old1');
    final old2 = flightAt(now.subtract(const Duration(days: 30)), landedAgo: const Duration(days: 30), id: 'old2');
    final parts = splitFlights([later, old2, soon, old1], now);
    expect(parts.upcoming.map((f) => f.id), ['soon', 'later']);
    expect(parts.past.map((f) => f.id), ['old1', 'old2']);
    expect(nextFlight([later, old1], now)!.id, 'later');
    expect(nextFlight([old1, old2], now), isNull);
  });

  test('auto-refresh window: under way or leaving within 2 days; never finished or far-off flights', () {
    expect(needsAutoRefresh(flightAt(now.add(const Duration(hours: 5))), now), isTrue);
    expect(needsAutoRefresh(flightAt(now.add(const Duration(hours: 47))), now), isTrue);
    expect(needsAutoRefresh(flightAt(now.add(const Duration(days: 3))), now), isFalse);
    expect(needsAutoRefresh(flightAt(now.subtract(const Duration(hours: 1))), now), isTrue, reason: 'in the air');
    expect(needsAutoRefresh(flightAt(now.subtract(const Duration(days: 4)), landedAgo: const Duration(days: 4)), now), isFalse);
  });

  test('countdown helpers', () {
    final f = flightAt(now.add(const Duration(hours: 3, minutes: 20)));
    expect(untilDeparture(f, now), const Duration(hours: 3, minutes: 20));
    expect(untilLanding(f, now), const Duration(hours: 6, minutes: 20));
  });

  test('durations read naturally in each language (two largest units)', () {
    const zh = S('zh');
    const en = S('en');
    const ko = S('ko');
    expect(zh.span(const Duration(days: 3, hours: 4, minutes: 10)), '3 天 4 小時');
    expect(zh.span(const Duration(hours: 3, minutes: 20)), '3 小時 20 分');
    expect(zh.span(const Duration(hours: 2)), '2 小時');
    expect(zh.span(const Duration(seconds: 20)), '1 分');
    expect(en.span(const Duration(hours: 3, minutes: 20)), '3h 20m');
    expect(en.departsIn(const Duration(days: 1)), 'Departs in 1d');
    expect(ko.span(const Duration(hours: 3, minutes: 20)), '3시간 20분');
    expect(zh.departsIn(const Duration(minutes: 45)), '45 分後起飛');
  });

  group('TripInfo', () {
    test('clean() trims, upper-cases seat and booking ref, and blank input means empty', () {
      final i = TripInfo.clean(cabin: Cabin.business, seat: ' 12a ', pnr: 'k7xq2p', notes: '  ');
      expect(i.seat, '12A');
      expect(i.pnr, 'K7XQ2P');
      expect(i.notes, isNull);
      expect(TripInfo.clean(seat: '  ', pnr: '').isEmpty, isTrue);
      expect(i.isEmpty, isFalse);
    });

    test('JSON round trip; unknown cabin values are ignored', () {
      final i = TripInfo.clean(cabin: Cabin.first, seat: '1K', pnr: 'ABC123', notes: 'Aisle please');
      final back = TripInfo.fromJson(i.toJson());
      expect(back.cabin, Cabin.first);
      expect(back.seat, '1K');
      expect(back.notes, 'Aisle please');
      expect(TripInfo.fromJson({'cabin': 'spaceship'}).cabin, isNull);
    });

    test('only business and first count as premium cabins', () {
      expect(Cabin.values.where((c) => c.isPremium), [Cabin.business, Cabin.first]);
    });
  });
}
