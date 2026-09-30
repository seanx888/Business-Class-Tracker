import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support.dart';

Future<void> openSettings(WidgetTester tester, {Map<String, Object> prefs = const {}}) async {
  await pumpApp(tester, source: InertFlightSource(), clock: () => DateTime.utc(2026, 12, 20, 4), prefs: prefs);
  await tester.tap(find.byTooltip('設定'));
  await tester.pumpAndSettle();
}

Future<Map<String, dynamic>> stored() async =>
    jsonDecode((await SharedPreferences.getInstance()).getString('aether.settings.v1')!) as Map<String, dynamic>;

void main() {
  testWidgets('settings open from the flights page with the defaults', (tester) async {
    await openSettings(tester);
    expect(find.text('語言'), findsOneWidget);
    expect(find.text('60 分鐘'), findsOneWidget, reason: 'journey to the airport');
    expect(find.text('180 分鐘'), findsOneWidget, reason: 'international buffer');
    expect(find.text('120 分鐘'), findsOneWidget, reason: 'domestic buffer');
  });

  testWidgets('the steppers change the numbers in steps and persist them', (tester) async {
    await openSettings(tester);
    final plus = find.byTooltip('+');
    await tester.tap(plus.first);
    await tester.pumpAndSettle();
    expect(find.text('65 分鐘'), findsOneWidget);
    await tester.tap(plus.at(1));
    await tester.pumpAndSettle();
    expect(find.text('195 分鐘'), findsOneWidget);
    await tester.tap(find.byTooltip('−').at(2));
    await tester.pumpAndSettle();
    expect(find.text('105 分鐘'), findsOneWidget);
    final s = await stored();
    expect(s['travelMinutes'], 65);
    expect(s['bufferInternationalMinutes'], 195);
    expect(s['bufferDomesticMinutes'], 105);
  });

  testWidgets('the steppers stop at their limits', (tester) async {
    await openSettings(
      tester,
      prefs: {
        'aether.settings.v1': jsonEncode({'travelMinutes': 15}),
      },
    );
    expect(tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.remove_circle_outline).first).onPressed, isNull);
  });

  testWidgets('choosing a language switches the whole app at once, and the choice is remembered', (tester) async {
    await openSettings(tester);
    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Language'), findsOneWidget);
    expect(find.text('60 min'), findsOneWidget);
    expect((await stored())['language'], 'en');

    await tester.tap(find.text('한국어'));
    await tester.pumpAndSettle();
    expect(find.text('설정'), findsOneWidget);
    expect(find.text('60분'), findsOneWidget);

    await tester.tap(find.text('繁體中文'));
    await tester.pumpAndSettle();
    expect(find.text('設定'), findsWidgets);
  });

  testWidgets('a saved language is applied on launch, overriding the phone language', (tester) async {
    await pumpApp(
      tester,
      source: InertFlightSource(),
      clock: () => DateTime.utc(2026, 12, 20, 4),
      prefs: {
        'aether.settings.v1': jsonEncode({'language': 'ko'}),
      },
    );
    expect(find.text('내 항공편').evaluate().isNotEmpty || find.text('예정된 항공편').evaluate().isNotEmpty, isTrue);
    expect(find.text('即將出發'), findsNothing);
  });

  testWidgets('a corrupt settings file falls back to the defaults instead of breaking the app', (tester) async {
    await pumpApp(
      tester,
      source: InertFlightSource(),
      clock: () => DateTime.utc(2026, 12, 20, 4),
      prefs: {'aether.settings.v1': '{not json'},
    );
    expect(find.text('即將出發'), findsOneWidget);
  });
}
