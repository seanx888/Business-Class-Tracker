import 'package:aethersky/domain/departure_plan.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/settings.dart';
import 'package:aethersky/domain/trip.dart';
import 'package:flutter_test/flutter_test.dart';

DateTime at(int h, [int m = 0]) => DateTime.utc(2026, 12, 20, h, m);

Flight flight({DateTime? out, DateTime? est, DateTime? actual, bool cancelled = false}) => Flight(
  id: 'BR198-2026-12-20',
  carrier: 'BR',
  number: '198',
  origin: const FlightEndpoint(iata: 'TPE'),
  destination: const FlightEndpoint(iata: 'NRT'),
  gateOut: FlightTime(scheduled: out ?? at(8), estimated: est, actual: actual),
  cancelled: cancelled,
);

const s = DepartureSettings(); // 60 min journey, 180 min international, 120 min domestic

void main() {
  test('leave home = departure − airport buffer − journey', () {
    final p = planDeparture(flight(), s, international: true)!;
    expect(p.departure, at(8));
    expect(p.arriveAtAirport, at(5));
    expect(p.leaveHome, at(4));
    expect(p.international, isTrue);
    final d = planDeparture(flight(), s, international: false)!;
    expect(d.arriveAtAirport, at(6));
    expect(d.leaveHome, at(5));
  });

  test('a delay moves the whole plan later; a per-flight journey time replaces the default', () {
    final p = planDeparture(flight(est: at(9, 10)), s, international: true, travelOverride: const Duration(minutes: 90))!;
    expect(p.departure, at(9, 10));
    expect(p.leaveHome, at(9, 10).subtract(const Duration(minutes: 270)));
    expect(p.travel, const Duration(minutes: 90));
  });

  test('no plan once the flight has left, or when it is cancelled or has no time', () {
    expect(planDeparture(flight(actual: at(8, 5)), s, international: true), isNull);
    expect(planDeparture(flight(cancelled: true), s, international: true), isNull);
    expect(
      planDeparture(
        const Flight(
          id: 'x',
          carrier: 'BR',
          number: '1',
          origin: FlightEndpoint(iata: 'A'),
          destination: FlightEndpoint(iata: 'B'),
        ),
        s,
        international: true,
      ),
      isNull,
    );
  });

  test('check-in prompt appears within 48 h of departure and stops once the flight has left', () {
    final f = flight();
    expect(checkInLikelyOpen(f, at(8).subtract(const Duration(hours: 47))), isTrue);
    expect(checkInLikelyOpen(f, at(8).subtract(const Duration(hours: 49))), isFalse);
    expect(checkInLikelyOpen(f, at(8).add(const Duration(minutes: 1))), isFalse);
    expect(checkInLikelyOpen(flight(actual: at(8)), at(7)), isFalse);
    expect(checkInLikelyOpen(flight(cancelled: true), at(7)), isFalse);
  });

  group('settings', () {
    test('defaults, JSON round trip, and out-of-range or junk values are tamed', () {
      const d = AppSettings();
      expect(d.language, 'system');
      expect(d.departure.travel, const Duration(minutes: 60));
      final back = AppSettings.fromJson(
        const AppSettings(language: 'ko', travelMinutes: 45, bufferInternationalMinutes: 150, bufferDomesticMinutes: 90).toJson(),
      );
      expect(back.language, 'ko');
      expect(back.travelMinutes, 45);
      final junk = AppSettings.fromJson({
        'language': 'klingon',
        'travelMinutes': 99999,
        'bufferInternationalMinutes': -5,
        'bufferDomesticMinutes': 'x',
      });
      expect(junk.language, 'system');
      expect(junk.travelMinutes, 300);
      expect(junk.bufferInternationalMinutes, 30);
      expect(junk.bufferDomesticMinutes, 120);
      expect(AppSettings.fromJson(const {}).travelMinutes, 60);
    });

    test('copyWith changes only what it is told to', () {
      final c = const AppSettings().copyWith(travelMinutes: 30);
      expect(c.travelMinutes, 30);
      expect(c.bufferInternationalMinutes, 180);
      expect(c.language, 'system');
    });
  });

  test('TripInfo keeps a per-flight journey time; zero or negative means "use the default"', () {
    expect(TripInfo.clean(travelMinutes: 90).travelMinutes, 90);
    expect(TripInfo.clean(travelMinutes: 0).travelMinutes, isNull);
    expect(TripInfo.clean(travelMinutes: 90).isEmpty, isFalse);
    expect(TripInfo.fromJson(TripInfo.clean(travelMinutes: 45, seat: '1a').toJson()).travelMinutes, 45);
  });
}
