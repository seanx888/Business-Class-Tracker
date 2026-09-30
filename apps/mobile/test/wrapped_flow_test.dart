import 'dart:convert';
import 'dart:ui' as ui;

import 'package:aethersky/data/stores.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

final now = DateTime.utc(2027, 1, 10);

Flight flown(String carrier, String number, String from, String to, DateTime dep, {int km = 2000, int minutes = 180}) {
  final arr = dep.add(Duration(minutes: minutes));
  return Flight(
    id: '$carrier$number-${dep.toIso8601String().substring(0, 10)}',
    carrier: carrier,
    number: number,
    origin: FlightEndpoint(iata: from, timeZone: 'Asia/Taipei'),
    destination: FlightEndpoint(iata: to),
    gateOut: FlightTime(scheduled: dep, actual: dep),
    takeoff: FlightTime(actual: dep),
    landing: FlightTime(actual: arr),
    gateIn: FlightTime(scheduled: arr, actual: arr),
    distanceKm: km,
  );
}

final flights = [
  flown('BR', '198', 'TPE', 'NRT', DateTime.utc(2026, 3, 10, 1), km: 2190),
  flown('BR', '197', 'NRT', 'TPE', DateTime.utc(2026, 3, 14, 6), km: 2190),
  flown('CI', '160', 'TPE', 'ICN', DateTime.utc(2026, 3, 30, 2), km: 1480, minutes: 150),
  flown('JX', '2', 'TPE', 'LAX', DateTime.utc(2026, 8, 1, 2), km: 10930, minutes: 725),
  flown('BR', '12', 'TPE', 'NRT', DateTime.utc(2025, 11, 5, 1), km: 2190),
];
final overrides = [
  airportCountriesProvider.overrideWith((ref) async => {'TPE': 'TW', 'NRT': 'JP', 'ICN': 'KR', 'LAX': 'US'}),
];

Future<void> open(WidgetTester tester, {FakeExternalActions? actions, List<Flight>? list}) async {
  await pumpApp(
    tester,
    prefs: {'aether.flights.v1': jsonEncode((list ?? flights).map((f) => f.toJson()).toList())},
    clock: () => now,
    source: InertFlightSource(),
    overrides: overrides,
    actions: actions,
  );
  await tester.tap(find.byTooltip('飛行紀錄'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('年度飛行回顧'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the card shows the newest year first and switches years with the chips', (tester) async {
    await open(tester);
    expect(find.text('4'), findsWidgets, reason: '4 flights in 2026');
    expect(find.text('2026 年'), findsOneWidget);
    expect(find.textContaining('16,790 km'), findsOneWidget);
    expect(find.text('最常飛　NRT ↔ TPE'), findsOneWidget);
    expect(find.textContaining('最常搭乘　長榮航空'), findsOneWidget);
    expect(find.textContaining('最忙的月份'), findsOneWidget);
    await tester.tap(find.widgetWithText(ChoiceChip, '2025'));
    await tester.pumpAndSettle();
    expect(find.text('2025 年'), findsOneWidget);
    expect(find.textContaining('2,190 km'), findsOneWidget);
  });

  testWidgets('"Share image" captures a 1080×1350 PNG of the card and hands it to the share sheet', (tester) async {
    final actions = FakeExternalActions();
    await open(tester, actions: actions);
    await tester.runAsync(() async {
      await tester.tap(find.text('分享圖片'));
      await Future<void>.delayed(const Duration(milliseconds: 500));
    });
    await tester.pumpAndSettle();
    final shared = actions.shared.single;
    expect(shared.fileName, 'aethersky-2026.png');
    expect(shared.text, contains('2026'));
    expect(shared.text, contains('4'));
    final bytes = shared.fileBytes!;
    expect(bytes.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47], reason: 'PNG signature');
    final codec = await tester.runAsync(() => ui.instantiateImageCodec(bytes));
    final frame = await tester.runAsync(() => codec!.getNextFrame());
    expect(frame!.image.width, 1080);
    expect(frame.image.height, 1350);
  });

  testWidgets('with no completed flights the review says so', (tester) async {
    await pumpApp(tester, source: InertFlightSource(), clock: () => now, overrides: overrides);
    await tester.tap(find.byTooltip('飛行紀錄'));
    await tester.pumpAndSettle();
    expect(find.text('年度飛行回顧'), findsNothing, reason: 'the entry only appears once there is something to review');
  });
}
