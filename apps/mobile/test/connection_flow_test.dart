import 'dart:convert';

import 'package:aethersky/data/stores.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

final now = DateTime.utc(2026, 12, 20, 2);
DateTime at(int h, [int m = 0]) => DateTime.utc(2026, 12, 20, h, m);

Flight leg(
  String carrier,
  String number,
  String from,
  String to,
  DateTime out,
  DateTime into, {
  DateTime? inEst,
  String? toTerm,
  String? fromTerm,
}) => Flight(
  id: '$carrier$number-2026-12-20',
  carrier: carrier,
  number: number,
  origin: FlightEndpoint(iata: from, city: from, timeZone: 'Asia/Taipei', terminal: fromTerm),
  destination: FlightEndpoint(iata: to, city: to, timeZone: 'Asia/Tokyo', terminal: toTerm),
  gateOut: FlightTime(scheduled: out),
  gateIn: FlightTime(scheduled: into, estimated: inEst),
);

Map<String, Object> seed(List<Flight> f) => {'aether.flights.v1': jsonEncode(f.map((x) => x.toJson()).toList())};
final overrides = [
  airportCountriesProvider.overrideWith((ref) async => {'TPE': 'TW', 'NRT': 'JP', 'LAX': 'US'}),
];

Future<void> open(WidgetTester tester, List<Flight> flights) =>
    pumpApp(tester, prefs: seed(flights), clock: () => now, source: InertFlightSource(), overrides: overrides);

void main() {
  testWidgets('a comfortable connection shows a chip between the two flights', (tester) async {
    await open(tester, [leg('BR', '198', 'TPE', 'NRT', at(3), at(6)), leg('BR', '6', 'NRT', 'LAX', at(9), at(20))]);
    expect(find.textContaining('在 NRT 轉機 · 3 小時'), findsOneWidget, reason: 'one chip, no top alert for a comfortable connection');
    expect(find.textContaining('時間充裕'), findsOneWidget);
  });

  testWidgets('a tight connection with a terminal change says why', (tester) async {
    await open(tester, [
      leg('BR', '198', 'TPE', 'NRT', at(3), at(6), toTerm: '2'),
      leg('BR', '6', 'NRT', 'LAX', at(7, 45), at(20), fromTerm: '1'),
    ]);
    expect(find.textContaining('在 NRT 轉機 · 1 小時 45 分'), findsOneWidget);
    expect(find.textContaining('時間偏緊'), findsOneWidget);
    expect(find.text('需換航廈 T2 → T1'), findsOneWidget);
  });

  testWidgets('a delay that makes the connection critical raises an alert at the top as well', (tester) async {
    await open(tester, [leg('BR', '198', 'TPE', 'NRT', at(3), at(6), inEst: at(7, 30)), leg('BR', '6', 'NRT', 'LAX', at(8), at(20))]);
    expect(find.textContaining('在 NRT 轉機 · 30 分'), findsNWidgets(2), reason: 'top alert + the chip between the cards');
    expect(find.textContaining('非常趕'), findsNWidgets(2));
    expect(find.text('延誤已讓轉機縮短 1 小時 30 分'), findsNWidgets(2));
    expect(find.text('下機後直奔登機門；不確定就先向地勤確認。'), findsNWidgets(2));
  });

  testWidgets('a merely tight connection is only shown between the cards', (tester) async {
    await open(tester, [leg('BR', '198', 'TPE', 'NRT', at(3), at(6), inEst: at(7, 10)), leg('BR', '6', 'NRT', 'LAX', at(8), at(20))]);
    expect(find.textContaining('在 NRT 轉機 · 50 分'), findsOneWidget);
    expect(find.textContaining('時間偏緊'), findsOneWidget);
  });

  testWidgets('a missed connection is called out with advice', (tester) async {
    await open(tester, [leg('BR', '198', 'TPE', 'NRT', at(3), at(6), inEst: at(9)), leg('BR', '6', 'NRT', 'LAX', at(8), at(20))]);
    expect(find.textContaining('已來不及'), findsWidgets);
    expect(find.textContaining('請儘快聯絡航空公司改訂'), findsWidgets);
  });

  testWidgets('unrelated flights (different airports) get no connection chip', (tester) async {
    await open(tester, [leg('BR', '198', 'TPE', 'NRT', at(3), at(6)), leg('CI', '100', 'TPE', 'LAX', at(9), at(20))]);
    expect(find.textContaining('轉機'), findsNothing);
  });

  testWidgets('the flight page shows the connection it belongs to', (tester) async {
    await open(tester, [leg('BR', '198', 'TPE', 'NRT', at(3), at(6)), leg('BR', '6', 'NRT', 'LAX', at(9), at(20))]);
    await tester.tap(find.text('BR198').last);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.textContaining('在 NRT 轉機 · 3 小時'), 250, scrollable: find.byType(Scrollable).last);
    expect(find.textContaining('在 NRT 轉機 · 3 小時'), findsWidgets);
  });
}
