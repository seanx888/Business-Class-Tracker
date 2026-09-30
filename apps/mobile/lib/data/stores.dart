import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../core/config.dart';
import '../domain/fares.dart';
import '../domain/documents.dart';
import '../domain/flight.dart';
import '../domain/geo.dart';
import '../domain/membership.dart';
import '../domain/schedule.dart';
import '../domain/settings.dart';
import '../domain/trip.dart';
import 'flight_repository.dart';

/// Overridden in main() with the real instance (and in tests with a mock).
final prefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError('prefsProvider must be overridden'));

final flightSourceProvider = Provider<FlightDataSource>(
  (ref) => AppConfig.hasApi ? ApiFlightDataSource() : DemoFlightDataSource(),
);

final httpClientProvider = Provider<http.Client>((ref) => http.Client());

/// Current time; overridden in tests so countdowns and upcoming/past grouping are deterministic.
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// Flights the user follows, kept on the device (account sync comes with the backend).
class MyFlights extends Notifier<List<Flight>> {
  static const _key = 'aether.flights.v1';

  @override
  List<Flight> build() {
    final raw = ref.read(prefsProvider).getString(_key);
    if (raw == null) return const [];
    try {
      return (jsonDecode(raw) as List).whereType<Map<String, dynamic>>().map(Flight.fromJson).toList();
    } catch (_) {
      return const [];
    }
  }

  void _save() => ref.read(prefsProvider).setString(_key, jsonEncode(state.map((f) => f.toJson()).toList()));

  /// Adds or replaces (same id) and keeps the list in departure order.
  void upsert(Flight f) {
    final list = [...state.where((x) => x.id != f.id), f];
    list.sort((a, b) => (a.gateOut.best ?? DateTime(9999)).compareTo(b.gateOut.best ?? DateTime(9999)));
    state = list;
    _save();
  }

  void remove(String id) {
    state = state.where((f) => f.id != id).toList();
    _save();
    ref.read(tripInfosProvider.notifier).remove(id);
  }

  /// Refreshes flights from the data source. By default only flights that are under way or leave within
  /// two days (far-off flights barely change and every lookup costs money); [force] — pull-to-refresh —
  /// refreshes every flight that is not finished yet.
  Future<void> refreshAll({bool force = false}) async {
    final source = ref.read(flightSourceProvider);
    final now = ref.read(clockProvider)().toUtc();
    for (final f in [...state]) {
      if (isFinished(f, now) || (!force && !needsAutoRefresh(f, now))) continue;
      try {
        final fresh = await source.refresh(f);
        if (fresh != null) upsert(fresh);
      } catch (_) {
        // keep the last known status when offline
      }
    }
  }
}

final myFlightsProvider = NotifierProvider<MyFlights, List<Flight>>(MyFlights.new);

/// Cabin / seat / booking reference the traveller entered, per Flight.id (never overwritten by server refreshes).
class TripInfos extends Notifier<Map<String, TripInfo>> {
  static const _key = 'aether.trips.v1';

  @override
  Map<String, TripInfo> build() {
    final raw = ref.read(prefsProvider).getString(_key);
    if (raw == null) return const {};
    try {
      final data = jsonDecode(raw) as Map<String, dynamic>;
      return {for (final e in data.entries) if (e.value is Map<String, dynamic>) e.key: TripInfo.fromJson(e.value as Map<String, dynamic>)};
    } catch (_) {
      return const {};
    }
  }

  void _save() => ref.read(prefsProvider).setString(_key, jsonEncode(state.map((k, v) => MapEntry(k, v.toJson()))));

  void set(String flightId, TripInfo info) {
    final next = {...state};
    if (info.isEmpty) {
      next.remove(flightId);
    } else {
      next[flightId] = info;
    }
    state = next;
    _save();
  }

  void remove(String flightId) {
    if (!state.containsKey(flightId)) return;
    state = {...state}..remove(flightId);
    _save();
  }
}

final tripInfosProvider = NotifierProvider<TripInfos, Map<String, TripInfo>>(TripInfos.new);

class Wallet extends Notifier<List<Membership>> {
  static const _key = 'aether.members.v1'; // same key and shape as the PWA

  @override
  List<Membership> build() {
    final raw = ref.read(prefsProvider).getString(_key);
    if (raw == null) return const [];
    try {
      final data = jsonDecode(raw);
      final list = data is List ? data : (data as Map<String, dynamic>)['members'] as List? ?? const [];
      return list.whereType<Map<String, dynamic>>().map(Membership.fromJson).whereType<Membership>().toList();
    } catch (_) {
      return const [];
    }
  }

  void upsert(Membership m) {
    state = [...state.where((x) => x.id != m.id), m];
    ref.read(prefsProvider).setString(_key, jsonEncode(state.map((x) => x.toJson()).toList()));
  }

  void remove(String id) {
    state = state.where((x) => x.id != id).toList();
    ref.read(prefsProvider).setString(_key, jsonEncode(state.map((x) => x.toJson()).toList()));
  }
}

final walletProvider = NotifierProvider<Wallet, List<Membership>>(Wallet.new);

/// Language override and the "when do I leave" numbers.
class Settings extends Notifier<AppSettings> {
  static const _key = 'aether.settings.v1';

  @override
  AppSettings build() {
    final raw = ref.read(prefsProvider).getString(_key);
    if (raw == null) return const AppSettings();
    try {
      return AppSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return const AppSettings();
    }
  }

  void update(AppSettings Function(AppSettings) change) {
    state = change(state);
    ref.read(prefsProvider).setString(_key, jsonEncode(state.toJson()));
  }
}

final settingsProvider = NotifierProvider<Settings, AppSettings>(Settings.new);

/// Passports, visas and IDs (kind, holder, country, expiry — never a document number), kept on the device.
class TravelDocs extends Notifier<List<TravelDoc>> {
  static const _key = 'aether.docs.v1';

  @override
  List<TravelDoc> build() {
    final raw = ref.read(prefsProvider).getString(_key);
    if (raw == null) return const [];
    try {
      return (jsonDecode(raw) as List).whereType<Map<String, dynamic>>().map(TravelDoc.fromJson).nonNulls.toList();
    } catch (_) {
      return const [];
    }
  }

  void _save() => ref.read(prefsProvider).setString(_key, jsonEncode(state.map((d) => d.toJson()).toList()));

  void upsert(TravelDoc d) {
    state = [...state.where((x) => x.id != d.id), d]..sort((a, b) => a.expiry.compareTo(b.expiry));
    _save();
  }

  void remove(String id) {
    state = state.where((d) => d.id != id).toList();
    _save();
  }
}

final travelDocsProvider = NotifierProvider<TravelDocs, List<TravelDoc>>(TravelDocs.new);

/// IATA → ISO country for the Passport stats (bundled OurAirports extract, same file the scanner uses).
final airportCountriesProvider = FutureProvider<Map<String, String>>((ref) async {
  final raw = jsonDecode(await rootBundle.loadString('assets/airport-countries.json')) as Map<String, dynamic>;
  return raw.map((k, v) => MapEntry(k, v as String));
});

/// IATA → coordinates and city (bundled OurAirports extract, same source as the country table).
final airportGeoProvider = FutureProvider<Map<String, AirportGeo>>((ref) async {
  final raw = jsonDecode(await rootBundle.loadString('assets/airport-geo.json')) as Map<String, dynamic>;
  return {for (final e in raw.entries) e.key: ?AirportGeo.fromJson(e.value)};
});

/// Land outline for the route map: rings of [lon, lat, lon, lat, …] (Natural Earth 110m, public domain).
final worldLandProvider = FutureProvider<List<List<double>>>((ref) async {
  final raw = jsonDecode(await rootBundle.loadString('assets/world-land.json')) as List;
  return [for (final ring in raw) [for (final v in ring as List) (v as num).toDouble()]];
});

Future<Map<String, dynamic>> _fetchJson(http.Client client, String file) async {
  final res = await client.get(Uri.parse('${AppConfig.dataBase}$file')).timeout(const Duration(seconds: 20));
  if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
  return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
}

final trackersProvider = FutureProvider<List<TrackerResult>>((ref) async {
  return TrackerResult.listFrom(await _fetchJson(ref.watch(httpClientProvider), 'trackers.json'));
});

final dealsProvider = FutureProvider<({List<Deal> deals, bool demo})>((ref) async {
  final json = await _fetchJson(ref.watch(httpClientProvider), 'deals.json');
  return (deals: Deal.topFrom(json), demo: json['isDemo'] == true);
});
