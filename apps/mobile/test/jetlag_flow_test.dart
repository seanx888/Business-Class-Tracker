import 'dart:convert';

import 'package:aethersky/domain/flight.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

final now = DateTime.utc(2026, 12, 19, 2);

Flight flight(String ident, String tzFrom, String tzTo, DateTime dep, Duration block) => Flight(
  id: '$ident-2026-12-20',
  carrier: ident.substring(0, 2),
  number: ident.substring(2),
  origin: FlightEndpoint(iata: 'AAA', city: 'From', timeZone: tzFrom),
  destination: FlightEndpoint(iata: 'BBB', city: 'To', timeZone: tzTo),
  gateOut: FlightTime(scheduled: dep),
  gateIn: FlightTime(scheduled: dep.add(block)),
);

Future<void> open(WidgetTester tester, Flight f) async {
  await pumpApp(
    tester,
    prefs: {
      'aether.flights.v1': jsonEncode([f.toJson()]),
    },
    clock: () => now,
    source: InertFlightSource(),
  );
  await tester.tap(find.text(f.ident).last);
  await tester.pumpAndSettle();
}

Future<void> reveal(WidgetTester tester, Finder f) async {
  await tester.scrollUntilVisible(f, 250, scrollable: find.byType(Scrollable).first);
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('Taipei → Los Angeles: an 8-hour shift with the full plan', (tester) async {
    // 23:30 in Taipei, lands 19:30 Los Angeles time (03:30 UTC next day)
    await open(
      tester,
      flight('JX002', 'Asia/Taipei', 'America/Los_Angeles', DateTime.utc(2026, 12, 20, 15, 30), const Duration(hours: 12)),
    );
    await reveal(tester, find.text('時差調整'));
    expect(find.text('往東 8 小時時差 · 約需 8 天適應'), findsOneWidget);
    expect(find.textContaining('出發前 3 天起，每天把就寢與起床時間提早 1 小時'), findsOneWidget);
    expect(find.textContaining('抵達時已近當地夜晚'), findsOneWidget, reason: 'lands 19:30 local');
    expect(find.textContaining('早上 10 點前避免強光'), findsOneWidget);
    expect(find.textContaining('非醫療意見'), findsOneWidget);
  });

  testWidgets('Paris → Taipei flies east 7 h: morning light and stay-awake advice for a morning landing', (tester) async {
    // Paris (+1 in winter) 09:00 → Taipei (+8): lands 06:30 Taipei next morning
    await open(
      tester,
      flight('BR088', 'Europe/Paris', 'Asia/Taipei', DateTime.utc(2026, 12, 19, 8), const Duration(hours: 14, minutes: 30)),
    );
    await reveal(tester, find.text('時差調整'));
    expect(find.textContaining('往東 7 小時時差'), findsOneWidget);
    expect(find.textContaining('早上多曬太陽'), findsOneWidget);
    expect(find.textContaining('抵達後撐到當地就寢時間'), findsOneWidget);
  });

  testWidgets('Taipei → Paris (west, 7 h): evening light', (tester) async {
    await open(tester, flight('BR087', 'Asia/Taipei', 'Europe/Paris', DateTime.utc(2026, 12, 19, 16), const Duration(hours: 14)));
    await reveal(tester, find.text('時差調整'));
    expect(find.textContaining('往西 7 小時時差 · 約需 5 天適應'), findsOneWidget);
    expect(find.textContaining('每天把就寢與起床時間延後 1 小時'), findsOneWidget);
    expect(find.textContaining('傍晚到入夜前多接觸明亮光線'), findsOneWidget);
  });

  testWidgets('a 1-hour shift (Taipei → Tokyo) shows no jet-lag card', (tester) async {
    await open(tester, flight('BR198', 'Asia/Taipei', 'Asia/Tokyo', DateTime.utc(2026, 12, 19, 22), const Duration(hours: 3)));
    await tester.scrollUntilVisible(find.text('機型'), 250, scrollable: find.byType(Scrollable).first);
    expect(find.text('時差調整'), findsNothing);
  });
}
