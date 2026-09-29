import 'dart:convert';

import 'package:aethersky/data/flight_repository.dart';
import 'package:aethersky/data/stores.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/trip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support.dart';

final now = DateTime.utc(2026, 12, 20, 12);
DateTime clock() => now;

Flight mk(String id, String number, DateTime dep, {Duration? landedAgo, Duration block = const Duration(hours: 3)}) {
  final arr = dep.add(block);
  final landed = landedAgo == null ? null : now.subtract(landedAgo);
  return Flight(
    id: id,
    carrier: 'BR',
    number: number,
    origin: const FlightEndpoint(iata: 'TPE', city: 'Taipei', timeZone: 'Asia/Taipei'),
    destination: const FlightEndpoint(iata: 'NRT', city: 'Tokyo', timeZone: 'Asia/Tokyo'),
    gateOut: FlightTime(scheduled: dep, actual: landed == null ? null : dep),
    takeoff: FlightTime(scheduled: dep, actual: landed == null ? null : dep),
    landing: FlightTime(scheduled: arr, actual: landed),
    gateIn: FlightTime(scheduled: arr, actual: landed),
  );
}

Map<String, Object> seed(List<Flight> flights, {Map<String, Object> extra = const {}}) => {
  'aether.flights.v1': jsonEncode(flights.map((f) => f.toJson()).toList()),
  ...extra,
};

/// Counts refreshes so the auto-refresh policy can be asserted.
class CountingSource implements FlightDataSource {
  final refreshed = <String>[];

  @override
  Future<Flight?> lookup(String carrier, String number, DateTime date) async => null;

  @override
  Future<Flight?> refresh(Flight flight) async {
    refreshed.add(flight.id);
    return flight;
  }
}

void main() {
  final soon = mk('BR198-soon', '198', now.add(const Duration(hours: 3, minutes: 20)));
  final far = mk('BR12-far', '12', now.add(const Duration(days: 9)));
  final done = mk('BR7-done', '7', now.subtract(const Duration(days: 6)), landedAgo: const Duration(days: 6));

  testWidgets('next-flight countdown on top; Past flights collapsed until opened', (tester) async {
    await pumpApp(tester, prefs: seed([far, done, soon]), clock: clock, source: CountingSource());
    expect(find.text('下一班'), findsOneWidget);
    expect(find.text('3 小時 20 分後起飛'), findsOneWidget);
    expect(find.text('即將出發'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('已完成 (1)'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('BR7'), findsNothing, reason: 'past flights start collapsed');

    await tester.tap(find.text('已完成 (1)'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('BR7'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('BR7'), findsOneWidget);
  });

  testWidgets('only past flights → empty upcoming state, no next-flight banner', (tester) async {
    await pumpApp(tester, prefs: seed([done]), clock: clock, source: CountingSource());
    expect(find.text('下一班'), findsNothing);
    expect(find.text('還沒有追蹤的航班'), findsOneWidget);
    expect(find.text('已完成 (1)'), findsOneWidget);
  });

  testWidgets('opening the app refreshes only flights that matter (leaving within 2 days / under way)', (tester) async {
    final source = CountingSource();
    await pumpApp(tester, prefs: seed([far, done, soon]), clock: clock, source: source);
    expect(source.refreshed, ['BR198-soon']);
  });

  testWidgets('pull-to-refresh forces every unfinished flight (not the finished ones)', (tester) async {
    final source = CountingSource();
    await pumpApp(tester, prefs: seed([far, done, soon]), clock: clock, source: source);
    source.refreshed.clear();
    await tester.fling(find.byType(ListView).first, const Offset(0, 400), 1000);
    await tester.pumpAndSettle();
    expect(source.refreshed.toSet(), {'BR198-soon', 'BR12-far'});
  });

  testWidgets('trip details: set cabin / seat / booking ref, see them on the card, and they survive a restart', (tester) async {
    await pumpApp(tester, prefs: seed([soon]), clock: clock, source: CountingSource());
    await tester.tap(find.text('BR198').last);
    await tester.pumpAndSettle();
    expect(find.text('填寫艙等後，可判斷你能進哪些貴賓室。'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('編輯'), 300, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('編輯'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('商務艙'));
    await tester.enterText(find.widgetWithText(TextField, '座位'), ' 12a ');
    await tester.enterText(find.widgetWithText(TextField, '訂位代號'), 'k7xq2p');
    await tester.tap(find.text('儲存'));
    await tester.pumpAndSettle();

    expect(find.text('商務艙'), findsOneWidget);
    expect(find.text('12A'), findsOneWidget);
    expect(find.text('K7XQ2P'), findsOneWidget);
    expect(find.text('填寫艙等後，可判斷你能進哪些貴賓室。'), findsNothing);

    final saved = jsonDecode((await SharedPreferences.getInstance()).getString('aether.trips.v1')!) as Map<String, dynamic>;
    expect(saved['BR198-soon'], {'cabin': 'business', 'seat': '12A', 'pnr': 'K7XQ2P'});
  });

  test('removing a flight also forgets its trip details; server refreshes never touch them', () async {
    SharedPreferences.setMockInitialValues({});
    final container = ProviderContainer(overrides: [prefsProvider.overrideWithValue(await SharedPreferences.getInstance())]);
    addTearDown(container.dispose);
    final flights = container.read(myFlightsProvider.notifier);
    final trips = container.read(tripInfosProvider.notifier);

    flights.upsert(soon);
    trips.set(soon.id, TripInfo.clean(cabin: Cabin.business, seat: '2a'));
    flights.upsert(mk(soon.id, '198', now.add(const Duration(hours: 4)))); // a server refresh replaces the flight…
    expect(container.read(tripInfosProvider)[soon.id]?.seat, '2A', reason: '…but not what the traveller typed');

    trips.set(soon.id, const TripInfo()); // clearing every field removes the entry
    expect(container.read(tripInfosProvider), isEmpty);
    trips.set(soon.id, TripInfo.clean(seat: '3C'));
    flights.remove(soon.id);
    expect(container.read(tripInfosProvider), isEmpty);
  });
}
