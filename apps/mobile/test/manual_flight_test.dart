import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/geo.dart';
import 'package:aethersky/domain/manual_flight.dart';
import 'package:aethersky/domain/passport.dart';
import 'package:aethersky/domain/schedule.dart';
import 'package:flutter_test/flutter_test.dart';

const tpe = AirportGeo(25.08, 121.23, 'Taoyuan');
const nrt = AirportGeo(35.77, 140.39, 'Narita');
final today = DateTime(2026, 9, 30);

({Flight? flight, ManualFlightError? error}) build({
  String number = 'br198',
  DateTime? date,
  String from = 'tpe',
  String to = 'nrt',
  AirportGeo? fromGeo = tpe,
  AirportGeo? toGeo = nrt,
}) {
  return buildManualFlight(
    flightNumber: number,
    date: date ?? DateTime(2025, 3, 14),
    from: from,
    to: to,
    fromGeo: fromGeo,
    toGeo: toGeo,
    today: today,
  );
}

void main() {
  test('builds a finished flight with great-circle distance, an estimated block time and a stable id', () {
    final f = build().flight!;
    expect(f.id, 'BR198-2025-03-14');
    expect(f.ident, 'BR198');
    expect(f.isManual, isTrue);
    expect(f.origin.iata, 'TPE');
    expect(f.origin.city, 'Taoyuan');
    expect(f.distanceKm, closeTo(2170, 30));
    expect(f.blockTime!.inMinutes, inInclusiveRange(180, 200));
    expect(f.phase, FlightPhase.arrived);
    expect(isFinished(f, DateTime.utc(2026, 9, 30)), isTrue);
    expect(f.gateOut.best, DateTime.utc(2025, 3, 14, 12));
  });

  test('every mistake is named: bad number, unknown airport, same airport, not in the past', () {
    expect(build(number: '12345').error, ManualFlightError.badNumber);
    expect(build(fromGeo: null).error, ManualFlightError.unknownOrigin);
    expect(build(toGeo: null).error, ManualFlightError.unknownDestination);
    expect(build(to: 'TPE', toGeo: tpe).error, ManualFlightError.sameAirport);
    expect(build(date: DateTime(2026, 9, 30)).error, ManualFlightError.notPast, reason: 'today is looked up normally');
    expect(build(date: DateTime(2026, 12, 1)).error, ManualFlightError.notPast);
    expect(build(date: DateTime(2026, 9, 29)).error, isNull, reason: 'yesterday is the latest manual date');
  });

  test('manual flights feed Passport: distance, airtime, airports, year — with no timezone shifting', () {
    final flights = [
      build().flight!,
      build(number: 'br197', date: DateTime(2025, 3, 20), from: 'nrt', to: 'tpe', fromGeo: nrt, toGeo: tpe).flight!,
      build(number: 'ci100', date: DateTime(2024, 12, 31)).flight!, // 31 Dec 2024 stays 2024 whatever the phone zone
    ];
    final s = computePassport(flights, DateTime.utc(2026, 9, 30), localTime: (utc, tz) => utc.add(const Duration(hours: 14)));
    expect(s.flights, 3);
    expect(s.unmeasured, 0);
    expect(s.distanceKm, greaterThan(6000));
    expect(s.byYear, {2024: 1, 2025: 2}, reason: 'noon UTC + 14 h would tip 31 Dec into 2025 if the converter were applied');
    expect(s.topRoute, (a: 'NRT', b: 'TPE', flights: 3));
  });

  test('re-entering the same flight and day gives the same id (so it replaces, not duplicates)', () {
    expect(build().flight!.id, build(number: 'BR 198').flight!.id);
  });
}
