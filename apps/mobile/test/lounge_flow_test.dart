import 'dart:convert';

import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/trip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

final now = DateTime.utc(2026, 12, 20, 2);

Flight flightOf(String carrier, String number) => Flight(
  id: '$carrier$number-2026-12-20',
  carrier: carrier,
  number: number,
  origin: const FlightEndpoint(iata: 'TPE', city: 'Taipei', timeZone: 'Asia/Taipei'),
  destination: const FlightEndpoint(iata: 'NRT', city: 'Tokyo', timeZone: 'Asia/Tokyo'),
  gateOut: FlightTime(scheduled: now.add(const Duration(hours: 4))),
  gateIn: FlightTime(scheduled: now.add(const Duration(hours: 7))),
);

Map<String, Object> seed(Flight f, {Cabin? cabin, List<Map<String, dynamic>> members = const []}) => {
  'aether.flights.v1': jsonEncode([f.toJson()]),
  if (cabin != null) 'aether.trips.v1': jsonEncode({f.id: TripInfo(cabin: cabin).toJson()}),
  if (members.isNotEmpty) 'aether.members.v1': jsonEncode(members),
};

Future<void> openFlight(WidgetTester tester, Flight f, Map<String, Object> prefs, {FakeExternalActions? actions}) async {
  await pumpApp(tester, prefs: prefs, clock: () => now, actions: actions, source: InertFlightSource());
  await tester.tap(find.text(f.ident).last);
  await tester.pumpAndSettle();
}

/// The flight page is a lazily-built list; bring a widget into view before asserting on it.
Future<void> reveal(WidgetTester tester, Finder f) async {
  await tester.scrollUntilVisible(f, 250, scrollable: find.byType(Scrollable).first);
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('business class on a Star Alliance airline → own lounge and alliance lounges are listed', (tester) async {
    final f = flightOf('BR', '198');
    await openFlight(tester, f, seed(f, cabin: Cabin.business));
    await reveal(tester, find.text('貴賓室資格'));
    expect(find.text('貴賓室資格'), findsOneWidget);
    expect(find.text('在 TPE 出發時'), findsOneWidget);
    expect(find.text('商務艙 · 長榮航空 自家貴賓室'), findsOneWidget);
    expect(find.text('商務艙 · 星空聯盟貴賓室'), findsOneWidget);
    expect(find.textContaining('依聯盟通則判斷'), findsOneWidget);
  });

  testWidgets('economy + Star Gold from the wallet → status access with a guest, naming the card', (tester) async {
    final f = flightOf('BR', '198');
    await openFlight(
      tester,
      f,
      seed(
        f,
        cabin: Cabin.economy,
        members: [
          {'id': 'a', 'program': 'BR', 'number': '1234567', 'tier': 'Gold'},
          {'id': 'b', 'program': 'CI', 'number': '7654321', 'tier': 'Emerald'},
        ],
      ),
    );
    await reveal(tester, find.text('貴賓室資格'));
    expect(find.textContaining('無限萬哩遊 Gold（Star Alliance Gold）· 星空聯盟貴賓室，可攜 1 位同行者'), findsOneWidget);
    expect(find.textContaining('華夏會員'), findsNothing, reason: 'a SkyTeam card does not open Star Alliance lounges');
  });

  testWidgets('no cabin yet → the card asks for it; setting the cabin turns the answer on', (tester) async {
    final f = flightOf('BR', '198');
    await openFlight(tester, f, seed(f));
    await reveal(tester, find.text('貴賓室資格'));
    expect(find.text('填寫艙等後，可判斷你能進哪些貴賓室。'), findsWidgets);
    expect(find.textContaining('自家貴賓室'), findsNothing);

    await tester.tap(find.widgetWithText(TextButton, '艙等'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('頭等艙'));
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();
    await reveal(tester, find.text('貴賓室資格'));
    expect(find.text('頭等艙 · 長榮航空 自家貴賓室'), findsOneWidget);
  });

  testWidgets('economy without status → says there is no automatic access; a tier-less card is flagged', (tester) async {
    final f = flightOf('BR', '198');
    await openFlight(
      tester,
      f,
      seed(
        f,
        cabin: Cabin.economy,
        members: [
          {'id': 'a', 'program': 'BR', 'number': '1234567'},
        ],
      ),
    );
    await reveal(tester, find.text('貴賓室資格'));
    expect(find.textContaining('沒有自動的貴賓室資格'), findsOneWidget);
    expect(find.textContaining('無限萬哩遊 尚未填寫等級'), findsOneWidget);
  });

  testWidgets('non-alliance airline says so; "Find lounges" opens a web search for the departure airport', (tester) async {
    final f = flightOf('JX', '800');
    final actions = FakeExternalActions();
    await openFlight(tester, f, seed(f, cabin: Cabin.business), actions: actions);
    await reveal(tester, find.text('貴賓室資格'));
    expect(find.text('商務艙 · 星宇航空 自家貴賓室'), findsOneWidget);
    expect(find.textContaining('不屬於任何聯盟'), findsOneWidget);
    await reveal(tester, find.text('查詢 TPE 貴賓室'));
    await tester.tap(find.text('查詢 TPE 貴賓室'));
    await tester.pump();
    expect(actions.opened.single.host, 'www.google.com');
    expect(actions.opened.single.queryParameters['q'], 'TPE airport lounge');
  });
}
