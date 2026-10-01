import 'dart:convert';
import 'dart:io';

import 'package:aethersky/data/aircraft_source.dart';
import 'package:aethersky/domain/aircraft_types.dart';
import 'package:aethersky/domain/callsign.dart';
import 'package:aethersky/domain/geo.dart';
import 'package:aethersky/domain/nearby.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

// Centre of the captured sample: Taoyuan airport (TPE).
const lat = 25.08;
const lon = 121.23;

Map<String, dynamic> sample() => jsonDecode(File('test/fixtures/adsb-sample.json').readAsStringSync()) as Map<String, dynamic>;

void main() {
  group('callsigns', () {
    test('airline and flight number are split; ICAO maps to the IATA code passengers know', () {
      final c = parseCallsign('EVA198  ');
      expect(c.icao, 'EVA');
      expect(c.iata, 'BR');
      expect(c.number, '198');
      expect(c.iataFlight, 'BR198');
      expect(parseCallsign('cal0923').iataFlight, 'CI923', reason: 'case and leading zeros are normalised');
      expect(parseCallsign('SJX2').iataFlight, 'JX2');
    });

    test('a company suffix letter is dropped; registrations, military and unknown airlines are left alone', () {
      expect(parseCallsign('EVA198A').iataFlight, 'BR198');
      expect(parseCallsign('B18663').iataFlight, isNull);
      expect(parseCallsign('N123AB').iataFlight, isNull);
      expect(parseCallsign('QQQ12').iata, isNull);
      expect(parseCallsign('QQQ12').number, '12');
      expect(parseCallsign('QQQ12').iataFlight, isNull, reason: 'no IATA airline → no flight number to look up');
      expect(parseCallsign(null).raw, '');
      expect(parseCallsign('   ').iataFlight, isNull);
    });

    test('the ICAO table has no duplicated IATA targets that would make the mapping ambiguous', () {
      final iata = icaoToIata.values.toList();
      expect(iata.toSet().length, iata.length);
      expect(icaoToIata.keys.every((k) => k.length == 3), isTrue);
    });
  });

  group('aircraft types', () {
    test('ICAO designators become names; unknown ones pass through; blanks are null', () {
      expect(aircraftTypeName('B78X'), 'Boeing 787-10');
      expect(aircraftTypeName(' a359 '), 'Airbus A350-900');
      expect(aircraftTypeName('ZZZ9'), 'ZZZ9');
      expect(aircraftTypeName(''), isNull);
      expect(aircraftTypeName(null), isNull);
    });

    test('suggestions match by designator prefix or by name', () {
      expect(aircraftTypeSuggestions('b78'), containsAll(['B788', 'B789', 'B78X']));
      expect(aircraftTypeSuggestions('a350'), containsAll(['A359', 'A35K']));
      expect(aircraftTypeSuggestions('787'), containsAll(['B788', 'B789']));
      expect(aircraftTypeSuggestions(''), isEmpty);
      expect(aircraftTypeSuggestions('b7', limit: 2).length, 2);
    });
  });

  group('geometry', () {
    test('bearings: due north 0, east 90, south 180, west 270', () {
      const o = AirportGeo(25, 121);
      expect(bearingBetween(o, const AirportGeo(26, 121)), closeTo(0, 0.01));
      expect(bearingBetween(o, const AirportGeo(25, 122)), closeTo(90, 0.6));
      expect(bearingBetween(o, const AirportGeo(24, 121)), closeTo(180, 0.01));
      expect(bearingBetween(o, const AirportGeo(25, 120)), closeTo(270, 0.6));
    });

    test('compass points', () {
      expect([0, 44, 46, 90, 135, 180, 225, 270, 315, 359].map((b) => compassPoint(b.toDouble())).toList(), [
        'N',
        'NE',
        'NE',
        'E',
        'SE',
        'S',
        'SW',
        'W',
        'NW',
        'N',
      ]);
    });

    test('nautical miles', () => expect(kmToNm(18.52), closeTo(10, 1e-9)));
  });

  group('parsing a real adsb.lol response', () {
    final list = parseAircraft(sample(), centerLat: lat, centerLon: lon);

    test('entries without a position are dropped; the rest are nearest first, with distance and bearing from the centre', () {
      expect(list.length, 5);
      expect(list.first.callsign.raw, 'CPA531');
      expect(list.first.distanceKm, lessThan(2), reason: 'parked at TPE');
      for (var i = 1; i < list.length; i++) {
        expect(list[i].distanceKm, greaterThanOrEqualTo(list[i - 1].distanceKm));
      }
      final cal923 = list.firstWhere((a) => a.callsign.raw == 'CAL923');
      expect(cal923.distanceKm, closeTo(greatCircleKm(const AirportGeo(lat, lon), const AirportGeo(24.525674, 120.35367)), 1e-6));
      expect(cal923.distanceKm, closeTo(108, 2), reason: 'about 108 km south-west of Taoyuan');
      expect(compassPoint(cal923.bearingDeg), 'SW');
    });

    test('fields: type, registration, altitude, speed, track, vertical rate', () {
      final a = list.firstWhere((x) => x.callsign.raw == 'CAL923');
      expect(a.type, 'B738');
      expect(a.registration, 'B-18663');
      expect(a.altitudeFt, 30025);
      expect(a.onGround, isFalse);
      expect(a.groundSpeedKt, isNotNull);
      expect(a.trackDeg, isNotNull);
      expect(a.callsign.iataFlight, 'CI923');
      expect(a.label, 'CAL923');
    });

    test('an aircraft on the ground is flagged, has no altitude, and is never "overhead"', () {
      final g = list.first;
      expect(g.onGround, isTrue);
      expect(g.altitudeFt, isNull);
      expect(g.isOverhead(), isFalse);
      expect(g.trend, VerticalTrend.level);
    });
  });

  group('derived flags', () {
    NearbyAircraft ac({int? vrate, bool ground = false, String? squawk, double km = 5, String call = 'EVA198', String? reg}) =>
        NearbyAircraft(
          hex: 'abc123',
          lat: 0,
          lon: 0,
          callsign: parseCallsign(call),
          distanceKm: km,
          bearingDeg: 0,
          verticalRateFpm: vrate,
          onGround: ground,
          squawk: squawk,
          registration: reg,
        );

    test('trend needs 500 ft/min either way', () {
      expect(ac(vrate: 1800).trend, VerticalTrend.climbing);
      expect(ac(vrate: -900).trend, VerticalTrend.descending);
      expect(ac(vrate: 300).trend, VerticalTrend.level);
      expect(ac().trend, VerticalTrend.level);
    });

    test('overhead means airborne within the radius', () {
      expect(ac(km: 9).isOverhead(), isTrue);
      expect(ac(km: 11).isOverhead(), isFalse);
      expect(ac(km: 11).isOverhead(overheadKm: 15), isTrue);
    });

    test('emergency squawks', () {
      expect(ac(squawk: '7700').emergencySquawk, isTrue);
      expect(ac(squawk: '7500').emergencySquawk, isTrue);
      expect(ac(squawk: '2662').emergencySquawk, isFalse);
      expect(ac().emergencySquawk, isFalse);
    });

    test('label falls back from callsign to registration to hex', () {
      expect(ac(call: '', reg: 'B-18663').label, 'B-18663');
      expect(ac(call: '').label, 'ABC123');
    });
  });

  group('adsb.fi shape', () {
    test('the "aircraft" key is understood as well as "ac"', () {
      final body = {
        'aircraft': [
          {'hex': 'a1', 'flight': 'KAL692 ', 'lat': 25.1, 'lon': 121.3, 'alt_baro': 5000, 't': 'B789'},
        ],
      };
      final list = parseAircraft(body, centerLat: lat, centerLon: lon);
      expect(list.single.callsign.iataFlight, 'KE692');
      expect(parseAircraft({'ac': 'nope'}, centerLat: lat, centerLon: lon), isEmpty);
      expect(parseAircraft(const {}, centerLat: lat, centerLon: lon), isEmpty);
    });
  });

  group('sources', () {
    http.Client ok(void Function(Uri) seen) => MockClient((req) async {
      seen(req.url);
      return http.Response(File('test/fixtures/adsb-sample.json').readAsStringSync(), 200);
    });

    test('adsb.lol request: centre rounded to 0.01°, radius in whole nautical miles', () async {
      late Uri url;
      final s = ReadsbAircraftSource.adsbLol(ok((u) => url = u));
      final list = await s.around(25.0834567, 121.2299, 50);
      expect(url.host, 'api.adsb.lol');
      expect(url.path, '/v2/point/25.08/121.23/27', reason: '50 km = 26.99 nm → 27');
      expect(list, isNotEmpty);
    });

    test('adsb.fi request shape', () async {
      late Uri url;
      await ReadsbAircraftSource.adsbFi(ok((u) => url = u)).around(25.08, 121.23, 100);
      expect(url.host, 'opendata.adsb.fi');
      expect(url.path, '/api/v2/lat/25.08/lon/121.23/dist/54');
    });

    test('the radius is clamped to 5–100 nm and results outside the radius are dropped', () async {
      late Uri url;
      final s = ReadsbAircraftSource.adsbLol(ok((u) => url = u));
      await s.around(25.08, 121.23, 500);
      expect(url.pathSegments.last, '100');
      await s.around(25.08, 121.23, 1);
      expect(url.pathSegments.last, '5');
      final near = await s.around(25.08, 121.23, 10);
      expect(near.every((a) => a.distanceKm <= 10.2), isTrue);
      expect(near.map((a) => a.callsign.raw), ['CPA531']);
    });

    test('errors become AircraftFetchException: HTTP status, network failure, junk body', () async {
      expect(
        () => ReadsbAircraftSource.adsbLol(MockClient((_) async => http.Response('no', 503))).around(25, 121, 50),
        throwsA(isA<AircraftFetchException>()),
      );
      expect(
        () => ReadsbAircraftSource.adsbLol(MockClient((_) async => throw http.ClientException('offline'))).around(25, 121, 50),
        throwsA(isA<AircraftFetchException>()),
      );
      expect(
        () => ReadsbAircraftSource.adsbLol(MockClient((_) async => http.Response('<html>', 200))).around(25, 121, 50),
        throwsA(isA<AircraftFetchException>()),
      );
    });

    test('fallback: the second source answers when the first is down; both down → one clear error', () async {
      final down = MockClient((_) async => http.Response('', 503));
      final up = ok((_) {});
      final s = FallbackAircraftSource([ReadsbAircraftSource.adsbLol(down), ReadsbAircraftSource.adsbFi(up)]);
      expect((await s.around(lat, lon, 50)).length, 4, reason: 'four of the five sample aircraft are within 50 km of TPE');
      final dead = FallbackAircraftSource([ReadsbAircraftSource.adsbLol(down), ReadsbAircraftSource.adsbFi(down)]);
      expect(() => dead.around(lat, lon, 50), throwsA(isA<AircraftFetchException>()));
      expect(() => FallbackAircraftSource(const []).around(lat, lon, 50), throwsA(isA<AircraftFetchException>()));
    });
  });
}
