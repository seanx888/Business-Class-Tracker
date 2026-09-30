import 'dart:convert';

import 'package:aethersky/data/stores.dart';
import 'package:aethersky/domain/documents.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support.dart';

final now = DateTime.utc(2026, 9, 30, 8);
DateTime clock() => now;
final overrides = [
  airportCountriesProvider.overrideWith((ref) async => {'TPE': 'TW', 'NRT': 'JP'}),
];

Flight tokyo() => Flight(
  id: 'BR198-2026-12-20',
  carrier: 'BR',
  number: '198',
  origin: const FlightEndpoint(iata: 'TPE', city: 'Taipei', timeZone: 'Asia/Taipei'),
  destination: const FlightEndpoint(iata: 'NRT', city: 'Tokyo', timeZone: 'Asia/Tokyo'),
  gateOut: FlightTime(scheduled: DateTime.utc(2026, 12, 20, 1)),
  gateIn: FlightTime(scheduled: DateTime.utc(2026, 12, 20, 4)),
);

Map<String, Object> seed({List<TravelDoc> docs = const [], bool flight = false}) => {
  if (docs.isNotEmpty) 'aether.docs.v1': jsonEncode(docs.map((d) => d.toJson()).toList()),
  if (flight) 'aether.flights.v1': jsonEncode([tokyo().toJson()]),
};

TravelDoc passport(DateTime expiry) => TravelDoc(id: 'p1', kind: DocKind.passport, holder: 'Sean', country: 'TW', expiry: expiry);

void main() {
  testWidgets('add a passport in the wallet → it is listed with days left and stored without any number', (tester) async {
    await pumpApp(tester, source: InertFlightSource(), clock: clock, overrides: overrides);
    await tester.tap(find.text('會員卡'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('新增證件'), 250, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('新增證件'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, '持有人'), 'Sean');
    await tester.enterText(find.widgetWithText(TextField, '國家代碼（2 碼，例 TW）'), 'tw');
    await tester.tap(find.text('到期日'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('確定'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.textContaining('護照 · Sean'), 250, scrollable: find.byType(Scrollable).last);
    expect(find.textContaining('護照 · Sean'), findsOneWidget);
    expect(find.textContaining('🇹🇼 TW'), findsOneWidget);
    expect(find.textContaining('天後到期'), findsOneWidget);
    final stored = jsonDecode((await SharedPreferences.getInstance()).getString('aether.docs.v1')!) as List;
    expect((stored.single as Map).keys.toSet(), {'id', 'kind', 'holder', 'country', 'expiry'});
    expect((stored.single as Map)['country'], 'TW');
  });

  testWidgets('a passport that does not cover a booked trip raises an alert on the flights page', (tester) async {
    await pumpApp(
      tester,
      source: InertFlightSource(),
      clock: clock,
      overrides: overrides,
      prefs: seed(docs: [passport(DateTime.utc(2027, 3, 1))], flight: true),
    );
    expect(find.textContaining('時效期不足 6 個月'), findsOneWidget);
    expect(find.textContaining('🇯🇵 JP'), findsOneWidget);
    expect(find.textContaining('BR198'), findsWidgets);
  });

  testWidgets('a passport that lapses before arrival is an error; tapping the alert opens the wallet', (tester) async {
    await pumpApp(
      tester,
      source: InertFlightSource(),
      clock: clock,
      overrides: overrides,
      prefs: seed(docs: [passport(DateTime.utc(2026, 12, 1))], flight: true),
    );
    expect(find.textContaining('前就會到期'), findsOneWidget);
    expect(find.byIcon(Icons.error_outline), findsOneWidget);
    await tester.tap(find.textContaining('前就會到期'));
    await tester.pumpAndSettle();
    expect(find.text('會員卡夾'), findsOneWidget);
  });

  testWidgets('a valid passport and no problems → no alert', (tester) async {
    await pumpApp(
      tester,
      source: InertFlightSource(),
      clock: clock,
      overrides: overrides,
      prefs: seed(docs: [passport(DateTime.utc(2032, 1, 1))], flight: true),
    );
    expect(find.textContaining('到期'), findsNothing);
    expect(find.text('證件'), findsNothing);
  });

  testWidgets('deleting a document removes it', (tester) async {
    await pumpApp(
      tester,
      source: InertFlightSource(),
      clock: clock,
      overrides: overrides,
      prefs: seed(docs: [passport(DateTime.utc(2032, 1, 1))]),
    );
    await tester.tap(find.text('會員卡'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.textContaining('護照 · Sean'), 250, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.descendant(of: find.widgetWithText(ListTile, '護照 · Sean'), matching: find.byIcon(Icons.delete_outline)));
    await tester.pumpAndSettle();
    expect(find.textContaining('護照 · Sean'), findsNothing);
    expect(find.text('還沒有證件'), findsOneWidget);
  });

  testWidgets('adding a membership through the dialog works and leaves no framework errors behind', (tester) async {
    await pumpApp(tester, source: InertFlightSource(), clock: clock, overrides: overrides);
    await tester.tap(find.text('會員卡'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('新增會員卡'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, '會員號碼'), 'ab123456');
    await tester.enterText(find.widgetWithText(TextField, '持卡人'), 'Sean');
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    expect(find.textContaining('6'), findsWidgets);
    expect(tester.takeException(), isNull);
    final stored = jsonDecode((await SharedPreferences.getInstance()).getString('aether.members.v1')!) as List;
    expect((stored.single as Map)['number'], 'ab123456');
    expect((stored.single as Map)['owner'], 'Sean');
  });
}
