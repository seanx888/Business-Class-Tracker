import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../core/config.dart';
import '../domain/fares.dart';
import '../domain/flight.dart';
import '../domain/membership.dart';
import 'flight_repository.dart';

/// Overridden in main() with the real instance (and in tests with a mock).
final prefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError('prefsProvider must be overridden'));

final flightSourceProvider = Provider<FlightDataSource>(
  (ref) => AppConfig.hasApi ? ApiFlightDataSource() : DemoFlightDataSource(),
);

final httpClientProvider = Provider<http.Client>((ref) => http.Client());

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
  }

  Future<void> refreshAll() async {
    final source = ref.read(flightSourceProvider);
    for (final f in [...state]) {
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
