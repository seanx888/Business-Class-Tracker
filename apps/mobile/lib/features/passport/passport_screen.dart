import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/stores.dart';
import '../../domain/airlines.dart';
import '../../domain/passport.dart';
import '../flights/manual_flight_sheet.dart';

/// Lifetime stats from every tracked flight that is now over.
class PassportScreen extends ConsumerWidget {
  const PassportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final flights = ref.watch(myFlightsProvider);
    final now = ref.watch(clockProvider)().toUtc();
    final countries = ref.watch(airportCountriesProvider).asData?.value;
    final stats = computePassport(flights, now, countryOf: countries == null ? null : (iata) => countries[iata], localTime: atAirport);
    final km = NumberFormat.decimalPattern('en_US');

    Widget tile(String label, String value, {String? sub}) => Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: t.labelMedium?.copyWith(color: muted)),
              const SizedBox(height: 2),
              Text(value, style: t.headlineSmall?.merge(tabular).copyWith(fontWeight: FontWeight.w800)),
              if (sub != null) Text(sub, style: t.bodySmall?.copyWith(color: muted)),
            ],
          ),
        ),
      ),
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(s.passport),
        actions: [IconButton(tooltip: s.manualTitle, icon: const Icon(Icons.edit_calendar_outlined), onPressed: () => showManualFlightSheet(context))],
      ),
      body: stats.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(s.passportEmpty, textAlign: TextAlign.center, style: t.bodyLarge),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: () => showManualFlightSheet(context),
                    icon: const Icon(Icons.edit_calendar_outlined),
                    label: Text(s.manualTitle),
                  ),
                ]),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: FilledButton.tonalIcon(
                    icon: const Icon(Icons.auto_awesome),
                    label: Text(s.wrappedEntry),
                    onPressed: () => context.go('/flights/passport/wrapped'),
                  ),
                ),
                Row(
                  children: [
                    tile(s.statFlights, '${stats.flights}'),
                    const SizedBox(width: 12),
                    tile(
                      s.statDistance,
                      '${km.format(stats.distanceKm)} km',
                      sub: stats.distanceKm > 0 ? s.earthLaps(stats.earthLaps) : null,
                    ),
                  ],
                ),
                if (stats.unmeasured > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(s.distanceLowerBound, style: t.bodySmall?.copyWith(color: muted)),
                  ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    tile(s.statAirtime, duration(stats.airtime)),
                    const SizedBox(width: 12),
                    tile(s.statAirports, '${stats.airports.length}'),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    tile(s.statCountries, '${stats.countries.length}'),
                    const SizedBox(width: 12),
                    tile(s.statAirlines, '${stats.airlines.length}'),
                  ],
                ),
                if (stats.countries.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final c in stats.countries) Chip(label: Text('${flagEmoji(c)} $c'), visualDensity: VisualDensity.compact),
                    ],
                  ),
                ],
                if (stats.topRoute != null) ...[
                  const SizedBox(height: 20),
                  Text(s.statTopRoute, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(
                    '${stats.topRoute!.a} ↔ ${stats.topRoute!.b} · ${s.flightCount(stats.topRoute!.flights)}',
                    style: t.titleLarge?.merge(tabular),
                  ),
                ],
                if (stats.longest != null) ...[
                  const SizedBox(height: 20),
                  Text(s.statLongest, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(
                    '${stats.longest!.ident} · ${stats.longest!.origin.iata} → ${stats.longest!.destination.iata} · ${km.format(stats.longest!.distanceKm)} km',
                    style: t.bodyLarge?.merge(tabular),
                  ),
                ],
                const SizedBox(height: 20),
                Text(s.statAirlines, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                for (final a in stats.airlines.take(8))
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(airlineDisplayName(a.code, chinese: s.lang == 'zh')),
                    leading: Text(a.code, style: t.labelLarge?.copyWith(fontWeight: FontWeight.w700)),
                    trailing: Text(s.flightCount(a.flights), style: tabular),
                  ),
                const SizedBox(height: 12),
                Text(s.statByYear, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                for (final e in stats.byYear.entries)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        SizedBox(width: 44, child: Text('${e.key}', style: tabular)),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: e.value / stats.byYear.values.reduce((a, b) => a > b ? a : b),
                              minHeight: 10,
                              color: AetherColors.air,
                            ),
                          ),
                        ),
                        SizedBox(
                          width: 36,
                          child: Text('${e.value}', textAlign: TextAlign.end, style: tabular),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}
