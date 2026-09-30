import 'dart:convert';

import 'package:aethersky/data/photo_service.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/trip.dart';
import 'package:aethersky/features/logbook/log_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support.dart';

final now = DateTime.utc(2027, 3, 1);

Flight flown(String carrier, String number, String from, String to, DateTime dep, {int? km, int minutes = 180, String? type}) {
  final arr = dep.add(Duration(minutes: minutes));
  return Flight(
    id: '$carrier$number-${dep.toIso8601String().substring(0, 10)}',
    carrier: carrier,
    number: number,
    origin: FlightEndpoint(iata: from, timeZone: 'Asia/Taipei', city: from),
    destination: FlightEndpoint(iata: to, city: to),
    gateOut: FlightTime(scheduled: dep, actual: dep),
    takeoff: FlightTime(actual: dep),
    landing: FlightTime(actual: arr),
    gateIn: FlightTime(scheduled: arr, actual: arr),
    distanceKm: km,
    aircraftType: type,
  );
}

final flights = [
  flown('BR', '198', 'TPE', 'NRT', DateTime.utc(2026, 3, 10, 1), km: 2190, type: 'A333'),
  flown('BR', '197', 'NRT', 'TPE', DateTime.utc(2026, 3, 14, 6), km: 2190),
  flown('CI', '160', 'TPE', 'ICN', DateTime.utc(2026, 3, 30, 2), km: 1480),
  flown('BR', '12', 'TPE', 'NRT', DateTime.utc(2025, 11, 5, 1), km: 2190),
];

Map<String, Object> seed({Map<String, TripInfo> infos = const {}, List<Flight>? list}) => {
  'aether.flights.v1': jsonEncode((list ?? flights).map((f) => f.toJson()).toList()),
  if (infos.isNotEmpty) 'aether.trips.v1': jsonEncode({for (final e in infos.entries) e.key: e.value.toJson()}),
};

Future<void> openLogbook(
  WidgetTester tester, {
  Map<String, TripInfo> infos = const {},
  List<Flight>? list,
  FakePhotoService? photos,
  FakeExternalActions? actions,
}) async {
  await pumpApp(
    tester,
    prefs: seed(infos: infos, list: list),
    clock: () => now,
    source: InertFlightSource(),
    actions: actions,
    overrides: [photoServiceProvider.overrideWithValue(photos ?? FakePhotoService())],
  );
  await tester.tap(find.byTooltip('飛行紀錄'));
  await tester.pumpAndSettle();
  await tester.tap(find.byTooltip('飛行日誌'));
  await tester.pumpAndSettle();
}

Future<void> tapVisible(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

/// The Past group of the flights list starts collapsed.
Future<void> expandPast(WidgetTester tester) async {
  await tester.tap(find.textContaining('(4)'));
  await tester.pumpAndSettle();
}

Future<Map<String, dynamic>> storedTrips() async {
  final raw = (await SharedPreferences.getInstance()).getString('aether.trips.v1');
  return raw == null ? {} : jsonDecode(raw) as Map<String, dynamic>;
}

String id198 = flights[0].id;

void main() {
  testWidgets('entries are grouped by year, newest first, and show what was recorded', (tester) async {
    final infos = {
      id198: TripInfo(
        cabin: Cabin.business,
        log: FlightLog.clean(ratings: {RatingAspect.overall: 4}, experience: 'Nice crew', photos: ['a.jpg']),
      ),
    };
    await openLogbook(tester, infos: infos);
    expect(find.text('2026'), findsOneWidget);
    expect(find.text('2025'), findsOneWidget);
    expect(find.text('3 班'), findsOneWidget, reason: 'three flights in 2026');
    final cal = tester.getTopLeft(find.text('CI160  TPE to ICN')).dy;
    final br197 = tester.getTopLeft(find.text('BR197  NRT to TPE')).dy;
    final br198 = tester.getTopLeft(find.text('BR198  TPE to NRT')).dy;
    final br12 = tester.getTopLeft(find.text('BR12  TPE to NRT')).dy;
    expect(cal, lessThan(br197));
    expect(br197, lessThan(br198));
    expect(br198, lessThan(br12));
    expect(find.textContaining('Airbus A330-300  ·  商務艙'), findsOneWidget, reason: 'the reported aircraft and the cabin');
    expect(find.bySemanticsLabel(RegExp('整體 4 / 5')), findsOneWidget);
    expect(find.byIcon(Icons.photo_outlined), findsOneWidget);
    expect(find.byIcon(Icons.notes), findsOneWidget);
  });

  testWidgets('an empty logbook says how it fills up and offers to add a past flight', (tester) async {
    await openLogbook(tester, list: const []);
    expect(find.text('還沒有搭乘紀錄'), findsOneWidget);
    expect(find.text('補登過去航班'), findsWidgets);
    expect(find.byTooltip('匯出 CSV'), findsNothing);
  });

  testWidgets('recording a flight: aircraft, cabin, purpose, ratings and a review are saved with the trip', (tester) async {
    await openLogbook(tester);
    await tester.tap(find.text('BR197  NRT to TPE'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'b78x');
    await tester.pumpAndSettle();
    expect(find.text('Boeing 787-10'), findsOneWidget, reason: 'the typed designator is spelled out');
    await tester.enterText(find.byType(TextField).at(1), 'b-17801');
    await tapVisible(tester, find.widgetWithText(ChoiceChip, '商務艙'));
    await tapVisible(tester, find.widgetWithText(ChoiceChip, '商務'));
    await tapVisible(tester, find.byTooltip('整體 4 星'));
    await tapVisible(tester, find.byTooltip('餐點 2 星'));
    await tester.enterText(find.byType(TextField).at(2), 'Great crew, the beef was cold.');
    await tapVisible(tester, find.text('儲存紀錄'));

    final saved = (await storedTrips())[flights[1].id] as Map<String, dynamic>;
    expect(saved['cabin'], 'business');
    final log = saved['log'] as Map<String, dynamic>;
    expect(log['aircraftType'], 'B78X');
    expect(log['registration'], 'B-17801');
    expect(log['purpose'], 'business');
    expect(log['ratings'], {'overall': 4, 'food': 2});
    expect(log['experience'], 'Great crew, the beef was cold.');
    expect(find.textContaining('Boeing 787-10  ·  商務艙'), findsOneWidget, reason: 'the list already reflects it');
  });

  testWidgets('tapping the same star again clears that rating; other fields of the trip are kept', (tester) async {
    final infos = {
      flights[1].id: TripInfo(
        seat: '12A',
        pnr: 'K7XQ2P',
        notes: 'aisle',
        log: FlightLog.clean(ratings: {RatingAspect.seat: 3}),
      ),
    };
    await openLogbook(tester, infos: infos);
    await tester.tap(find.text('BR197  NRT to TPE'));
    await tester.pumpAndSettle();
    await tapVisible(tester, find.byTooltip('座位 3 星'));
    await tapVisible(tester, find.text('儲存紀錄'));
    final saved = (await storedTrips())[flights[1].id] as Map<String, dynamic>;
    expect(saved['seat'], '12A');
    expect(saved['pnr'], 'K7XQ2P');
    expect(saved['notes'], 'aisle');
    expect(saved.containsKey('log'), isFalse, reason: 'nothing left to log');
  });

  testWidgets('photos: added from the camera, kept on save, and the choice of source is honoured', (tester) async {
    final photos = FakePhotoService(next: ['meal.jpg']);
    await openLogbook(tester, photos: photos);
    await tester.tap(find.text('BR197  NRT to TPE'));
    await tester.pumpAndSettle();
    expect(find.text('照片只存在這支手機，不會上傳。'), findsOneWidget);
    await tapVisible(tester, find.text('加入照片'));
    await tester.tap(find.text('拍照'));
    await tester.pumpAndSettle();
    expect(photos.sources, [PhotoSource.camera]);
    expect(find.byType(PhotoThumb), findsOneWidget);
    await tapVisible(tester, find.text('儲存紀錄'));
    final log = ((await storedTrips())[flights[1].id] as Map<String, dynamic>)['log'] as Map<String, dynamic>;
    expect(log['photos'], ['meal.jpg']);
    expect(photos.deleted, isEmpty);
  });

  testWidgets('removing a photo can be undone, and is final only after saving', (tester) async {
    final photos = FakePhotoService()..stored.addAll(['a.jpg', 'b.jpg']);
    final infos = {
      flights[1].id: TripInfo(log: FlightLog.clean(photos: ['a.jpg', 'b.jpg'])),
    };
    await openLogbook(tester, infos: infos, photos: photos);
    await tester.tap(find.text('BR197  NRT to TPE'));
    await tester.pumpAndSettle();
    await tapVisible(tester, find.byTooltip('移除照片').first);
    expect(find.text('已移除 1 張照片'), findsOneWidget);
    expect(find.byTooltip('移除照片'), findsOneWidget);
    await tapVisible(tester, find.text('復原'));
    expect(find.byTooltip('移除照片'), findsNWidgets(2));
    expect(photos.deleted, isEmpty);

    await tapVisible(tester, find.byTooltip('移除照片').last);
    await tapVisible(tester, find.text('儲存紀錄'));
    expect(photos.deleted, ['b.jpg']);
    final log = ((await storedTrips())[flights[1].id] as Map<String, dynamic>)['log'] as Map<String, dynamic>;
    expect(log['photos'], ['a.jpg']);
  });

  testWidgets('dismissing the sheet without saving throws away photos added meanwhile and keeps the old entry', (tester) async {
    final photos = FakePhotoService(next: ['new.jpg']);
    await openLogbook(tester, photos: photos);
    await tester.tap(find.text('BR197  NRT to TPE'));
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('加入照片'));
    await tester.tap(find.text('從相簿選擇'));
    await tester.pumpAndSettle();
    expect(photos.stored, {'new.jpg'});
    Navigator.of(tester.element(find.text('儲存紀錄'))).pop(); // what tapping the scrim or the back button does
    await tester.pumpAndSettle();
    expect(find.text('儲存紀錄'), findsNothing);
    expect(photos.deleted, ['new.jpg']);
    expect(await storedTrips(), isEmpty);
  });

  testWidgets('without photo storage (web) the sheet says so instead of offering a button', (tester) async {
    await openLogbook(tester, photos: FakePhotoService(available: false));
    await tester.tap(find.text('BR197  NRT to TPE'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('照片功能僅限手機 App。'));
    expect(find.text('照片功能僅限手機 App。'), findsOneWidget);
    expect(find.text('加入照片'), findsNothing);
  });

  testWidgets('statistics: airlines, aircraft types, cabins, purposes, average ratings', (tester) async {
    final infos = {
      id198: TripInfo(
        cabin: Cabin.business,
        log: FlightLog.clean(purpose: TripPurpose.business, ratings: {RatingAspect.overall: 5, RatingAspect.food: 3}, photos: ['a.jpg']),
      ),
      flights[1].id: TripInfo(
        cabin: Cabin.economy,
        log: FlightLog.clean(aircraftType: 'B789', ratings: {RatingAspect.overall: 4}, experience: 'ok'),
      ),
    };
    await openLogbook(tester, infos: infos);
    await tester.tap(find.text('統計'));
    await tester.pumpAndSettle();
    expect(find.text('4'), findsWidgets, reason: 'flights');
    expect(find.text('8,050 km'), findsOneWidget);
    expect(find.text('2 趟寫了心得或評分  ·  1 張照片'), findsOneWidget);
    expect(find.text('長榮航空'), findsOneWidget);
    expect(find.text('BR'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('(2)'), 300, scrollable: find.byType(Scrollable).last);
    expect(find.text('Airbus A330-300'), findsOneWidget);
    expect(find.text('Boeing 787-9'), findsOneWidget);
    expect(find.text('商務艙'), findsOneWidget);
    expect(find.text('經濟艙'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('整體 4.5 / 5')), findsOneWidget);
  });

  testWidgets('CSV export hands the whole logbook to the share sheet as a file', (tester) async {
    final actions = FakeExternalActions();
    await openLogbook(
      tester,
      actions: actions,
      infos: {
        id198: TripInfo(
          cabin: Cabin.first,
          log: FlightLog.clean(experience: 'Suite, "wow"'),
        ),
      },
    );
    await tester.tap(find.byTooltip('匯出 CSV'));
    await tester.pumpAndSettle();
    final shared = actions.shared.single;
    expect(shared.fileName, 'aethersky-logbook.csv');
    expect(shared.fileText!.startsWith('﻿Date,Flight'), isTrue);
    expect(shared.fileText, contains('BR198,EVA Air,TPE,NRT,2190,A333,,first'));
    expect(shared.fileText, contains('"Suite, ""wow"""'));
    expect(shared.fileText!.split('\r\n').length, 6, reason: 'header, four flights and the final line break');
  });

  testWidgets('a finished flight shows its log card; an empty one invites filling it in', (tester) async {
    await pumpApp(
      tester,
      prefs: seed(),
      clock: () => now,
      source: InertFlightSource(),
      overrides: [photoServiceProvider.overrideWithValue(FakePhotoService())],
    );
    await expandPast(tester);
    await tapVisible(tester, find.text('BR198').last);
    await tester.scrollUntilVisible(find.text('補上評分與心得'), 300, scrollable: find.byType(Scrollable).last);
    await tapVisible(tester, find.text('補上評分與心得'));
    expect(find.text('儲存紀錄'), findsOneWidget);
    expect(find.text('資料來源顯示：A333'), findsOneWidget);
  });

  testWidgets('removing a flight by swipe can be undone with the entry it carried', (tester) async {
    final photos = FakePhotoService();
    final infos = {
      id198: TripInfo(
        cabin: Cabin.business,
        log: FlightLog.clean(experience: 'Keep me', photos: ['keep.jpg']),
      ),
    };
    await pumpApp(
      tester,
      prefs: seed(infos: infos),
      clock: () => now,
      source: InertFlightSource(),
      overrides: [photoServiceProvider.overrideWithValue(photos)],
    );
    await expandPast(tester);
    await tester.ensureVisible(find.text('BR198').last);
    await tester.pumpAndSettle();
    await tester.drag(find.text('BR198').last, const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(find.text('已移除 BR198'), findsOneWidget);
    expect(await storedTrips(), isEmpty);
    await tester.tap(find.text('復原'));
    await tester.pumpAndSettle();
    expect(find.text('BR198'), findsWidgets);
    final back = (await storedTrips())[id198] as Map<String, dynamic>;
    expect((back['log'] as Map<String, dynamic>)['experience'], 'Keep me');
    await tester.pump(const Duration(seconds: 10));
    expect(photos.deleted, isEmpty, reason: 'undone: the photos are kept');
  });

  testWidgets('a removal that is not undone deletes the entry\'s photos once the message is gone', (tester) async {
    final photos = FakePhotoService();
    final infos = {
      id198: TripInfo(log: FlightLog.clean(photos: ['gone.jpg'])),
    };
    await pumpApp(
      tester,
      prefs: seed(infos: infos),
      clock: () => now,
      source: InertFlightSource(),
      overrides: [photoServiceProvider.overrideWithValue(photos)],
    );
    await expandPast(tester);
    await tester.ensureVisible(find.text('BR198').last);
    await tester.pumpAndSettle();
    await tester.drag(find.text('BR198').last, const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(photos.deleted, isEmpty, reason: 'still undoable');
    await tester.pump(const Duration(seconds: 7));
    await tester.pumpAndSettle();
    expect(photos.deleted, ['gone.jpg']);
  });
}
