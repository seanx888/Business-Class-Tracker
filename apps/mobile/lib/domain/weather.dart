// Destination weather for the arrival day. Only the forecast numbers and the WMO weather code live here; the network call
// is in data/weather_source.dart so this stays pure and testable.

enum WeatherKind { clear, partlyCloudy, cloudy, fog, drizzle, rain, showers, snow, thunder }

/// WMO weather interpretation codes (used by Open-Meteo) → a kind we can draw and name.
WeatherKind weatherKindOf(int code) {
  if (code == 0 || code == 1) return WeatherKind.clear;
  if (code == 2) return WeatherKind.partlyCloudy;
  if (code == 3) return WeatherKind.cloudy;
  if (code == 45 || code == 48) return WeatherKind.fog;
  if (code >= 51 && code <= 57) return WeatherKind.drizzle;
  if (code >= 61 && code <= 67) return WeatherKind.rain;
  if (code >= 71 && code <= 77) return WeatherKind.snow;
  if (code >= 80 && code <= 82) return WeatherKind.showers;
  if (code == 85 || code == 86) return WeatherKind.snow;
  if (code >= 95 && code <= 99) return WeatherKind.thunder;
  return WeatherKind.cloudy;
}

class DayWeather {
  const DayWeather({required this.day, required this.minC, required this.maxC, required this.code, this.precipitationPercent});

  /// Calendar day at the destination (UTC midnight of that date).
  final DateTime day;
  final double minC;
  final double maxC;
  final int code;
  final int? precipitationPercent;

  WeatherKind get kind => weatherKindOf(code);

  /// Worth a "bring an umbrella" nudge.
  bool get wet =>
      (precipitationPercent ?? 0) >= 50 ||
      const {WeatherKind.rain, WeatherKind.showers, WeatherKind.thunder, WeatherKind.snow}.contains(kind);
}

/// Parses an Open-Meteo `daily` response for the single requested [day]; null when the payload does not contain it.
DayWeather? parseOpenMeteoDaily(Map<String, dynamic> json, DateTime day) {
  final daily = json['daily'];
  if (daily is! Map<String, dynamic>) return null;
  final times = daily['time'];
  if (times is! List) return null;
  final iso = day.toIso8601String().substring(0, 10);
  final i = times.indexOf(iso);
  if (i < 0) return null;
  num? at(String key) {
    final v = daily[key];
    return v is List && i < v.length && v[i] is num ? v[i] as num : null;
  }

  final min = at('temperature_2m_min');
  final max = at('temperature_2m_max');
  final code = at('weather_code');
  if (min == null || max == null || code == null) return null;
  return DayWeather(
    day: DateTime.utc(day.year, day.month, day.day),
    minC: min.toDouble(),
    maxC: max.toDouble(),
    code: code.round(),
    precipitationPercent: at('precipitation_probability_max')?.round(),
  );
}

/// Forecasts exist for today and the next ~15 days.
const forecastHorizon = Duration(days: 15);
