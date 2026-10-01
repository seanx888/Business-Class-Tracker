import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../domain/weather.dart';
import 'stores.dart';

/// Weather is decoration: any failure (offline, out of range, service down) returns null and the card simply stays hidden.
abstract class WeatherSource {
  Future<DayWeather?> forecast(double lat, double lon, DateTime day);
}

/// Open-Meteo (no API key; CC BY 4.0 — the card credits it). Free for non-commercial use; a commercial launch needs their
/// paid plan or another provider behind this interface.
class OpenMeteoWeatherSource implements WeatherSource {
  OpenMeteoWeatherSource(this._client);
  final http.Client _client;

  @override
  Future<DayWeather?> forecast(double lat, double lon, DateTime day) async {
    final iso = day.toIso8601String().substring(0, 10);
    final uri = Uri.https('api.open-meteo.com', '/v1/forecast', {
      'latitude': lat.toStringAsFixed(2),
      'longitude': lon.toStringAsFixed(2),
      'daily': 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      'timezone': 'auto',
      'start_date': iso,
      'end_date': iso,
    });
    try {
      final res = await _client.get(uri).timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return null;
      return parseOpenMeteoDaily(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>, day);
    } catch (_) {
      return null;
    }
  }
}

final weatherSourceProvider = Provider<WeatherSource>((ref) => OpenMeteoWeatherSource(ref.watch(httpClientProvider)));

typedef WeatherQuery = ({double lat, double lon, String day});

/// Cached per (place, day) for the life of the app session.
final weatherProvider = FutureProvider.family<DayWeather?, WeatherQuery>((ref, q) {
  return ref.watch(weatherSourceProvider).forecast(q.lat, q.lon, DateTime.parse(q.day));
});
