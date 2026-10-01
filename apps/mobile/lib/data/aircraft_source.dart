import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../domain/nearby.dart';
import 'stores.dart';

class AircraftFetchException implements Exception {
  AircraftFetchException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Live aircraft around a point. The real sources are community ADS-B feeds; anything that can answer "what is flying within
/// r km of here" can sit behind this interface (a paid provider later, a fake in tests).
abstract class AircraftSource {
  Future<List<NearbyAircraft>> around(double lat, double lon, double radiusKm);
}

/// A readsb-compatible "point" endpoint: adsb.lol (ODbL open data) or adsb.fi's open-data API.
class ReadsbAircraftSource implements AircraftSource {
  ReadsbAircraftSource(this._client, this._uri);
  final http.Client _client;

  /// Builds the request for a centre and a radius in nautical miles.
  final Uri Function(double lat, double lon, int nm) _uri;

  static ReadsbAircraftSource adsbLol(http.Client c) => ReadsbAircraftSource(
    c,
    (lat, lon, nm) => Uri.parse('https://api.adsb.lol/v2/point/${lat.toStringAsFixed(2)}/${lon.toStringAsFixed(2)}/$nm'),
  );

  static ReadsbAircraftSource adsbFi(http.Client c) => ReadsbAircraftSource(
    c,
    (lat, lon, nm) => Uri.parse('https://opendata.adsb.fi/api/v2/lat/${lat.toStringAsFixed(2)}/lon/${lon.toStringAsFixed(2)}/dist/$nm'),
  );

  @override
  Future<List<NearbyAircraft>> around(double lat, double lon, double radiusKm) async {
    // Privacy and politeness: the centre is rounded to 0.01° (about 1 km) before it leaves the phone, and the radius is capped.
    final la = (lat * 100).round() / 100;
    final lo = (lon * 100).round() / 100;
    final nm = kmToNm(radiusKm).ceil().clamp(5, 100);
    final http.Response res;
    try {
      res = await _client.get(_uri(la, lo, nm)).timeout(const Duration(seconds: 10));
    } catch (e) {
      throw AircraftFetchException('$e');
    }
    if (res.statusCode != 200) throw AircraftFetchException('HTTP ${res.statusCode}');
    try {
      final body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      // Distances are measured from the true centre, not the rounded one.
      final all = parseAircraft(body, centerLat: lat, centerLon: lon);
      return all.where((a) => a.distanceKm <= radiusKm * 1.02).toList();
    } catch (e) {
      throw AircraftFetchException('Unreadable response');
    }
  }
}

/// Tries each source in turn; fails only when all of them do.
class FallbackAircraftSource implements AircraftSource {
  FallbackAircraftSource(this._sources);
  final List<AircraftSource> _sources;

  @override
  Future<List<NearbyAircraft>> around(double lat, double lon, double radiusKm) async {
    AircraftFetchException? last;
    for (final s in _sources) {
      try {
        return await s.around(lat, lon, radiusKm);
      } on AircraftFetchException catch (e) {
        last = e;
      }
    }
    throw last ?? AircraftFetchException('No aircraft source');
  }
}

final aircraftSourceProvider = Provider<AircraftSource>((ref) {
  final client = ref.watch(httpClientProvider);
  return FallbackAircraftSource([ReadsbAircraftSource.adsbLol(client), ReadsbAircraftSource.adsbFi(client)]);
});
