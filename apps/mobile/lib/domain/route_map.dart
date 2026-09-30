// Geometry of the route map: the great-circle arc between two airports and the map window that frames it.
// Longitudes are UNWRAPPED (they may run past ±180°) so a trans-Pacific route is one continuous line; the painter draws
// the land outline at −360° / 0° / +360° to fill the window.
import 'dart:math' as math;

import 'geo.dart';

typedef LonLat = ({double lon, double lat});

class MapWindow {
  const MapWindow({required this.lon0, required this.lon1, required this.lat0, required this.lat1});

  final double lon0; // west edge
  final double lon1; // east edge
  final double lat0; // south edge
  final double lat1; // north edge

  double get width => lon1 - lon0;
  double get height => lat1 - lat0;
}

class RouteGeometry {
  const RouteGeometry({required this.arc, required this.window});

  /// Points from origin to destination, equally spaced in the fraction of the route flown (unwrapped longitudes).
  final List<LonLat> arc;
  final MapWindow window;

  /// Where the aircraft is at [progress] (0…1).
  LonLat at(double progress) {
    final p = progress.clamp(0.0, 1.0) * (arc.length - 1);
    final i = p.floor().clamp(0, arc.length - 2);
    final t = p - i;
    return (lon: arc[i].lon + (arc[i + 1].lon - arc[i].lon) * t, lat: arc[i].lat + (arc[i + 1].lat - arc[i].lat) * t);
  }
}

double _wrap180(double d) => ((d + 180) % 360 + 360) % 360 - 180;

/// Frames [a]→[b] in a window of the given [aspect] (width ÷ height). Very short routes are not zoomed in past
/// [minLonSpan] degrees of longitude; latitude is kept within ±80°.
RouteGeometry routeGeometry(AirportGeo a, AirportGeo b, {double aspect = 2, int samples = 64, double minLonSpan = 24, double pad = 0.18}) {
  final arc = <LonLat>[];
  var prevLon = a.lon;
  for (var i = 0; i <= samples; i++) {
    final p = intermediatePoint(a, b, i / samples);
    final lon = i == 0 ? a.lon : prevLon + _wrap180(p.lon - prevLon);
    arc.add((lon: lon, lat: p.lat));
    prevLon = lon;
  }
  var lonMin = arc.map((p) => p.lon).reduce(math.min);
  var lonMax = arc.map((p) => p.lon).reduce(math.max);
  var latMin = arc.map((p) => p.lat).reduce(math.min);
  var latMax = arc.map((p) => p.lat).reduce(math.max);

  var w = math.max(lonMax - lonMin, 1e-6) * (1 + 2 * pad);
  var h = math.max(latMax - latMin, 1e-6) * (1 + 2 * pad);
  w = math.max(w, minLonSpan);
  // Fit the window to the aspect ratio, growing whichever side is short.
  if (w / h < aspect) {
    w = h * aspect;
  } else {
    h = w / aspect;
  }
  final lonC = (lonMin + lonMax) / 2;
  var latC = (latMin + latMax) / 2;
  // Keep the window on the globe.
  const limit = 80.0;
  if (latC + h / 2 > limit) latC = limit - h / 2;
  if (latC - h / 2 < -limit) latC = -limit + h / 2;
  return RouteGeometry(
    arc: arc,
    window: MapWindow(lon0: lonC - w / 2, lon1: lonC + w / 2, lat0: latC - h / 2, lat1: latC + h / 2),
  );
}

/// Screen position of a coordinate inside [size] (plate carrée: longitude → x, latitude → y, north up).
({double x, double y}) project(MapWindow w, LonLat p, double width, double height) =>
    (x: (p.lon - w.lon0) / w.width * width, y: (w.lat1 - p.lat) / w.height * height);
