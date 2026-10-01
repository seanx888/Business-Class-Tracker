import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/stores.dart';
import '../../data/weather_source.dart';
import '../../domain/flight.dart';
import '../../domain/manual_flight.dart';
import '../../domain/schedule.dart';
import '../../domain/weather.dart';

IconData weatherIcon(WeatherKind k) => switch (k) {
  WeatherKind.clear => Icons.wb_sunny_outlined,
  WeatherKind.partlyCloudy => Icons.wb_cloudy_outlined,
  WeatherKind.cloudy => Icons.cloud_outlined,
  WeatherKind.fog => Icons.foggy,
  WeatherKind.drizzle => Icons.grain,
  WeatherKind.rain => Icons.water_drop_outlined,
  WeatherKind.showers => Icons.umbrella_outlined,
  WeatherKind.snow => Icons.ac_unit,
  WeatherKind.thunder => Icons.thunderstorm_outlined,
};

/// Forecast for the day you land, at the destination. Silent when there is nothing to show (offline, too far ahead, no coordinates).
class WeatherCard extends ConsumerWidget {
  const WeatherCard({super.key, required this.flight, required this.now});
  final Flight flight;
  final DateTime now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final f = flight;
    if (f.isManual || f.cancelled || isFinished(f, now)) return const SizedBox.shrink();
    final arrival = f.gateIn.best ?? f.landing.best;
    final geo = ref.watch(airportGeoProvider).asData?.value[f.destination.iata];
    if (arrival == null || geo == null) return const SizedBox.shrink();
    final local = atAirport(arrival, f.destination.timeZone);
    final day = DateTime.utc(local.year, local.month, local.day);
    final today = DateTime.utc(now.year, now.month, now.day);
    if (day.isBefore(today) || day.difference(today) > forecastHorizon) return const SizedBox.shrink();

    final weather = ref.watch(weatherProvider((lat: geo.lat, lon: geo.lon, day: day.toIso8601String().substring(0, 10)))).asData?.value;
    if (weather == null) return const SizedBox.shrink();
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final city = f.destination.city ?? f.destination.iata;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(s.weatherTitle(city), style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(weatherIcon(weather.kind), size: 36),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${weather.minC.round()}° – ${weather.maxC.round()}°  ${s.weatherKind(weather.kind)}',
                          style: t.titleMedium?.merge(tabular).copyWith(fontWeight: FontWeight.w700),
                        ),
                        if (weather.precipitationPercent != null) Text(s.precipChance(weather.precipitationPercent!), style: t.bodyMedium),
                        if (weather.wet)
                          Text(
                            s.bringUmbrella,
                            style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: AetherColors.air),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(s.weatherCredit, style: t.bodySmall?.copyWith(color: muted)),
            ],
          ),
        ),
      ),
    );
  }
}
