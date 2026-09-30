import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config.dart';
import '../domain/flight.dart';

/// Where flight status comes from. The real source is our backend (Supabase Edge Function
/// `flight-lookup`, which talks to FlightAware AeroAPI); the demo source keeps the app
/// usable before the backend exists and in tests.
abstract class FlightDataSource {
  Future<Flight?> lookup(String carrier, String number, DateTime date);
  Future<Flight?> refresh(Flight flight);
}

class FlightLookupException implements Exception {
  FlightLookupException(this.message);
  final String message;
  @override
  String toString() => message;
}

class ApiFlightDataSource implements FlightDataSource {
  ApiFlightDataSource({http.Client? client, String? base, String? key})
      : _client = client ?? http.Client(),
        _base = base ?? AppConfig.apiBase,
        _key = key ?? AppConfig.apiKey;

  final http.Client _client;
  final String _base;
  final String _key;

  Map<String, String> get _headers => {
        if (_key.isNotEmpty) 'apikey': _key,
        if (_key.isNotEmpty) 'Authorization': 'Bearer $_key',
      };

  String _day(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Future<Flight?> lookup(String carrier, String number, DateTime date) async {
    final uri = Uri.parse('$_base/flight-lookup').replace(queryParameters: {'ident': '$carrier$number', 'date': _day(date)});
    final res = await _client.get(uri, headers: _headers).timeout(const Duration(seconds: 20));
    if (res.statusCode == 404) return null;
    if (res.statusCode != 200) throw FlightLookupException('HTTP ${res.statusCode}');
    final body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    final flight = body['flight'];
    return flight is Map<String, dynamic> ? Flight.fromJson(flight) : null;
  }

  @override
  Future<Flight?> refresh(Flight flight) {
    final date = flight.gateOut.scheduled ?? DateTime.now().toUtc();
    return lookup(flight.carrier, flight.number, date);
  }
}

/// Deterministic demo flights: a handful of real-looking routes whose status moves with
/// the clock (boarding soon, in the air, landed), so every screen state can be seen.
class DemoFlightDataSource implements FlightDataSource {
  DemoFlightDataSource({DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;

  static const _routes = <String, List<Object>>{
    // ident: [origin, originCity, tz, destination, destCity, tz, block minutes, aircraft, km]
    'BR198': ['TPE', 'Taipei', 'Asia/Taipei', 'NRT', 'Tokyo', 'Asia/Tokyo', 190, 'B78X', 2190],
    'CI160': ['TPE', 'Taipei', 'Asia/Taipei', 'ICN', 'Seoul', 'Asia/Seoul', 150, 'A333', 1480],
    'JX2': ['TPE', 'Taipei', 'Asia/Taipei', 'LAX', 'Los Angeles', 'America/Los_Angeles', 725, 'A359', 10930],
    'KE692': ['ICN', 'Seoul', 'Asia/Seoul', 'TPE', 'Taipei', 'Asia/Taipei', 160, 'B789', 1480],
    'AF188': ['CDG', 'Paris', 'Europe/Paris', 'TPE', 'Taipei', 'Asia/Taipei', 800, 'B77W', 9800],
  };

  static List<String> get sampleIdents => _routes.keys.toList();

  @override
  Future<Flight?> lookup(String carrier, String number, DateTime date) async {
    final r = _routes['$carrier$number'];
    if (r == null) return null;
    final now = _clock().toUtc();
    final seed = '$carrier$number'.codeUnits.fold<int>(0, (a, c) => a + c);
    final sameDay = DateTime.utc(date.year, date.month, date.day) == DateTime.utc(now.year, now.month, now.day);
    // Today's flights get a departure spread around "now" so different phases show up
    // (the earliest one has landed ~70 min ago — still "current" — never straight into Past).
    final dep = sameDay
        ? now.add(Duration(minutes: [-260, -90, 45, 180, -15][seed % 5]))
        : DateTime.utc(date.year, date.month, date.day, 1 + seed % 14, (seed * 7) % 60);
    final block = Duration(minutes: r[6] as int);
    final delay = seed % 3 == 0 ? 35 : 0;
    FlightTime at(DateTime scheduled, int lateMinutes) {
      final est = scheduled.add(Duration(minutes: lateMinutes));
      return FlightTime(scheduled: scheduled, estimated: est, actual: est.isBefore(now) ? est : null);
    }

    final out = at(dep, delay);
    final off = at(dep.add(const Duration(minutes: 20)), delay);
    final on = at(dep.add(block - const Duration(minutes: 10)), delay);
    final into = at(dep.add(block), delay);
    return Flight(
      id: '$carrier$number-${date.toIso8601String().substring(0, 10)}',
      carrier: carrier,
      number: number,
      origin: FlightEndpoint(iata: r[0] as String, city: r[1] as String, timeZone: r[2] as String, terminal: '${1 + seed % 2}', gate: 'C${seed % 9 + 1}'),
      destination: FlightEndpoint(iata: r[3] as String, city: r[4] as String, timeZone: r[5] as String, terminal: '${1 + seed % 3}', gate: 'D${seed % 7 + 2}', baggage: '${seed % 12 + 1}'),
      gateOut: out,
      takeoff: off,
      landing: on,
      gateIn: into,
      aircraftType: r[7] as String,
      registration: 'B-${17800 + seed % 90}',
      distanceKm: r[8] as int,
      source: 'demo',
    );
  }

  @override
  Future<Flight?> refresh(Flight flight) => lookup(flight.carrier, flight.number, flight.gateOut.scheduled ?? _clock());
}
