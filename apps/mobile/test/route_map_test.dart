import 'package:aethersky/domain/geo.dart';
import 'package:aethersky/domain/route_map.dart';
import 'package:flutter_test/flutter_test.dart';

const tpe = AirportGeo(25.08, 121.23, 'Taoyuan');
const nrt = AirportGeo(35.77, 140.39, 'Narita');
const lax = AirportGeo(33.94, -118.41, 'Los Angeles');
const cdg = AirportGeo(49.01, 2.55, 'Paris');
const syd = AirportGeo(-33.95, 151.18, 'Sydney');

void main() {
  test('arc starts and ends at the airports and is sampled evenly', () {
    final g = routeGeometry(tpe, nrt);
    expect(g.arc.length, 65);
    expect(g.arc.first.lon, closeTo(tpe.lon, 1e-6));
    expect(g.arc.first.lat, closeTo(tpe.lat, 1e-6));
    expect(g.arc.last.lon, closeTo(nrt.lon, 1e-6));
    expect(g.arc.last.lat, closeTo(nrt.lat, 1e-6));
  });

  test('a trans-Pacific route is one continuous line: longitudes are unwrapped past 180°', () {
    final g = routeGeometry(tpe, lax);
    for (var i = 1; i < g.arc.length; i++) {
      expect((g.arc[i].lon - g.arc[i - 1].lon).abs(), lessThan(10), reason: 'no jump at the date line (step $i)');
    }
    expect(g.arc.last.lon, closeTo(lax.lon + 360, 1e-6), reason: 'LAX is reached going east: −118° becomes +242°');
    expect(g.window.lon1, greaterThan(180), reason: 'the window runs past the date line');
    expect(g.window.lon0, lessThan(g.arc.first.lon));
  });

  test('the window contains the whole arc with padding, and matches the requested aspect', () {
    for (final pair in [(tpe, nrt), (tpe, lax), (tpe, cdg), (nrt, syd)]) {
      final g = routeGeometry(pair.$1, pair.$2, aspect: 2);
      final w = g.window;
      expect(w.width / w.height, closeTo(2, 1e-9));
      for (final p in g.arc) {
        expect(p.lon, inInclusiveRange(w.lon0, w.lon1));
        expect(p.lat, inInclusiveRange(w.lat0, w.lat1));
      }
    }
    expect(routeGeometry(tpe, cdg, aspect: 1.5).window.width / routeGeometry(tpe, cdg, aspect: 1.5).window.height, closeTo(1.5, 1e-9));
  });

  test('very short routes are not zoomed in past the minimum span; latitude stays on the globe', () {
    const a = AirportGeo(25.08, 121.23);
    const b = AirportGeo(25.13, 121.55); // TPE → TSA
    expect(routeGeometry(a, b, minLonSpan: 24).window.width, greaterThanOrEqualTo(24));
    const polarA = AirportGeo(78.2, 15.5);
    const polarB = AirportGeo(69.7, 19.0);
    final w = routeGeometry(polarA, polarB).window;
    expect(w.lat1, lessThanOrEqualTo(80.0001));
    expect(w.lat0, greaterThanOrEqualTo(-80.0001));
  });

  test('aircraft position: ends at the ends, halfway along the arc in between, clamped', () {
    final g = routeGeometry(tpe, nrt);
    expect(g.at(0).lon, closeTo(tpe.lon, 1e-6));
    expect(g.at(1).lon, closeTo(nrt.lon, 1e-6));
    expect(g.at(-3).lon, closeTo(tpe.lon, 1e-6));
    expect(g.at(9).lat, closeTo(nrt.lat, 1e-6));
    final mid = g.at(0.5);
    final half = intermediatePoint(tpe, nrt, 0.5);
    expect(mid.lon, closeTo(half.lon, 1e-6));
    expect(mid.lat, closeTo(half.lat, 1e-6));
  });

  test('projection: window corners map to canvas corners, north is up', () {
    final g = routeGeometry(tpe, nrt);
    final w = g.window;
    final tl = project(w, (lon: w.lon0, lat: w.lat1), 400, 200);
    final br = project(w, (lon: w.lon1, lat: w.lat0), 400, 200);
    expect(tl.x, closeTo(0, 1e-9));
    expect(tl.y, closeTo(0, 1e-9));
    expect(br.x, closeTo(400, 1e-9));
    expect(br.y, closeTo(200, 1e-9));
    expect(project(w, g.arc.last, 400, 200).x, greaterThan(project(w, g.arc.first, 400, 200).x), reason: 'Narita is east of Taoyuan');
    expect(project(w, g.arc.last, 400, 200).y, lessThan(project(w, g.arc.first, 400, 200).y), reason: 'and north of it');
  });
}
