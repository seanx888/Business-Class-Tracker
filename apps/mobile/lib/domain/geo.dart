// Airport coordinates (bundled OurAirports extract) and great-circle maths — distance of hand-entered flights,
// the route map, and intermediate points along the arc.
import 'dart:math' as math;

class AirportGeo {
  const AirportGeo(this.lat, this.lon, [this.city = '']);

  final double lat;
  final double lon;
  final String city;

  /// Parses the asset row `[lat, lon, city]`.
  static AirportGeo? fromJson(Object? row) {
    if (row is! List || row.length < 2 || row[0] is! num || row[1] is! num) return null;
    return AirportGeo((row[0] as num).toDouble(), (row[1] as num).toDouble(), row.length > 2 && row[2] is String ? row[2] as String : '');
  }
}

const earthRadiusKm = 6371.0;

double _rad(double deg) => deg * math.pi / 180;
double _deg(double rad) => rad * 180 / math.pi;

/// Great-circle (haversine) distance in km.
double greatCircleKm(AirportGeo a, AirportGeo b) {
  final dLat = _rad(b.lat - a.lat);
  final dLon = _rad(b.lon - a.lon);
  final h = math.pow(math.sin(dLat / 2), 2) + math.cos(_rad(a.lat)) * math.cos(_rad(b.lat)) * math.pow(math.sin(dLon / 2), 2);
  return 2 * earthRadiusKm * math.asin(math.min(1, math.sqrt(h)));
}

/// The point [f] (0…1) of the way from [a] to [b] along the great circle.
({double lat, double lon}) intermediatePoint(AirportGeo a, AirportGeo b, double f) {
  final d = greatCircleKm(a, b) / earthRadiusKm;
  if (d < 1e-9) return (lat: a.lat, lon: a.lon);
  final lat1 = _rad(a.lat), lon1 = _rad(a.lon), lat2 = _rad(b.lat), lon2 = _rad(b.lon);
  final sa = math.sin((1 - f) * d) / math.sin(d);
  final sb = math.sin(f * d) / math.sin(d);
  final x = sa * math.cos(lat1) * math.cos(lon1) + sb * math.cos(lat2) * math.cos(lon2);
  final y = sa * math.cos(lat1) * math.sin(lon1) + sb * math.cos(lat2) * math.sin(lon2);
  final z = sa * math.sin(lat1) + sb * math.sin(lat2);
  return (lat: _deg(math.atan2(z, math.sqrt(x * x + y * y))), lon: _deg(math.atan2(y, x)));
}

/// Gate-to-gate time estimated from distance: ~30 min of taxi/climb/descent plus cruise at ~800 km/h.
/// Only used for flights typed in by hand, where no airline time exists.
Duration estimateBlockTime(double km) => Duration(minutes: 30 + (km / 800 * 60).round());
