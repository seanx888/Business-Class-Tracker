import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../domain/flight.dart';
import '../../domain/schedule.dart';

/// Status as colour + icon + word (never colour alone).
class StatusChip extends StatelessWidget {
  const StatusChip(this.flight, {super.key});
  final Flight flight;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final p = flight.phase;
    final color = AetherColors.phase(p);
    final icon = switch (p) {
      FlightPhase.enRoute || FlightPhase.departed => Icons.flight_takeoff,
      FlightPhase.landed || FlightPhase.arrived => Icons.flight_land,
      FlightPhase.cancelled || FlightPhase.diverted => Icons.error_outline,
      FlightPhase.delayed => Icons.schedule,
      FlightPhase.scheduled => Icons.check_circle_outline,
    };
    final delay = flight.departureDelay;
    final label = p == FlightPhase.delayed && delay != null ? '${s.phase(p)} · ${s.late(delay)}' : s.phase(p);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

/// Origin ●────✈────○ destination, filled up to the current progress.
class ProgressLine extends StatelessWidget {
  const ProgressLine({super.key, required this.progress, required this.color});
  final double progress;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final track = Theme.of(context).colorScheme.outlineVariant;
    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth;
      final x = (w - 20) * progress.clamp(0.0, 1.0);
      return SizedBox(
        height: 22,
        child: Stack(alignment: Alignment.centerLeft, children: [
          Container(height: 3, decoration: BoxDecoration(color: track, borderRadius: BorderRadius.circular(2))),
          Container(height: 3, width: x + 10, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
          Positioned(left: x, child: Transform.rotate(angle: 1.5708, child: Icon(Icons.flight, size: 20, color: color))),
        ]),
      );
    });
  }
}

class FlightCard extends StatelessWidget {
  const FlightCard({super.key, required this.flight, required this.now, this.onTap});
  final Flight flight;
  final DateTime now;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final f = flight;
    final dep = f.gateOut.best;
    final arr = f.gateIn.best;
    Widget end(FlightEndpoint e, DateTime? time, FlightTime ft, {bool right = false}) {
      final changed = ft.scheduled != null && time != null && time != ft.scheduled;
      return Column(crossAxisAlignment: right ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [
        Text(e.iata, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: 0.5)),
        Text(e.city ?? e.name ?? '', style: t.bodySmall?.copyWith(color: muted)),
        const SizedBox(height: 6),
        Text.rich(TextSpan(children: [
          TextSpan(text: hhmm(time, e.timeZone), style: t.titleMedium?.merge(tabular).copyWith(fontWeight: FontWeight.w600)),
          if (right) TextSpan(text: dayOffset(dep, f.origin.timeZone, arr, f.destination.timeZone), style: t.labelSmall),
        ])),
        if (changed) Text(hhmm(ft.scheduled, e.timeZone), style: t.bodySmall?.merge(tabular).copyWith(color: muted, decoration: TextDecoration.lineThrough)),
      ]);
    }

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Text(f.ident, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(width: 8),
              Expanded(child: Text(shortDay(dep, f.origin.timeZone, s.locale), style: t.bodySmall?.copyWith(color: muted), overflow: TextOverflow.ellipsis)),
              const SizedBox(width: 8),
              StatusChip(f),
            ]),
            const SizedBox(height: 12),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: end(f.origin, dep, f.gateOut)),
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(duration(f.blockTime), style: t.bodySmall?.copyWith(color: muted)),
              ),
              Expanded(child: end(f.destination, arr, f.gateIn, right: true)),
            ]),
            const SizedBox(height: 10),
            ProgressLine(progress: f.progress(now), color: AetherColors.phase(f.phase)),
            const SizedBox(height: 6),
            Row(children: [
              if (f.origin.gate != null) Text('${s.gate} ${f.origin.gate}', style: t.bodySmall?.copyWith(color: muted)),
              const Spacer(),
              if (f.destination.baggage != null) Text('${s.baggage} ${f.destination.baggage}', style: t.bodySmall?.copyWith(color: muted)),
            ]),
          ]),
        ),
      ),
    );
  }
}

/// Countdown line for a flight ("Departs in 3h 20m" / "Lands in ~1h 05m" / status word).
String countdownText(S s, Flight f, DateTime now) {
  switch (f.phase) {
    case FlightPhase.scheduled:
    case FlightPhase.delayed:
      final d = untilDeparture(f, now);
      return d == null ? s.phase(f.phase) : (d.inMinutes <= 0 ? s.departingNow : s.departsIn(d));
    case FlightPhase.departed:
    case FlightPhase.enRoute:
      final d = untilLanding(f, now);
      return d == null || d.inMinutes <= 0 ? s.phase(f.phase) : s.arrivesIn(d);
    default:
      return s.phase(f.phase);
  }
}

/// "Next flight" hero at the top of the list: route + a live countdown.
class NextFlightBanner extends StatelessWidget {
  const NextFlightBanner({super.key, required this.flight, required this.now, this.onTap});
  final Flight flight;
  final DateTime now;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final f = flight;
    return Card(
      color: scheme.primaryContainer,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.nextFlight, style: t.labelMedium?.copyWith(color: scheme.onPrimaryContainer.withValues(alpha: 0.75))),
            const SizedBox(height: 4),
            Text(countdownText(s, f, now), style: t.headlineSmall?.merge(tabular).copyWith(fontWeight: FontWeight.w800, color: scheme.onPrimaryContainer)),
            const SizedBox(height: 4),
            Text(
              '${f.ident} · ${f.origin.iata} → ${f.destination.iata} · ${hhmm(f.gateOut.best, f.origin.timeZone)}',
              style: t.bodyMedium?.merge(tabular).copyWith(color: scheme.onPrimaryContainer),
            ),
          ]),
        ),
      ),
    );
  }
}
