import 'package:aethersky/data/aircraft_source.dart';
import 'package:aethersky/data/location_service.dart';
import 'package:aethersky/data/stores.dart';
import 'package:aethersky/domain/nearby.dart';
import 'package:aethersky/features/radar/airport_picker.dart';
import 'package:aethersky/features/radar/sky_plan.dart';
import 'package:aethersky/domain/geo.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support.dart';

// Search centre used by the fake phone: near Taipei.
const lat = 25.0;
const lon = 121.5;

List<NearbyAircraft> fleet() => parseAircraft(
  {
    'ac': [
      // ~1 km north of the centre: directly overhead.
      {
        'hex': 'a1',
        'flight': 'EVA198 ',
        'r': 'B-16722',
        't': 'B789',
        'alt_baro': 2500,
        'gs': 180,
        'track': 90,
        'baro_rate': -700,
        'lat': 25.01,
        'lon': 121.5,
      },
      // ~22 km north: a normal cruise.
      {
        'hex': 'a2',
        'flight': 'CAL923 ',
        'r': 'B-18663',
        't': 'B738',
        'alt_baro': 31000,
        'gs': 437,
        'track': 214,
        'lat': 25.2,
        'lon': 121.5,
      },
      // Emergency code, east of the centre.
      {
        'hex': 'a3',
        'flight': 'N123AB',
        'r': 'N123AB',
        't': 'C172',
        'alt_baro': 4000,
        'gs': 100,
        'track': 10,
        'squawk': '7700',
        'lat': 25.0,
        'lon': 121.75,
      },
    ],
  },
  centerLat: lat,
  centerLon: lon,
);

class FakeLocation implements LocationService {
  FakeLocation(this.outcomes);
  final List<LocationOutcome> outcomes; // one per call; the last repeats
  int calls = 0;
  final settingsOpened = <LocationFailure>[];

  @override
  Future<LocationOutcome> current() async {
    final i = calls < outcomes.length ? calls : outcomes.length - 1;
    calls++;
    return outcomes[i];
  }

  @override
  Future<void> openSettings(LocationFailure failure) async => settingsOpened.add(failure);
}

class FakeAircraft implements AircraftSource {
  FakeAircraft(this.list);
  List<NearbyAircraft> list;
  bool fail = false;
  final calls = <({double lat, double lon, double radiusKm})>[];

  @override
  Future<List<NearbyAircraft>> around(double lat, double lon, double radiusKm) async {
    calls.add((lat: lat, lon: lon, radiusKm: radiusKm));
    if (fail) throw AircraftFetchException('offline');
    return list;
  }
}

const here = LocationOutcome.fix(lat, lon);
const airports = {
  'TPE': AirportGeo(25.08, 121.23, 'Taipei'),
  'TSA': AirportGeo(25.07, 121.55, 'Taipei'),
  'KHH': AirportGeo(22.57, 120.35, 'Kaohsiung'),
};
DateTime clock() => DateTime(2026, 9, 30, 10, 5, 7);

Future<void> openRadar(
  WidgetTester tester, {
  required FakeLocation loc,
  required FakeAircraft src,
  Map<String, Object> prefs = const {},
  FakeExternalActions? actions,
}) async {
  await pumpApp(
    tester,
    prefs: prefs,
    clock: clock,
    actions: actions,
    overrides: [
      locationServiceProvider.overrideWithValue(loc),
      aircraftSourceProvider.overrideWithValue(src),
      airportGeoProvider.overrideWith((ref) async => airports),
    ],
  );
  await tester.tap(find.text('雷達'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('lists what is flying around the phone, nearest first, with the overhead one marked', (tester) async {
    final src = FakeAircraft(fleet());
    await openRadar(tester, loc: FakeLocation([here]), src: src);

    expect(find.text('附近航班'), findsOneWidget);
    expect(src.calls.single.lat, lat);
    expect(src.calls.single.radiusKm, 50);
    expect(find.textContaining('3 架航班'), findsOneWidget);
    expect(find.textContaining('10:05:07'), findsOneWidget);

    final eva = tester.getTopLeft(find.text('EVA198')).dy;
    final cal = tester.getTopLeft(find.text('CAL923')).dy;
    expect(eva, lessThan(cal), reason: 'nearest aircraft is first');
    expect(find.text('頭頂上方'), findsOneWidget, reason: 'only the aircraft within 10 km of the phone is overhead');
    expect(find.textContaining('緊急代碼 7700'), findsOneWidget);
    expect(find.text('Boeing 787-9'), findsNothing, reason: 'type and registration share one line');
    expect(find.textContaining('B-16722'), findsOneWidget);
  });

  testWidgets('tapping a row opens the aircraft; the Flightradar24 link and "track this flight" are offered', (tester) async {
    final actions = FakeExternalActions();
    await openRadar(tester, loc: FakeLocation([here]), src: FakeAircraft(fleet()), actions: actions);

    await tester.tap(find.text('EVA198'));
    await tester.pumpAndSettle();
    expect(find.textContaining('BR198'), findsOneWidget, reason: 'the callsign is translated to the number on the ticket');
    expect(find.text('追蹤這班航班'), findsOneWidget);

    await tester.tap(find.text('在 Flightradar24 查看'));
    await tester.pumpAndSettle();
    expect(actions.opened.single.toString(), 'https://www.flightradar24.com/eva198');
  });

  testWidgets('track this flight opens the add-flight sheet already filled in', (tester) async {
    await openRadar(tester, loc: FakeLocation([here]), src: FakeAircraft(fleet()));
    await tester.tap(find.text('EVA198'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('追蹤這班航班'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'BR198'), findsOneWidget);
  });

  testWidgets('a callsign that is not an airline flight has no track button but still links out', (tester) async {
    await openRadar(tester, loc: FakeLocation([here]), src: FakeAircraft(fleet()));
    await tester.tap(find.text('N123AB'));
    await tester.pumpAndSettle();
    expect(find.text('追蹤這班航班'), findsNothing);
    expect(find.text('在 Flightradar24 查看'), findsOneWidget);
  });

  testWidgets('permission denied: explains, retries, and recovers', (tester) async {
    final loc = FakeLocation([const LocationOutcome.failed(LocationFailure.denied), here]);
    final src = FakeAircraft(fleet());
    await openRadar(tester, loc: loc, src: src);

    expect(find.text('需要位置權限才能顯示你附近的航班。'), findsOneWidget);
    expect(src.calls, isEmpty, reason: 'nothing is requested without a position');
    await tester.tap(find.text('重試'));
    await tester.pumpAndSettle();
    expect(find.text('EVA198'), findsOneWidget);
  });

  testWidgets('permission blocked for good: the settings button opens system settings', (tester) async {
    final loc = FakeLocation([const LocationOutcome.failed(LocationFailure.deniedForever)]);
    await openRadar(tester, loc: loc, src: FakeAircraft(fleet()));
    await tester.tap(find.text('開啟系統設定'));
    await tester.pumpAndSettle();
    expect(loc.settingsOpened, [LocationFailure.deniedForever]);
  });

  testWidgets('without a position the airport picker is the way out; the choice sticks and centres the search on the airport', (
    tester,
  ) async {
    final loc = FakeLocation([const LocationOutcome.failed(LocationFailure.serviceOff)]);
    final src = FakeAircraft(fleet());
    await openRadar(tester, loc: loc, src: src);

    await tester.tap(find.text('選擇機場'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'tpe');
    await tester.pumpAndSettle();
    await tester.tap(find.text('TPE').last);
    await tester.pumpAndSettle();

    expect(src.calls, hasLength(1));
    expect(src.calls.single.lat, closeTo(25.08, 0.1), reason: 'Taoyuan airport');
    expect(find.text('EVA198'), findsOneWidget);
    expect(find.text('頭頂上方'), findsNothing, reason: 'overhead only means something for the phone location');
  });

  testWidgets('a remembered airport is used straight away, no location is requested', (tester) async {
    final loc = FakeLocation([here]);
    final src = FakeAircraft(fleet());
    await openRadar(
      tester,
      loc: loc,
      src: src,
      prefs: {'aether.settings.v1': '{"radarUseLocation":false,"radarAirport":"KHH","radarRadiusKm":25}'},
    );
    expect(loc.calls, 0);
    expect(src.calls.single.radiusKm, 25);
    expect(src.calls.single.lat, closeTo(22.57, 0.1), reason: 'Kaohsiung');
  });

  testWidgets('no aircraft in range shows how to widen the search', (tester) async {
    await openRadar(tester, loc: FakeLocation([here]), src: FakeAircraft(const []));
    expect(find.text('這個範圍內沒有航班'), findsOneWidget);
    expect(find.textContaining('放大半徑'), findsOneWidget);
  });

  testWidgets('a feed failure is explained and can be retried', (tester) async {
    final src = FakeAircraft(fleet())..fail = true;
    await openRadar(tester, loc: FakeLocation([here]), src: src);
    expect(find.text('無法取得航班資料'), findsOneWidget);

    src.fail = false;
    await tester.tap(find.text('重試'));
    await tester.pumpAndSettle();
    expect(find.text('無法取得航班資料'), findsNothing);
    expect(find.text('EVA198'), findsOneWidget);
  });

  testWidgets('choosing a radius re-queries with it and is remembered', (tester) async {
    final src = FakeAircraft(fleet());
    await openRadar(tester, loc: FakeLocation([here]), src: src);
    await tester.tap(find.text('100\u00A0km'));
    await tester.pumpAndSettle();
    expect(src.calls.last.radiusKm, 100);
    expect(find.textContaining('半徑 100 km'), findsOneWidget);
    final saved = (await SharedPreferences.getInstance()).getString('aether.settings.v1');
    expect(saved, contains('"radarRadiusKm":100'));
  });

  testWidgets('the sky view shows the same aircraft on a plan with a text description', (tester) async {
    await openRadar(tester, loc: FakeLocation([here]), src: FakeAircraft(fleet()));
    await tester.tap(find.text('天空'));
    await tester.pumpAndSettle();
    expect(find.byType(SkyPlan), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('天空平面圖')), findsOneWidget);
    // Tapping the plane drawn for the overhead aircraft opens its details.
    final plan = tester.getRect(find.byType(SkyPlan));
    final side = plan.shortestSide;
    final overhead = fleet().first;
    await tester.tapAt(plan.topLeft + skyPosition(overhead, 50, side));
    await tester.pumpAndSettle();
    expect(find.text('追蹤這班航班'), findsOneWidget);
  });

  testWidgets('English and Korean labels are used when the phone is set to them', (tester) async {
    await pumpApp(
      tester,
      prefs: {'aether.settings.v1': '{"language":"en"}'},
      clock: clock,
      overrides: [
        locationServiceProvider.overrideWithValue(FakeLocation([here])),
        aircraftSourceProvider.overrideWithValue(FakeAircraft(fleet())),
        airportGeoProvider.overrideWith((ref) async => airports),
      ],
    );
    await tester.tap(find.text('Radar'));
    await tester.pumpAndSettle();
    expect(find.text('Flights nearby'), findsOneWidget);
    expect(find.text('Overhead'), findsOneWidget);
  });

  group('sky plan geometry', () {
    final list = fleet();
    test('north is up, east is right, the centre is the middle of the square', () {
      const side = 300.0;
      final north = skyPosition(list[0], 50, side); // ~1 km north
      expect(north.dx, closeTo(150, 1));
      expect(north.dy, lessThan(150));
      final east = skyPosition(list[2], 50, side); // 25 km east
      expect(east.dy, closeTo(150, 3));
      expect(east.dx, greaterThan(150));
    });

    test('aircraft beyond the radius are pinned to the outer ring instead of leaving the square', () {
      const side = 300.0;
      final p = skyPosition(list[2], 10, side);
      expect((p - const Offset(150, 150)).distance, closeTo(150 - 28, 0.5));
    });

    test('a tap hits the nearest plane within reach, and misses in empty sky', () {
      const side = 300.0;
      final at = skyPosition(list[1], 50, side);
      expect(aircraftAt(at + const Offset(6, -4), list, 50, side)?.hex, 'a2');
      expect(aircraftAt(const Offset(5, 295), list, 50, side), isNull);
    });
  });

  group('airport search', () {
    final table = {
      'TPE': const AirportGeo(25.08, 121.23, 'Taipei'),
      'TSA': const AirportGeo(25.07, 121.55, 'Taipei'),
      'TPA': const AirportGeo(27.97, -82.53, 'Tampa'),
      'KHH': const AirportGeo(22.57, 120.35, 'Kaohsiung'),
    };
    test('empty query offers the common airports that exist', () {
      expect(searchAirports(table, ''), ['TPE', 'TSA', 'KHH']);
    });
    test('exact code beats prefix beats city', () {
      expect(searchAirports(table, 'tpe').first, 'TPE');
      expect(searchAirports(table, 'tp'), ['TPE', 'TPA']);
      expect(searchAirports(table, 'taipei'), containsAll(['TPE', 'TSA']));
      expect(searchAirports(table, 'zzz'), isEmpty);
    });
  });
}
