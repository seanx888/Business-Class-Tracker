import 'dart:convert';

import 'package:aethersky/domain/geo.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const tpe = AirportGeo(25.08, 121.23, 'Taoyuan');
const nrt = AirportGeo(35.77, 140.39, 'Narita');
const lax = AirportGeo(33.94, -118.41, 'Los Angeles');
const cdg = AirportGeo(49.01, 2.55, 'Paris');

void main() {
  test('great-circle distance matches published route distances within ~1%', () {
    expect(greatCircleKm(tpe, nrt), closeTo(2170, 25)); // TPE–NRT ≈ 2,170 km
    expect(greatCircleKm(tpe, lax), closeTo(10900, 110)); // TPE–LAX ≈ 10,900 km
    expect(greatCircleKm(tpe, cdg), closeTo(9800, 100)); // TPE–CDG ≈ 9,800 km
    expect(greatCircleKm(tpe, tpe), 0);
    expect(greatCircleKm(tpe, nrt), closeTo(greatCircleKm(nrt, tpe), 1e-9), reason: 'symmetric');
  });

  test('intermediate points start and end at the airports and stay on the great circle', () {
    final start = intermediatePoint(tpe, lax, 0);
    final end = intermediatePoint(tpe, lax, 1);
    expect(start.lat, closeTo(tpe.lat, 1e-6));
    expect(start.lon, closeTo(tpe.lon, 1e-6));
    expect(end.lat, closeTo(lax.lat, 1e-6));
    final mid = intermediatePoint(tpe, lax, 0.5);
    final total = greatCircleKm(tpe, lax);
    expect(greatCircleKm(tpe, AirportGeo(mid.lat, mid.lon)), closeTo(total / 2, 1));
    expect(greatCircleKm(AirportGeo(mid.lat, mid.lon), lax), closeTo(total / 2, 1));
    expect(mid.lat, greaterThan(40), reason: 'the trans-Pacific arc bows well north of both endpoints');
    expect(intermediatePoint(tpe, tpe, 0.5).lat, tpe.lat);
  });

  test('block time estimate: ~3 h TPE–NRT, ~13.5 h TPE–LAX', () {
    expect(estimateBlockTime(greatCircleKm(tpe, nrt)).inMinutes, inInclusiveRange(180, 200));
    expect(estimateBlockTime(greatCircleKm(tpe, lax)).inHours, inInclusiveRange(13, 15));
  });

  test('the bundled coordinate table parses and resolves the airports this app cares about', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final raw = jsonDecode(await rootBundle.loadString('assets/airport-geo.json')) as Map<String, dynamic>;
    final t = AirportGeo.fromJson(raw['TPE'])!;
    expect(t.city, 'Taoyuan');
    expect(greatCircleKm(t, AirportGeo.fromJson(raw['NRT'])!), closeTo(2170, 30));
    expect(raw.length, greaterThan(5000));
    expect(AirportGeo.fromJson('nope'), isNull);
    expect(AirportGeo.fromJson([1]), isNull);
  });
}
