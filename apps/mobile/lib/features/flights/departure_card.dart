import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/external.dart';
import '../../data/stores.dart';
import '../../domain/airlines.dart';
import '../../domain/connections.dart';
import '../../domain/departure_plan.dart';
import '../../domain/flight.dart';
import '../../domain/manual_flight.dart';

/// Is this a border crossing? Unknown countries count as international (the longer, safer buffer).
bool isInternational(Flight f, String? Function(String iata)? countryOf) {
  final a = countryOf?.call(f.origin.iata);
  final b = countryOf?.call(f.destination.iata);
  return a == null || b == null || a != b;
}

/// The plan for leaving home, or null when it does not apply: hand-entered or finished flights, and the second leg of a
/// connection (you are already at the airport).
DeparturePlan? departurePlanFor(WidgetRef ref, Flight f, {required DateTime now}) {
  if (f.isManual) return null;
  final countries = ref.watch(airportCountriesProvider).asData?.value;
  String? countryOf(String i) => countries?[i];
  final isConnectionLeg = findConnections(ref.watch(myFlightsProvider), now, countryOf: countryOf).any((c) => c.to.id == f.id);
  if (isConnectionLeg) return null;
  final travel = ref.watch(tripInfosProvider)[f.id]?.travelMinutes;
  return planDeparture(
    f,
    ref.watch(settingsProvider).departure,
    international: isInternational(f, countries == null ? null : countryOf),
    travelOverride: travel == null ? null : Duration(minutes: travel),
  );
}

/// "Leave at 04:00 · be at the airport by 05:00 · departs 08:00", plus the online check-in prompt.
class DepartureCard extends ConsumerWidget {
  const DepartureCard({super.key, required this.flight, required this.now});
  final Flight flight;
  final DateTime now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plan = departurePlanFor(ref, flight, now: now);
    final checkIn = checkInLikelyOpen(flight, now);
    if (plan == null && !checkIn) return const SizedBox.shrink();
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final tz = flight.origin.timeZone;
    final site = airlineWebsite(flight.carrier);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (plan != null) ...[
              Row(
                children: [
                  const Icon(Icons.directions_walk, size: 20),
                  const SizedBox(width: 8),
                  Text(s.departureTitle, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                plan.leaveHome.isBefore(now) ? '${s.leaveHomeAt(hhmm(plan.leaveHome, tz))} ✓' : s.leaveHomeAt(hhmm(plan.leaveHome, tz)),
                style: t.headlineSmall
                    ?.merge(tabular)
                    .copyWith(fontWeight: FontWeight.w800, color: plan.leaveHome.isBefore(now) ? muted : null),
              ),
              Text(
                '${s.arriveAirportAt(hhmm(plan.arriveAtAirport, tz))} · ${s.departsAtTime(hhmm(plan.departure, tz))}',
                style: t.bodyMedium?.merge(tabular),
              ),
              const SizedBox(height: 2),
              Text(s.bufferNote(plan.buffer, plan.travel, plan.international), style: t.bodySmall?.copyWith(color: muted)),
            ],
            if (checkIn) ...[
              if (plan != null) const SizedBox(height: 12),
              Text(s.checkInTitle, style: t.labelLarge?.copyWith(fontWeight: FontWeight.w700)),
              Text(s.checkInHint, style: t.bodySmall?.copyWith(color: muted)),
              if (site != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    icon: const Icon(Icons.open_in_new, size: 18),
                    label: Text(s.checkInAt(airlineDisplayName(flight.carrier, chinese: s.lang == 'zh'))),
                    onPressed: () async {
                      final messenger = ScaffoldMessenger.of(context);
                      final ok = await ref.read(externalActionsProvider).openUrl(Uri.parse(site));
                      if (!ok) messenger.showSnackBar(SnackBar(content: Text(s.openFail)));
                    },
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
