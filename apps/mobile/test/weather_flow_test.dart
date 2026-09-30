import 'dart:convert';

import 'package:aethersky/data/stores.dart';
import 'package:aethersky/data/weather_source.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/geo.dart';
import 'package:aethersky/domain/weather.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

final now = DateTime.utc(2026, 12, 19, 2);

class FakeWeather implements WeatherSource {
  FakeWeather(this.result);
  final DayWeather? result;
  final asked = <({double lat, double lon, String day})>[];

  @override
  Future<DayWeather?> forecast(double lat, double lon, DateTime day) async {
    asked.add((lat: lat, lon: lon, day: day.toIso8601String().substring(0, 10)));
    return result;
  }
}

Flight flight({DateTime? dep, Duration block = const Duration(hours: 3), String source = 'test'}) => Flight(
  id: 'BR198-2026-12-20',
  carrier: 'BR',
  number: '198',
  origin: const FlightEndpoint(iata: 'TPE', city: 'Taipei', timeZone: 'Asia/Taipei'),
  destination: const FlightEndpoint(iata: 'NRT', city: 'Tokyo', timeZone: 'Asia/Tokyo'),
  gateOut: FlightTime(scheduled: dep ?? DateTime.utc(2026, 12, 20, 1)),
  gateIn: FlightTime(scheduled: (dep ?? DateTime.utc(2026, 12, 20, 1)).add(block)),
  source: source,
);

Future<void> open(WidgetTester tester, Flight f, WeatherSource weather) async {
  await pumpApp(
    tester,
    prefs: {
      'aether.flights.v1': jsonEncode([f.toJson()]),
    },
    clock: () => now,
    source: InertFlightSource(),
    overrides: [
      airportGeoProvider.overrideWith((ref) async => {'NRT': const AirportGeo(35.77, 140.39, 'Narita')}),
      weatherSourceProvider.overrideWithValue(weather),
    ],
  );
  await tester.tap(find.text('BR198').last);
  await tester.pumpAndSettle();
}

Future<void> reveal(WidgetTester tester, Finder f) async {
  await tester.scrollUntilVisible(f, 250, scrollable: find.byType(Scrollable).first);
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the flight page shows the forecast for the day you land, in the destination city', (tester) async {
    final fake = FakeWeather(DayWeather(day: DateTime.utc(2026, 12, 20), minC: 6.2, maxC: 13.8, code: 61, precipitationPercent: 70));
    await open(tester, flight(), fake);
    await reveal(tester, find.textContaining('抵達地天氣'));
    expect(find.text('抵達地天氣 · Tokyo'), findsOneWidget);
    expect(find.textContaining('6° – 14°'), findsOneWidget);
    expect(find.textContaining('雨'), findsWidgets);
    expect(find.text('降雨機率 70%'), findsOneWidget);
    expect(find.text('記得帶傘'), findsOneWidget);
    expect(find.text('天氣資料：Open-Meteo.com'), findsOneWidget);
    expect(fake.asked.single, (lat: 35.77, lon: 140.39, day: '2026-12-20'));
  });

  testWidgets('the forecast day is the local day at the destination, not the UTC day (lands after midnight in Tokyo)', (tester) async {
    // departs 14:00Z, 3 h → lands 17:00Z Dec 20 = 02:00 on Dec 21 in Tokyo
    final fake = FakeWeather(DayWeather(day: DateTime.utc(2026, 12, 21), minC: 5, maxC: 10, code: 0));
    await open(tester, flight(dep: DateTime.utc(2026, 12, 20, 14)), fake);
    await reveal(tester, find.textContaining('抵達地天氣'));
    expect(fake.asked.single.day, '2026-12-21');
    expect(find.text('記得帶傘'), findsNothing, reason: 'clear and dry');
  });

  testWidgets('no forecast available (offline, service down) → no card and no error', (tester) async {
    final fake = FakeWeather(null);
    await open(tester, flight(), fake);
    await tester.scrollUntilVisible(find.text('機型'), 250, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('抵達地天氣'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a flight more than 15 days away is not asked about', (tester) async {
    final fake = FakeWeather(DayWeather(day: DateTime.utc(2027, 2, 1), minC: 1, maxC: 5, code: 0));
    await open(tester, flight(dep: DateTime.utc(2027, 2, 1, 1)), fake);
    await tester.scrollUntilVisible(find.text('機型'), 250, scrollable: find.byType(Scrollable).first);
    expect(fake.asked, isEmpty);
    expect(find.textContaining('抵達地天氣'), findsNothing);
  });
}
