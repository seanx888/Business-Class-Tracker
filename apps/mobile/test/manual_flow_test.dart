import 'dart:convert';

import 'package:aethersky/data/stores.dart';
import 'package:aethersky/domain/geo.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support.dart';

DateTime clock() => DateTime(2026, 9, 30, 10);
final geo = {
  'TPE': const AirportGeo(25.08, 121.23, 'Taoyuan'),
  'NRT': const AirportGeo(35.77, 140.39, 'Narita'),
  'ICN': const AirportGeo(37.47, 126.45, 'Seoul'),
};
final overrides = [
  airportGeoProvider.overrideWith((ref) async => geo),
  airportCountriesProvider.overrideWith((ref) async => {'TPE': 'TW', 'NRT': 'JP', 'ICN': 'KR'}),
];

Future<void> openPassport(WidgetTester tester) async {
  await pumpApp(tester, source: InertFlightSource(), clock: clock, overrides: overrides);
  await tester.tap(find.byTooltip('飛行紀錄'));
  await tester.pumpAndSettle();
}

Future<void> fill(WidgetTester tester, {required String number, required String from, required String to}) async {
  await tester.enterText(find.widgetWithText(TextField, '航班號碼（例：BR198）'), number);
  await tester.enterText(find.widgetWithText(TextField, '出發機場代碼'), from);
  await tester.enterText(find.widgetWithText(TextField, '抵達機場代碼'), to);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('Passport is empty → add a past flight → it shows up in the stats and in Past flights', (tester) async {
    await openPassport(tester);
    expect(find.textContaining('完成第一趟追蹤的航班後'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, '補登過去航班'));
    await tester.pumpAndSettle();

    await fill(tester, number: 'br198', from: 'tpe', to: 'nrt');
    expect(find.text('Taoyuan'), findsOneWidget, reason: 'the airport is confirmed by name while typing');
    expect(find.text('Narita'), findsOneWidget);
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();

    expect(find.textContaining('完成第一趟追蹤的航班後'), findsNothing);
    expect(find.text('1'), findsWidgets, reason: 'one flight flown');
    expect(find.textContaining('km'), findsWidgets);
    final saved = jsonDecode((await SharedPreferences.getInstance()).getString('aether.flights.v1')!) as List;
    final f = saved.single as Map<String, dynamic>;
    expect(f['id'], startsWith('BR198-'));
    expect(f['source'], 'manual');
    expect((f['distanceKm'] as num), closeTo(2170, 30));
  });

  testWidgets('mistakes are explained and nothing is saved', (tester) async {
    await openPassport(tester);
    await tester.tap(find.widgetWithText(FilledButton, '補登過去航班'));
    await tester.pumpAndSettle();

    await fill(tester, number: '12345', from: 'TPE', to: 'NRT');
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    expect(find.textContaining('航空公司代碼'), findsWidgets);

    await fill(tester, number: 'BR198', from: 'TPE', to: 'XXX');
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    expect(find.text('找不到抵達機場代碼'), findsOneWidget);

    await fill(tester, number: 'BR198', from: 'TPE', to: 'TPE');
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    expect(find.text('出發與抵達機場不能相同'), findsOneWidget);
    expect((await SharedPreferences.getInstance()).getString('aether.flights.v1'), isNull);
  });

  testWidgets('"save & add another" keeps the sheet open and clears the fields', (tester) async {
    await openPassport(tester);
    await tester.tap(find.widgetWithText(FilledButton, '補登過去航班'));
    await tester.pumpAndSettle();
    await fill(tester, number: 'CI160', from: 'TPE', to: 'ICN');
    await tester.tap(find.text('儲存並再補一班'));
    await tester.pumpAndSettle();
    expect(find.text('已補登 CI160'), findsOneWidget);
    expect(tester.widget<TextField>(find.widgetWithText(TextField, '航班號碼（例：BR198）')).controller!.text, isEmpty);
    await fill(tester, number: 'KE692', from: 'ICN', to: 'TPE');
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    final saved = jsonDecode((await SharedPreferences.getInstance()).getString('aether.flights.v1')!) as List;
    expect(saved.map((f) => (f as Map)['id'].toString().split('-').first), unorderedEquals(['CI160', 'KE692']));
    expect(find.text('2'), findsWidgets, reason: 'two flights in the Passport');
  });

  testWidgets('a manual flight shows its day and route (no invented clock times) and opens a simple detail page', (tester) async {
    await pumpApp(tester, source: InertFlightSource(), clock: clock, overrides: overrides);
    await tester.tap(find.byTooltip('新增航班'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('或補登過去的航班'));
    await tester.pumpAndSettle();
    await fill(tester, number: 'BR198', from: 'TPE', to: 'NRT');
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.textContaining('已完成'), 250, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.textContaining('已完成'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('手動補登'), 250, scrollable: find.byType(Scrollable).first);
    expect(find.text('TPE → NRT'), findsOneWidget);
    await tester.tap(find.text('TPE → NRT'));
    await tester.pumpAndSettle();
    expect(find.text('Taoyuan – Narita'), findsOneWidget);
    expect(find.textContaining('（估算）'), findsNothing);
    expect(find.textContaining('(估算)'), findsOneWidget);
    expect(find.byTooltip('加入行事曆'), findsNothing, reason: 'no calendar entry for a flight without times');
    expect(find.text('我的行程資訊'), findsOneWidget);
  });
}
