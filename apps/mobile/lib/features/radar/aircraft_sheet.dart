import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/external.dart';
import '../../domain/aircraft_types.dart';
import '../../domain/airlines.dart';
import '../../domain/nearby.dart';
import '../flights/flights_screen.dart' show showAddFlightSheet;
import 'radar_format.dart';

/// Airline name for a callsign ("EVA198" → "EVA Air"), or null when the airline is not known.
String? airlineOf(NearbyAircraft a, {required bool chinese}) {
  final iata = a.callsign.iata;
  return iata == null ? null : airlineDisplayName(iata, chinese: chinese);
}

Future<void> showAircraftSheet(BuildContext context, NearbyAircraft a) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => AircraftSheet(aircraft: a),
  );
}

class AircraftSheet extends ConsumerWidget {
  const AircraftSheet({super.key, required this.aircraft});
  final NearbyAircraft aircraft;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final a = aircraft;
    final airline = airlineOf(a, chinese: s.lang == 'zh');
    final iataFlight = a.callsign.iataFlight;
    Widget kv(String k, String v) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Text(k, style: TextStyle(color: muted)),
          const Spacer(),
          Flexible(
            child: Text(
              v,
              textAlign: TextAlign.end,
              overflow: TextOverflow.ellipsis,
              style: tabular.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(a.label, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            if (airline != null || iataFlight != null)
              Text([?airline, ?iataFlight].join('  '), style: t.bodyMedium?.copyWith(color: muted)),
            if (a.emergencySquawk)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline, size: 18, color: AetherColors.bad),
                    const SizedBox(width: 6),
                    Text(
                      s.radarEmergency(a.squawk!),
                      style: t.bodyMedium?.copyWith(color: AetherColors.bad, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            kv(s.radarAircraft, a.typeDescription ?? aircraftTypeName(a.type) ?? '—'),
            kv(s.radarRegistration, a.registration ?? '—'),
            kv(s.radarAltitude, altitudeText(s, a)),
            kv(s.radarSpeed, speedText(a)),
            kv(s.radarHeading, headingText(a)),
            kv(s.radarVertical, '${verticalRateText(a)}  ${s.radarTrend(a.trend)}'),
            kv(s.radarDistance, distanceText(a)),
            if (a.squawk != null && !a.emergencySquawk) kv(s.radarSquawk, a.squawk!),
            if (a.seenSeconds != null) kv(s.radarSeen, s.radarSecondsAgo(a.seenSeconds!.round())),
            const SizedBox(height: 12),
            if (iataFlight != null)
              FilledButton.icon(
                icon: const Icon(Icons.add_road),
                label: Text(s.radarTrack),
                onPressed: () {
                  Navigator.of(context).pop();
                  showAddFlightSheet(context, initial: iataFlight);
                },
              ),
            if (a.callsign.raw.isNotEmpty) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                icon: const Icon(Icons.open_in_new, size: 18),
                label: Text(s.radarOpenFr24),
                onPressed: () async {
                  final messenger = ScaffoldMessenger.of(context);
                  final ok = await ref
                      .read(externalActionsProvider)
                      .openUrl(Uri.https('www.flightradar24.com', '/${a.callsign.raw.toLowerCase()}'));
                  if (!ok) messenger.showSnackBar(SnackBar(content: Text(s.openFail)));
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}
