import 'dart:convert';

import 'package:aethersky/app.dart';
import 'package:aethersky/data/flight_repository.dart';
import 'package:aethersky/data/stores.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> pumpApp(WidgetTester tester, {http.Client? client}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  await initializeDateFormatting();
  await tester.binding.setSurfaceSize(const Size(420, 900));
  // The app's primary language is Traditional Chinese.
  tester.platformDispatcher.localesTestValue = const [Locale('zh', 'TW')];
  addTearDown(tester.platformDispatcher.clearLocalesTestValue);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      prefsProvider.overrideWithValue(prefs),
      flightSourceProvider.overrideWithValue(DemoFlightDataSource()),
      if (client != null) httpClientProvider.overrideWithValue(client),
    ],
    child: const AetherApp(),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('empty state → add a demo flight → it appears in My flights', (tester) async {
    await pumpApp(tester);
    expect(find.text('ÆtherSky'), findsWidgets);
    expect(find.text('還沒有追蹤的航班'), findsOneWidget);

    await tester.tap(find.widgetWithText(ActionChip, 'BR198'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, '查詢'));
    await tester.pumpAndSettle();
    expect(find.text('TPE'), findsWidgets);
    await tester.tap(find.text('加入追蹤'));
    await tester.pumpAndSettle();

    expect(find.text('還沒有追蹤的航班'), findsNothing);
    expect(find.text('BR198'), findsOneWidget);

    await tester.tap(find.text('BR198'));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.arrow_forward), findsOneWidget);
    expect(find.text('NRT'), findsWidgets);
    expect(find.text('機型'), findsOneWidget);
    expect(find.textContaining('起飛'), findsOneWidget);
  });

  testWidgets('bad flight number shows a hint', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.byTooltip('新增航班'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '12345');
    await tester.tap(find.widgetWithText(FilledButton, '查詢'));
    await tester.pumpAndSettle();
    expect(find.textContaining('航空公司代碼'), findsOneWidget);
  });

  testWidgets('fares tab shows Real Tracker results from the scanner files', (tester) async {
    final client = MockClient((req) async {
      if (req.url.path.endsWith('trackers.json')) {
        return http.Response(
          jsonEncode({
            'trackers': {
              't1': {
                'def': {'o': 'TPE', 'd': 'CDG', 'depart': '2026-12-20', 'return': '2027-01-05', 'flex': 3},
                'status': 'tracking',
                'best': {'p': 98000, 'dep': '2026-12-20', 'ret': '2027-01-05', 'c': 'CI', 's': 0},
                'history': [['2026-09-27', 100000], ['2026-09-28', 98000]],
              },
            },
          }),
          200,
        );
      }
      return http.Response(jsonEncode({'isDemo': true, 'deals': []}), 200);
    });
    await pumpApp(tester, client: client);
    await tester.tap(find.text('票價'));
    await tester.pumpAndSettle();
    expect(find.text('TPE → CDG'), findsOneWidget);
    expect(find.text(r'NT$98,000'), findsOneWidget);
    expect(find.textContaining('較前次'), findsOneWidget);
  });

  testWidgets('wallet and plans tabs render', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.text('會員卡'));
    await tester.pumpAndSettle();
    expect(find.text('還沒有會員卡'), findsOneWidget);
    await tester.tap(find.text('方案'));
    await tester.pumpAndSettle();
    expect(find.text('Elite'), findsWidgets);
    expect(find.textContaining('119.99'), findsOneWidget);
  });
}
