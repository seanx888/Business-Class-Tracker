// Passport: lifetime flying stats from the flights the traveller has tracked and that are now over.
import 'flight.dart';
import 'schedule.dart';

typedef TopRoute = ({String a, String b, int flights});

class PassportStats {
  const PassportStats({
    required this.flights,
    required this.distanceKm,
    required this.unmeasured,
    required this.airtime,
    required this.airports,
    required this.countries,
    required this.airlines,
    required this.topRoute,
    required this.byYear,
    required this.longest,
  });

  final int flights;

  /// Sum of the distances the data source reported (km).
  final int distanceKm;

  /// Flown flights that had no distance, so [distanceKm] is a lower bound when this is > 0.
  final int unmeasured;
  final Duration airtime;

  /// Unique IATA codes, most visited first.
  final List<String> airports;

  /// Unique ISO country codes, most visited first.
  final List<String> countries;
  final List<({String code, int flights})> airlines;
  final TopRoute? topRoute;

  /// Flights per calendar year of departure (airport-local), oldest first.
  final Map<int, int> byYear;
  final Flight? longest;

  bool get isEmpty => flights == 0;

  /// Equator length, for the classic "times around the world" stat.
  double get earthLaps => distanceKm / 40075;
}

/// Flights that actually happened: over, and neither cancelled nor diverted.
Iterable<Flight> flownFlights(Iterable<Flight> flights, DateTime now) =>
    flights.where((f) => isFinished(f, now) && !f.cancelled && !f.diverted);

/// [countryOf] maps an IATA code to its ISO country (null when unknown); [localTime] converts a UTC instant
/// to airport-local wall-clock time so a 00:30 departure lands in the right calendar year.
PassportStats computePassport(
  Iterable<Flight> flights,
  DateTime now, {
  String? Function(String iata)? countryOf,
  DateTime Function(DateTime utc, String? timeZone)? localTime,
}) {
  final flown = flownFlights(flights, now).toList();
  var km = 0;
  var unmeasured = 0;
  var air = Duration.zero;
  final airportCount = <String, int>{};
  final countryCount = <String, int>{};
  final airlineCount = <String, int>{};
  final routeCount = <String, int>{};
  final byYear = <int, int>{};
  Flight? longest;

  void bump(Map<String, int> m, String k) => m[k] = (m[k] ?? 0) + 1;

  for (final f in flown) {
    final d = f.distanceKm;
    if (d == null) {
      unmeasured++;
    } else {
      km += d;
      if (longest == null || d > (longest.distanceKm ?? 0)) longest = f;
    }
    air += f.blockTime ?? Duration.zero;
    for (final e in [f.origin, f.destination]) {
      bump(airportCount, e.iata);
      final c = countryOf?.call(e.iata);
      if (c != null && c.isNotEmpty) bump(countryCount, c);
    }
    bump(airlineCount, f.carrier);
    final pair = [f.origin.iata, f.destination.iata]..sort();
    bump(routeCount, pair.join('-'));
    final dep = f.gateOut.best ?? f.takeoff.best;
    if (dep != null) {
      final local = (localTime ?? (t, _) => t)(dep, f.origin.timeZone);
      byYear[local.year] = (byYear[local.year] ?? 0) + 1;
    }
  }

  List<String> byFrequency(Map<String, int> m) =>
      (m.keys.toList()..sort((a, b) => m[b]!.compareTo(m[a]!) != 0 ? m[b]!.compareTo(m[a]!) : a.compareTo(b)));

  TopRoute? top;
  final routes = byFrequency(routeCount);
  if (routes.isNotEmpty) {
    final parts = routes.first.split('-');
    top = (a: parts[0], b: parts[1], flights: routeCount[routes.first]!);
  }
  final years = byYear.keys.toList()..sort();
  return PassportStats(
    flights: flown.length,
    distanceKm: km,
    unmeasured: unmeasured,
    airtime: air,
    airports: byFrequency(airportCount),
    countries: byFrequency(countryCount),
    airlines: [for (final c in byFrequency(airlineCount)) (code: c, flights: airlineCount[c]!)],
    topRoute: top,
    byYear: {for (final y in years) y: byYear[y]!},
    longest: longest,
  );
}

/// 🇹🇼 for "TW" (regional-indicator letters); empty for anything that is not two letters.
String flagEmoji(String iso) {
  final c = iso.toUpperCase();
  if (!RegExp(r'^[A-Z]{2}$').hasMatch(c)) return '';
  return String.fromCharCodes(c.codeUnits.map((u) => 0x1F1E6 + u - 0x41));
}
