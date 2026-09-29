import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support.dart';

http.Client faresClient() => MockClient((req) async {
  if (req.url.path.endsWith('trackers.json')) {
    return http.Response(
      jsonEncode({
        'trackers': {
          't1': {
            'def': {'o': 'TPE', 'd': 'CDG', 'depart': '2026-12-20', 'return': '2027-01-05', 'flex': 3, 'cabin': 'economy'},
            'status': 'tracking',
            'best': {'p': 41000, 'dep': '2026-12-22', 'ret': '2027-01-07', 'c': 'CI', 's': 0},
          },
        },
      }),
      200,
    );
  }
  return http.Response(
    jsonEncode({
      'deals': [
        {
          'id': 'd1',
          'origin': 'TPE',
          'destination': 'NRT',
          'priceTWD': 32000,
          'primaryCarrier': 'BR',
          'departDate': '2026-11-10',
          'returnDate': '2026-11-14',
          'stops': 0,
          'tier': 'hot',
          'score': 90,
          'alliance': 'STAR',
        },
      ],
    }),
    200,
  );
});

void main() {
  testWidgets('tapping a deal offers Google Flights / Skyscanner / KAYAK / the airline and opens the chosen link', (tester) async {
    final actions = FakeExternalActions();
    await pumpApp(tester, client: faresClient(), actions: actions);
    await tester.tap(find.text('票價'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('TPE → NRT'));
    await tester.pumpAndSettle();
    expect(find.text('Google Flights'), findsOneWidget);
    expect(find.text('Skyscanner'), findsOneWidget);
    expect(find.text('KAYAK'), findsOneWidget);
    expect(find.textContaining('航空公司官網'), findsOneWidget);

    await tester.tap(find.text('Skyscanner'));
    await tester.pumpAndSettle();
    expect(actions.opened.single.host, 'www.skyscanner.com.tw');
    expect(actions.opened.single.path, '/transport/flights/tpe/nrt/261110/261114/');
  });

  testWidgets('a Real Tracker opens Google Flights for its best dates and its own cabin', (tester) async {
    final actions = FakeExternalActions();
    await pumpApp(tester, client: faresClient(), actions: actions);
    await tester.tap(find.text('票價'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('TPE → CDG'));
    await tester.pumpAndSettle();
    expect(find.text('Skyscanner'), findsNothing, reason: 'non-business cabins are only honoured by Google Flights');
    await tester.tap(find.text('Google Flights'));
    await tester.pumpAndSettle();
    final q = actions.opened.single.queryParameters['q']!;
    expect(q, contains('from TPE to CDG on 2026-12-22 through 2027-01-07'));
    expect(q, contains('economy'));
  });

  testWidgets('a link that cannot be opened tells the user', (tester) async {
    final actions = FakeExternalActions()..canOpen = false;
    await pumpApp(tester, client: faresClient(), actions: actions);
    await tester.tap(find.text('票價'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('TPE → NRT'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('KAYAK'));
    await tester.pump();
    expect(find.text('無法開啟連結'), findsOneWidget);
    expect(find.byType(SnackBar), findsOneWidget);
  });
}
