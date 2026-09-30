import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/strings.dart';
import '../../domain/flight.dart';
import '../../domain/jetlag.dart';

/// The jet-lag plan for a flight, or null when the time-zone shift is small or a zone is unknown.
JetLagPlan? jetLagPlanFor(Flight f) {
  final dep = f.gateOut.best ?? f.takeoff.best;
  final arr = f.gateIn.best ?? f.landing.best;
  final originTz = f.origin.timeZone;
  final destTz = f.destination.timeZone;
  if (dep == null || arr == null || originTz == null || destTz == null) return null;
  final shift = atAirport(arr, destTz).timeZoneOffset - atAirport(dep, originTz).timeZoneOffset;
  return planJetLag(shiftMinutes: shift.inMinutes, arrivalLocalHour: atAirport(arr, destTz).hour);
}

class JetLagCard extends StatelessWidget {
  const JetLagCard({super.key, required this.plan});
  final JetLagPlan plan;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.bedtime_outlined, size: 20),
                const SizedBox(width: 8),
                Text(s.jetLagTitle, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 4),
            Text(s.jetLagSummary(plan), style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            for (final tip in plan.tips)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('•  ', style: t.bodyMedium),
                    Expanded(child: Text(s.jetLagTip(tip, plan), style: t.bodyMedium)),
                  ],
                ),
              ),
            const SizedBox(height: 6),
            Text(s.jetLagDisclaimer, style: t.bodySmall?.copyWith(color: muted)),
          ],
        ),
      ),
    );
  }
}
