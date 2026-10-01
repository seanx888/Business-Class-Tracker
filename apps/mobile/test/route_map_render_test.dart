import 'dart:convert';
import 'dart:typed_data';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:aethersky/data/stores.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/geo.dart';
import 'package:aethersky/domain/route_map.dart';
import 'package:aethersky/features/flights/route_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

const tpe = AirportGeo(25.08, 121.23, 'Taoyuan');
const nrt = AirportGeo(35.77, 140.39, 'Narita');
const sea = Color(0xFF102030);
const landColor = Color(0xFF405060);
const route = Color(0xFFFF0000);

List<List<double>> realLand() => [
  for (final ring in jsonDecode(File('assets/world-land.json').readAsStringSync()) as List)
    [for (final v in ring as List) (v as num).toDouble()],
];

RouteMapPainter painter({double progress = 0, List<List<double>>? land}) => RouteMapPainter(
  from: tpe,
  to: nrt,
  fromCode: 'TPE',
  toCode: 'NRT',
  land: land ?? realLand(),
  progress: progress,
  sea: sea,
  landColor: landColor,
  routeColor: route,
  trackColor: const Color(0xFF888888),
  labelColor: Colors.white,
);

Future<ByteData> render(WidgetTester tester, CustomPainter p, {double w = 400, double h = 200}) async {
  final bytes = await tester.runAsync(() async {
    final recorder = ui.PictureRecorder();
    p.paint(Canvas(recorder), Size(w, h));
    final image = await recorder.endRecording().toImage(w.toInt(), h.toInt());
    return (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
  });
  return bytes!;
}

Color pixel(ByteData d, int x, int y, {int w = 400}) {
  final i = (y * w + x) * 4;
  return Color.fromARGB(d.getUint8(i + 3), d.getUint8(i), d.getUint8(i + 1), d.getUint8(i + 2));
}

({int x, int y}) at(double lon, double lat) {
  final g = routeGeometry(tpe, nrt, aspect: 2);
  final q = project(g.window, (lon: lon, lat: lat), 400, 200);
  return (x: q.x.round(), y: q.y.round());
}

void main() {
  testWidgets('the projection lines up with the real coastline: Honshu is land, the Sea of Japan is sea', (tester) async {
    final d = await render(tester, painter());
    final honshu = at(138.4, 36.2); // Nagano
    final japanSea = at(133.0, 36.5);
    expect(pixel(d, honshu.x, honshu.y), landColor);
    expect(pixel(d, japanSea.x, japanSea.y), sea);
  });

  testWidgets('the flown part of the route is drawn in the route colour, and only up to the aircraft', (tester) async {
    final none = await render(tester, painter(progress: 0));
    final half = await render(tester, painter(progress: 0.5));
    int count(ByteData d) {
      var n = 0;
      for (var y = 0; y < 200; y++) {
        for (var x = 0; x < 400; x++) {
          final c = pixel(d, x, y);
          if (c.r > 0.9 && c.g < 0.2 && c.b < 0.2) n++;
        }
      }
      return n;
    }

    expect(count(half), greaterThan(count(none) + 200), reason: 'half the route flown adds a long red stroke');
    final g = routeGeometry(tpe, nrt, aspect: 2);
    final ahead = project(g.window, g.at(0.8), 400, 200); // well beyond the aircraft, away from any airport dot
    expect(pixel(half, ahead.x.round(), ahead.y.round()), isNot(route), reason: 'the route ahead of the aircraft is only the faint track');
    final behind = project(g.window, g.at(0.25), 400, 200);
    expect(pixel(half, behind.x.round(), behind.y.round()), route, reason: 'the route already flown is solid');
  });

  testWidgets('with no land loaded yet the map still draws the route on plain sea', (tester) async {
    final d = await render(tester, painter(land: const []));
    final honshu = at(138.4, 36.2);
    expect(pixel(d, honshu.x, honshu.y), sea);
  });

  testWidgets('a trans-Pacific route paints without error and fills both sides of the date line with land', (tester) async {
    final p = RouteMapPainter(
      from: tpe,
      to: const AirportGeo(33.94, -118.41, 'Los Angeles'),
      fromCode: 'TPE',
      toCode: 'LAX',
      land: realLand(),
      progress: 0.5,
      sea: sea,
      landColor: landColor,
      routeColor: route,
      trackColor: Colors.grey,
      labelColor: Colors.white,
    );
    final d = await render(tester, p);
    var landPixels = 0;
    var leftLand = 0, rightLand = 0;
    for (var y = 0; y < 200; y++) {
      for (var x = 0; x < 400; x++) {
        if (pixel(d, x, y) == landColor) {
          landPixels++;
          x < 200 ? leftLand++ : rightLand++;
        }
      }
    }
    expect(landPixels, greaterThan(500));
    expect(leftLand, greaterThan(100), reason: 'Asia on the left');
    expect(rightLand, greaterThan(100), reason: 'North America on the right — drawn at +360° of longitude');
  });

  Flight flightOf(String from, String to, {String source = 'test'}) => Flight(
    id: 'BR198-2026-12-20',
    carrier: 'BR',
    number: '198',
    origin: FlightEndpoint(iata: from, city: from, timeZone: 'Asia/Taipei'),
    destination: FlightEndpoint(iata: to, city: to, timeZone: 'Asia/Tokyo'),
    gateOut: FlightTime(scheduled: DateTime.utc(2026, 12, 20, 1)),
    gateIn: FlightTime(scheduled: DateTime.utc(2026, 12, 20, 4)),
    source: source,
  );

  Future<void> openFlight(WidgetTester tester, Flight f) async {
    await pumpApp(
      tester,
      prefs: {
        'aether.flights.v1': jsonEncode([f.toJson()]),
      },
      clock: () => DateTime.utc(2026, 12, 19, 2),
      source: InertFlightSource(),
      overrides: [
        airportGeoProvider.overrideWith((ref) async => {'TPE': tpe, 'NRT': nrt}),
        worldLandProvider.overrideWith(
          (ref) async => [
            [120.0, 20.0, 125.0, 20.0, 125.0, 27.0, 120.0, 27.0],
          ],
        ),
      ],
    );
    await tester.tap(find.text('BR198').last);
    await tester.pumpAndSettle();
  }

  final hasMap = find.byWidgetPredicate((w) => w is CustomPaint && w.painter is RouteMapPainter);

  testWidgets('the flight page shows the map for a tracked flight', (tester) async {
    await openFlight(tester, flightOf('TPE', 'NRT'));
    expect(hasMap, findsOneWidget);
    expect(find.bySemanticsLabel('TPE → NRT'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('no coordinates for an airport → no map and no error', (tester) async {
    await openFlight(tester, flightOf('TPE', 'ZZZ'));
    expect(hasMap, findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('hand-entered flights get the simple page without a map', (tester) async {
    await openFlight(tester, flightOf('TPE', 'NRT', source: 'manual'));
    expect(hasMap, findsNothing);
  });
}
