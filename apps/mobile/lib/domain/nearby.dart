// Radar Lite: aircraft near a point, from a community ADS-B feed. Pure parsing and geometry; the network call lives in
// data/aircraft_source.dart.
import 'dart:math' as math;

import 'callsign.dart';
import 'geo.dart';

enum VerticalTrend { climbing, descending, level }

class NearbyAircraft {
  const NearbyAircraft({
    required this.hex,
    required this.lat,
    required this.lon,
    required this.callsign,
    required this.distanceKm,
    required this.bearingDeg,
    this.registration,
    this.type,
    this.typeDescription,
    this.altitudeFt,
    this.onGround = false,
    this.groundSpeedKt,
    this.trackDeg,
    this.verticalRateFpm,
    this.squawk,
    this.seenSeconds,
  });

  /// ICAO 24-bit address, unique per airframe.
  final String hex;
  final double lat;
  final double lon;
  final ParsedCallsign callsign;

  /// Great-circle distance and initial bearing (0 = north, clockwise) from the point the search is centred on.
  final double distanceKm;
  final double bearingDeg;

  final String? registration;

  /// ICAO type designator ("B789").
  final String? type;
  final String? typeDescription;
  final int? altitudeFt;
  final bool onGround;
  final double? groundSpeedKt;

  /// Direction of travel over the ground, degrees from north.
  final double? trackDeg;
  final int? verticalRateFpm;
  final String? squawk;

  /// Seconds since the last position update.
  final double? seenSeconds;

  /// Climbing / descending beyond 500 ft/min, otherwise level.
  VerticalTrend get trend {
    final v = verticalRateFpm;
    if (onGround || v == null || v.abs() < 500) return VerticalTrend.level;
    return v > 0 ? VerticalTrend.climbing : VerticalTrend.descending;
  }

  /// 7500 hijack, 7600 radio failure, 7700 general emergency.
  bool get emergencySquawk => const {'7500', '7600', '7700'}.contains(squawk);

  /// A short label for lists: the callsign, else the registration, else the hex code.
  String get label => callsign.raw.isNotEmpty ? callsign.raw : (registration ?? hex.toUpperCase());

  /// "Overhead" for someone standing at the search centre: airborne and within [overheadKm] horizontally.
  bool isOverhead({double overheadKm = 10}) => !onGround && distanceKm <= overheadKm;
}

/// Initial great-circle bearing from a to b, degrees 0…360 (0 = north).
double bearingBetween(AirportGeo a, AirportGeo b) {
  final phi1 = a.lat * math.pi / 180;
  final phi2 = b.lat * math.pi / 180;
  final dLon = (b.lon - a.lon) * math.pi / 180;
  final y = math.sin(dLon) * math.cos(phi2);
  final x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dLon);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

/// "N", "NE", … for a bearing.
String compassPoint(double bearing) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[((bearing % 360) / 45 + 0.5).floor() % 8];
}

/// Parses a readsb-style response (`ac` for adsb.lol, `aircraft` for adsb.fi) and measures every aircraft from
/// ([centerLat], [centerLon]). Entries without a position are dropped; the result is nearest first.
List<NearbyAircraft> parseAircraft(Map<String, dynamic> json, {required double centerLat, required double centerLon}) {
  final raw = json['ac'] ?? json['aircraft'];
  if (raw is! List) return const [];
  final center = AirportGeo(centerLat, centerLon);
  final out = <NearbyAircraft>[];
  for (final e in raw) {
    if (e is! Map<String, dynamic>) continue;
    final lat = e['lat'];
    final lon = e['lon'];
    final hex = e['hex'];
    if (lat is! num || lon is! num || hex is! String) continue;
    final pos = AirportGeo(lat.toDouble(), lon.toDouble());
    final alt = e['alt_baro'];
    final ground = alt == 'ground';
    String? text(String key) {
      final v = e[key];
      return v is String && v.trim().isNotEmpty ? v.trim() : null;
    }

    out.add(
      NearbyAircraft(
        hex: hex,
        lat: pos.lat,
        lon: pos.lon,
        callsign: parseCallsign(e['flight'] as String?),
        distanceKm: greatCircleKm(center, pos),
        bearingDeg: bearingBetween(center, pos),
        registration: text('r'),
        type: text('t'),
        typeDescription: text('desc'),
        altitudeFt: alt is num ? alt.round() : null,
        onGround: ground,
        groundSpeedKt: (e['gs'] as num?)?.toDouble(),
        trackDeg: (e['track'] as num?)?.toDouble(),
        verticalRateFpm: ((e['baro_rate'] ?? e['geom_rate']) as num?)?.round(),
        squawk: text('squawk'),
        seenSeconds: (e['seen'] as num?)?.toDouble(),
      ),
    );
  }
  out.sort((a, b) => a.distanceKm.compareTo(b.distanceKm));
  return out;
}

/// Feeds are searched in nautical miles.
double kmToNm(double km) => km / 1.852;
