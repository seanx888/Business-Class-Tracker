import 'dart:convert';

import 'package:aethersky/core/format.dart';
import 'package:aethersky/data/stores.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/passport.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

final now = DateTime.utc(2027, 3, 1);

Flight flown(
  String carrier,
  String number,
  String from,
  String to,
  DateTime dep, {
  int? km,
  int minutes = 180,
  String tz = 'Asia/Taipei',
  bool cancelled = false,
}) {
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
    cancelled: cancelled,
  );
}

const countries = {'TPE': 'TW', 'NRT': 'JP', 'HND': 'JP', 'ICN': 'KR', 'LAX': 'US'};

void main() {
  initTimeZones();
  final flights = [
    flown('BR', '198', 'TPE', 'NRT', DateTime.utc(2026, 3, 10, 1), km: 2190, minutes: 190),
    flown('BR', '197', 'NRT', 'TPE', DateTime.utc(2026, 3, 14, 6), km: 2190, minutes: 210),
    flown('CI', '160', 'TPE', 'ICN', DateTime.utc(2026, 7, 1, 2), km: 1480, minutes: 150),
    flown('JX', '2', 'TPE', 'LAX', DateTime.utc(2026, 12, 31, 16, 30), km: 10930, minutes: 725), // 00:30 on 1 Jan in Taipei
    flown('BR', '2', 'TPE', 'HND', DateTime.utc(2026, 5, 5), minutes: 180), // no distance
    flown('CI', '99', 'TPE', 'NRT', DateTime.utc(2026, 4, 4), km: 2190, cancelled: true),
    flown('BR', '300', 'TPE', 'NRT', DateTime.utc(2027, 4, 1)), // not flown yet: a future flight
  ];

  PassportStats compute() => computePassport(flights, now, countryOf: (i) => countries[i], localTime: atAirport);

  test('counts only flights that really happened — not cancelled, not upcoming', () {
    expect(compute().flights, 5);
  });

  test('distance is a lower bound when some flights have none; airtime adds block times', () {
    final s = compute();
    expect(s.distanceKm, 2190 + 2190 + 1480 + 10930);
    expect(s.unmeasured, 1);
    expect(s.airtime, const Duration(minutes: 190 + 210 + 150 + 725 + 180));
    expect(s.earthLaps, closeTo(s.distanceKm / 40075, 1e-9));
  });

  test('airports and countries: unique, most visited first', () {
    final s = compute();
    expect(s.airports.first, 'TPE', reason: 'TPE appears in every flown flight');
    expect(s.airports.toSet(), {'TPE', 'NRT', 'ICN', 'LAX', 'HND'});
    expect(s.countries.first, 'TW');
    expect(s.countries.toSet(), {'TW', 'JP', 'KR', 'US'});
  });

  test('airlines, top route (either direction), longest flight', () {
    final s = compute();
    expect(s.airlines.first, (code: 'BR', flights: 3));
    expect(s.airlines.map((a) => a.code), containsAll(['CI', 'JX']));
    expect(s.topRoute, (a: 'NRT', b: 'TPE', flights: 2));
    expect(s.longest!.ident, 'JX2');
  });

  test('year buckets use the airport-local date (a 00:30 Taipei departure belongs to the new year)', () {
    expect(compute().byYear, {2026: 4, 2027: 1});
    final utcOnly = computePassport(flights, now);
    expect(utcOnly.byYear, {2026: 5}, reason: 'without a local-time converter the UTC date is used');
  });

  test('no flights, or only upcoming ones → empty', () {
    expect(computePassport(const [], now).isEmpty, isTrue);
    expect(computePassport([flights.last], now).isEmpty, isTrue);
  });

  test('flag emoji from an ISO code', () {
    expect(flagEmoji('TW'), '🇹🇼');
    expect(flagEmoji('jp'), '🇯🇵');
    expect(flagEmoji('USA'), '');
    expect(flagEmoji(''), '');
  });

  test('the bundled airport table resolves the airports this app cares about', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final table = (jsonDecode(await rootBundle.loadString('assets/airport-countries.json')) as Map<String, dynamic>).cast<String, String>();
    expect(table['TPE'], 'TW');
    expect(table['ICN'], 'KR');
    expect(table['NRT'], 'JP');
    expect(table['CDG'], 'FR');
    expect(table.length, greaterThan(5000));
  });

  testWidgets('Passport screen: stats from tracked flights, reachable from the flights page', (tester) async {
    await pumpApp(
      tester,
      source: InertFlightSource(),
      clock: () => now,
      prefs: {'aether.flights.v1': jsonEncode(flights.map((f) => f.toJson()).toList())},
      overrides: [airportCountriesProvider.overrideWith((ref) async => countries)],
    );
    await tester.tap(find.byTooltip('飛行紀錄'));
    await tester.pumpAndSettle();
    expect(find.text('飛行紀錄'), findsWidgets);
    expect(find.text('5'), findsWidgets, reason: 'flights flown');
    expect(find.text('16,790 km'), findsOneWidget);
    expect(find.textContaining('部分航班沒有距離資料'), findsOneWidget);
    expect(find.text('🇹🇼 TW'), findsOneWidget);
    expect(find.text('NRT ↔ TPE · 2 班'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('2026'), 200, scrollable: find.byType(Scrollable).last);
    expect(find.text('2026'), findsOneWidget);
    expect(find.text('2027'), findsOneWidget);
  });

  testWidgets('Passport screen with nothing flown yet explains how it fills up', (tester) async {
    await pumpApp(tester, source: InertFlightSource(), clock: () => now);
    await tester.tap(find.byTooltip('飛行紀錄'));
    await tester.pumpAndSettle();
    expect(find.textContaining('完成第一趟追蹤的航班後'), findsOneWidget);
  });
}
