import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/wrapped.dart';
import 'package:flutter_test/flutter_test.dart';

final now = DateTime.utc(2027, 1, 10);

Flight flown(String carrier, String number, String from, String to, DateTime dep, {int? km, String tz = 'Asia/Taipei', int minutes = 180}) {
  final arr = dep.add(Duration(minutes: minutes));
  return Flight(
    id: '$carrier$number-${dep.toIso8601String().substring(0, 10)}',
    carrier: carrier,
    number: number,
    origin: FlightEndpoint(iata: from, timeZone: tz),
    destination: FlightEndpoint(iata: to),
    gateOut: FlightTime(scheduled: dep, actual: dep),
    takeoff: FlightTime(actual: dep),
    landing: FlightTime(actual: arr),
    gateIn: FlightTime(scheduled: arr, actual: arr),
    distanceKm: km,
  );
}

const countries = {'TPE': 'TW', 'NRT': 'JP', 'ICN': 'KR', 'LAX': 'US'};

void main() {
  final flights = [
    flown('BR', '198', 'TPE', 'NRT', DateTime.utc(2026, 3, 10, 1), km: 2190),
    flown('BR', '197', 'NRT', 'TPE', DateTime.utc(2026, 3, 14, 6), km: 2190),
    flown('CI', '160', 'TPE', 'ICN', DateTime.utc(2026, 3, 30, 2), km: 1480),
    flown('JX', '2', 'TPE', 'LAX', DateTime.utc(2026, 8, 1, 2), km: 10930, minutes: 725),
    flown('BR', '12', 'TPE', 'NRT', DateTime.utc(2025, 11, 5, 1), km: 2190), // another year
    flown('JX', '1', 'TPE', 'LAX', DateTime.utc(2026, 12, 31, 16, 30), km: 10930, minutes: 725), // 00:30 on 1 Jan 2027 in Taipei
  ];
  String? countryOf(String i) => countries[i];
  DateTime taipei(DateTime utc, String? tz) => utc.add(const Duration(hours: 8));

  test('years with flights, newest first; the local date decides the year', () {
    expect(wrappedYears(flights, now, localTime: taipei), [2027, 2026, 2025]);
    expect(wrappedYears(flights, now), [2026, 2025], reason: 'without a converter the UTC date is used');
    expect(wrappedYears(const [], now), isEmpty);
  });

  test('stats are limited to the chosen year', () {
    final w = computeWrapped(flights, now, 2026, countryOf: countryOf, localTime: taipei);
    expect(w.year, 2026);
    expect(w.stats.flights, 4);
    expect(w.stats.distanceKm, 2190 + 2190 + 1480 + 10930);
    expect(w.stats.countries.toSet(), {'TW', 'JP', 'KR', 'US'});
    expect(w.stats.airlines.first, (code: 'BR', flights: 2));
    expect(w.stats.topRoute, (a: 'NRT', b: 'TPE', flights: 2));
    expect(w.isEmpty, isFalse);
  });

  test('busiest month and first / last flight', () {
    final w = computeWrapped(flights, now, 2026, localTime: taipei);
    expect(w.busiestMonth, 3);
    expect(w.busiestMonthFlights, 3);
    expect(w.first!.ident, 'BR198');
    expect(w.last!.ident, 'JX2');
  });

  test('a tie goes to the earlier month; a year with nothing is empty', () {
    final two = [flown('BR', '1', 'TPE', 'NRT', DateTime.utc(2026, 5, 1, 1)), flown('BR', '2', 'TPE', 'NRT', DateTime.utc(2026, 2, 1, 1))];
    expect(computeWrapped(two, now, 2026, localTime: taipei).busiestMonth, 2);
    final none = computeWrapped(flights, now, 2019, localTime: taipei);
    expect(none.isEmpty, isTrue);
    expect(none.busiestMonth, isNull);
    expect(none.first, isNull);
  });

  test('upcoming and cancelled flights never count', () {
    final future = flown('BR', '9', 'TPE', 'NRT', DateTime.utc(2027, 6, 1, 1));
    expect(computeWrapped([future], now, 2027, localTime: taipei).isEmpty, isTrue);
  });
}
