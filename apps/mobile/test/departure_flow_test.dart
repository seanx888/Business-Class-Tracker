import 'dart:convert';

import 'package:aethersky/data/stores.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support.dart';

// 2026-12-20 04:00 UTC = 12:00 in Taipei; the flight leaves at 08:00 UTC = 16:00 in Taipei.
final now = DateTime.utc(2026, 12, 20, 4);
final overrides = [
  airportCountriesProvider.overrideWith((ref) async => {'TPE': 'TW', 'NRT': 'JP', 'KHH': 'TW'}),
];

Flight flight(String ident, String from, String to, DateTime dep, {Duration block = const Duration(hours: 3)}) => Flight(
  id: '$ident-2026-12-20',
  carrier: ident.substring(0, 2),
  number: ident.substring(2),
  origin: FlightEndpoint(iata: from, city: from, timeZone: 'Asia/Taipei'),
  destination: FlightEndpoint(iata: to, city: to, timeZone: 'Asia/Tokyo'),
  gateOut: FlightTime(scheduled: dep),
  gateIn: FlightTime(scheduled: dep.add(block)),
);

Map<String, Object> seed(List<Flight> f, {Map<String, Object> extra = const {}}) => {
  'aether.flights.v1': jsonEncode(f.map((x) => x.toJson()).toList()),
  ...extra,
};

Future<void> open(WidgetTester tester, Flight f, {Map<String, Object> extra = const {}, FakeExternalActions? actions}) async {
  await pumpApp(
    tester,
    prefs: seed([f], extra: extra),
    clock: () => now,
    source: InertFlightSource(),
    overrides: overrides,
    actions: actions,
  );
}

Future<void> openDetail(WidgetTester tester, Flight f, {Map<String, Object> extra = const {}, FakeExternalActions? actions}) async {
  await open(tester, f, extra: extra, actions: actions);
  await tester.tap(find.text(f.ident).last);
  await tester.pumpAndSettle();
}

void main() {
  final tokyo = flight('BR198', 'TPE', 'NRT', DateTime.utc(2026, 12, 20, 8));

  testWidgets('the next-flight banner says when to leave: 18:00 departure − 3 h airport buffer − 1 h journey = 14:00', (tester) async {
    await open(tester, flight('BR198', 'TPE', 'NRT', DateTime.utc(2026, 12, 20, 10)));
    expect(find.text('14:00 出門'), findsOneWidget);
  });

  testWidgets('no "leave at" line once the moment to leave has passed', (tester) async {
    await open(tester, tokyo); // 16:00 departure → leave at 12:00, which is right now in Taipei
    expect(find.textContaining('出門'), findsNothing);
  });

  testWidgets('the flight page lays out the timetable and explains the assumptions', (tester) async {
    await openDetail(tester, flight('BR198', 'TPE', 'NRT', DateTime.utc(2026, 12, 20, 10)));
    expect(find.text('出發時間表'), findsOneWidget);
    expect(find.text('14:00 出門'), findsWidgets);
    expect(find.textContaining('15:00 到機場'), findsOneWidget);
    expect(find.textContaining('18:00 起飛'), findsOneWidget);
    expect(find.textContaining('國際線提前 3 小時'), findsOneWidget);
  });

  testWidgets('a domestic flight uses the shorter buffer', (tester) async {
    final f = Flight(
      id: 'CI100-2026-12-20',
      carrier: 'CI',
      number: '100',
      origin: const FlightEndpoint(iata: 'TPE', timeZone: 'Asia/Taipei'),
      destination: const FlightEndpoint(iata: 'KHH', timeZone: 'Asia/Taipei'),
      gateOut: FlightTime(scheduled: DateTime.utc(2026, 12, 20, 10)),
      gateIn: FlightTime(scheduled: DateTime.utc(2026, 12, 20, 11)),
    );
    await openDetail(tester, f);
    expect(find.textContaining('國內線提前 2 小時'), findsOneWidget);
    expect(find.text('15:00 出門'), findsWidgets, reason: '18:00 − 2 h − 1 h');
  });

  testWidgets('a per-flight journey time overrides the default; settings change the default', (tester) async {
    await openDetail(
      tester,
      flight('BR198', 'TPE', 'NRT', DateTime.utc(2026, 12, 20, 10)),
      extra: {
        'aether.trips.v1': jsonEncode({
          'BR198-2026-12-20': {'travelMinutes': 120},
        }),
        'aether.settings.v1': jsonEncode({'travelMinutes': 30, 'bufferInternationalMinutes': 150}),
      },
    );
    expect(find.text('13:30 出門'), findsWidgets, reason: '18:00 − 150 min − the 120 min override (not the 30 min default)');
  });

  testWidgets('the second leg of a connection has no "leave home" — you are already at the airport', (tester) async {
    final a = flight('BR198', 'TPE', 'NRT', DateTime.utc(2026, 12, 20, 10));
    final b = Flight(
      id: 'BR6-2026-12-20',
      carrier: 'BR',
      number: '6',
      origin: const FlightEndpoint(iata: 'NRT', timeZone: 'Asia/Tokyo'),
      destination: const FlightEndpoint(iata: 'LAX', timeZone: 'America/Los_Angeles'),
      gateOut: FlightTime(scheduled: DateTime.utc(2026, 12, 20, 15)),
      gateIn: FlightTime(scheduled: DateTime.utc(2026, 12, 21, 2)),
    );
    await pumpApp(tester, prefs: seed([a, b]), clock: () => now, source: InertFlightSource(), overrides: overrides);
    await tester.tap(find.text('BR6').last);
    await tester.pumpAndSettle();
    expect(find.text('出發時間表'), findsNothing);
    expect(find.text('線上報到'), findsOneWidget, reason: 'the check-in prompt still applies to every flight');
  });

  testWidgets('within 48 h of departure the page points to the airline\'s check-in; tapping opens its site', (tester) async {
    final actions = FakeExternalActions();
    await openDetail(tester, tokyo, actions: actions);
    await tester.scrollUntilVisible(find.textContaining('官網報到'), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.textContaining('前往 長榮航空 官網報到'));
    await tester.pump();
    expect(actions.opened.single.host, 'www.evaair.com');
  });

  testWidgets('a flight more than 48 h away shows no check-in prompt', (tester) async {
    await openDetail(tester, flight('BR198', 'TPE', 'NRT', DateTime.utc(2026, 12, 25, 10)));
    expect(find.text('線上報到'), findsNothing);
    expect(find.text('出發時間表'), findsOneWidget, reason: 'the leave-home plan is still shown');
  });

  testWidgets('trip details accept a per-flight journey time and store it', (tester) async {
    await openDetail(tester, flight('BR198', 'TPE', 'NRT', DateTime.utc(2026, 12, 20, 10)));
    await tester.scrollUntilVisible(find.text('編輯'), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('編輯'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, '到機場所需時間（分鐘）'), '90');
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    final trips = jsonDecode((await SharedPreferences.getInstance()).getString('aether.trips.v1')!) as Map<String, dynamic>;
    expect((trips['BR198-2026-12-20'] as Map)['travelMinutes'], 90);
  });
}
