import 'dart:convert';

import 'package:aethersky/data/weather_source.dart';
import 'package:aethersky/domain/weather.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, dynamic> payload({String day = '2026-10-02', num min = 17.3, num max = 22.9, num code = 3, num? pop = 72}) => {
  'daily': {
    'time': [day],
    'temperature_2m_min': [min],
    'temperature_2m_max': [max],
    'weather_code': [code],
    if (pop != null) 'precipitation_probability_max': [pop],
  },
};

void main() {
  test('WMO codes map to kinds', () {
    expect(weatherKindOf(0), WeatherKind.clear);
    expect(weatherKindOf(1), WeatherKind.clear);
    expect(weatherKindOf(2), WeatherKind.partlyCloudy);
    expect(weatherKindOf(3), WeatherKind.cloudy);
    expect(weatherKindOf(45), WeatherKind.fog);
    expect(weatherKindOf(53), WeatherKind.drizzle);
    expect(weatherKindOf(63), WeatherKind.rain);
    expect(weatherKindOf(73), WeatherKind.snow);
    expect(weatherKindOf(81), WeatherKind.showers);
    expect(weatherKindOf(86), WeatherKind.snow);
    expect(weatherKindOf(95), WeatherKind.thunder);
    expect(weatherKindOf(99), WeatherKind.thunder);
    expect(weatherKindOf(1234), WeatherKind.cloudy, reason: 'unknown codes are shown as cloud rather than crashing');
  });

  test('parse the real Open-Meteo shape for the requested day', () {
    final w = parseOpenMeteoDaily(payload(), DateTime.utc(2026, 10, 2))!;
    expect(w.minC, 17.3);
    expect(w.maxC, 22.9);
    expect(w.code, 3);
    expect(w.precipitationPercent, 72);
    expect(w.kind, WeatherKind.cloudy);
    expect(w.wet, isTrue, reason: '72 % chance of rain');
    expect(w.day, DateTime.utc(2026, 10, 2));
  });

  test('missing pieces → null, never an exception', () {
    expect(parseOpenMeteoDaily({}, DateTime.utc(2026, 10, 2)), isNull);
    expect(parseOpenMeteoDaily(payload(day: '2026-10-03'), DateTime.utc(2026, 10, 2)), isNull, reason: 'other day');
    expect(
      parseOpenMeteoDaily({
        'daily': {
          'time': ['2026-10-02'],
        },
      }, DateTime.utc(2026, 10, 2)),
      isNull,
    );
    expect(parseOpenMeteoDaily(payload(pop: null), DateTime.utc(2026, 10, 2))!.precipitationPercent, isNull);
  });

  test('"wet" needs rain-like weather or a likely chance of it', () {
    final dry = DayWeather(day: DateTime.utc(2026, 1, 1), minC: 1, maxC: 2, code: 0, precipitationPercent: 10);
    expect(dry.wet, isFalse);
    expect(DayWeather(day: DateTime.utc(2026, 1, 1), minC: 1, maxC: 2, code: 61).wet, isTrue);
    expect(DayWeather(day: DateTime.utc(2026, 1, 1), minC: 1, maxC: 2, code: 0, precipitationPercent: 60).wet, isTrue);
  });

  group('Open-Meteo source', () {
    test('asks for the right place and day, and returns the parsed weather', () async {
      late Uri seen;
      final source = OpenMeteoWeatherSource(
        MockClient((req) async {
          seen = req.url;
          return http.Response(jsonEncode(payload()), 200);
        }),
      );
      final w = await source.forecast(35.7712, 140.3912, DateTime.utc(2026, 10, 2));
      expect(w!.maxC, 22.9);
      expect(seen.host, 'api.open-meteo.com');
      expect(seen.path, '/v1/forecast');
      expect(seen.queryParameters['latitude'], '35.77');
      expect(seen.queryParameters['longitude'], '140.39');
      expect(seen.queryParameters['start_date'], '2026-10-02');
      expect(seen.queryParameters['end_date'], '2026-10-02');
      expect(seen.queryParameters['timezone'], 'auto');
      expect(seen.queryParameters['daily'], contains('weather_code'));
    });

    test('errors, timeouts, junk and non-200 all become null', () async {
      expect(
        await OpenMeteoWeatherSource(MockClient((_) async => http.Response('nope', 500))).forecast(0, 0, DateTime.utc(2026, 10, 2)),
        isNull,
      );
      expect(
        await OpenMeteoWeatherSource(MockClient((_) async => http.Response('not json', 200))).forecast(0, 0, DateTime.utc(2026, 10, 2)),
        isNull,
      );
      expect(
        await OpenMeteoWeatherSource(MockClient((_) async => throw http.ClientException('offline')))
            .forecast(0, 0, DateTime.utc(2026, 10, 2)),
        isNull,
      );
      expect(
        await OpenMeteoWeatherSource(MockClient((_) async => http.Response(jsonEncode({'error': true, 'reason': 'out of range'}), 400)))
            .forecast(0, 0, DateTime.utc(2026, 10, 2)),
        isNull,
      );
    });
  });
}
