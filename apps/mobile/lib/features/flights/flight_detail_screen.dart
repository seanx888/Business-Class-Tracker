import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/stores.dart';
import '../../domain/flight.dart';
import 'widgets.dart';

class FlightDetailScreen extends ConsumerWidget {
  const FlightDetailScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    Flight? f;
    for (final x in ref.watch(myFlightsProvider)) {
      if (x.id == id) f = x;
    }
    if (f == null) return Scaffold(appBar: AppBar(), body: Center(child: Text(s.notFound)));
    final flight = f;
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final now = DateTime.now().toUtc();
    return Scaffold(
      appBar: AppBar(title: Text(flight.ident)),
      body: RefreshIndicator(
        onRefresh: () => ref.read(myFlightsProvider.notifier).refreshAll(),
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
          Row(children: [
            Text(flight.origin.iata, style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Icon(Icons.arrow_forward)),
            Text(flight.destination.iata, style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const Spacer(),
            StatusChip(flight),
          ]),
          Text('${flight.origin.city ?? ''} – ${flight.destination.city ?? ''}', style: t.bodyMedium?.copyWith(color: muted)),
          const SizedBox(height: 16),
          ProgressLine(progress: flight.progress(now), color: AetherColors.phase(flight.phase)),
          const SizedBox(height: 16),
          _EndpointPanel(title: s.departure, e: flight.origin, time: flight.gateOut, air: flight.takeoff, airLabel: s.takeoff),
          const SizedBox(height: 12),
          _EndpointPanel(title: s.arrival, e: flight.destination, time: flight.gateIn, air: flight.landing, airLabel: s.landing),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                _kv(context, s.aircraft, flight.aircraftType ?? '—'),
                _kv(context, s.registration, flight.registration ?? '—'),
                _kv(context, s.distance, flight.distanceKm == null ? '—' : '${flight.distanceKm} km'),
                _kv(context, s.blockTime, duration(flight.blockTime)),
                _kv(context, s.dataSource, flight.source),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

Widget _kv(BuildContext context, String k, String v) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Text(k, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        const Spacer(),
        Text(v, style: tabular.copyWith(fontWeight: FontWeight.w600)),
      ]),
    );

class _EndpointPanel extends StatelessWidget {
  const _EndpointPanel({required this.title, required this.e, required this.time, required this.air, required this.airLabel});
  final String title;
  final String airLabel; // takeoff / landing
  final FlightEndpoint e;
  final FlightTime time; // gate
  final FlightTime air; // wheels

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final delay = time.delayMinutes;
    Widget cell(String label, String value, {bool strong = false}) => Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: t.labelSmall?.copyWith(color: muted)),
            Text(value, style: (strong ? t.titleLarge : t.titleMedium)?.merge(tabular).copyWith(fontWeight: FontWeight.w700)),
          ]),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(title, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(width: 8),
            Expanded(child: Text('${e.iata} · ${e.name ?? e.city ?? ''}', style: t.bodySmall?.copyWith(color: muted), overflow: TextOverflow.ellipsis)),
            if (delay != null && delay.abs() >= 5)
              Text(s.late(delay), style: t.bodySmall?.copyWith(color: delay > 0 ? AetherColors.delayed : AetherColors.onTime, fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            cell(s.scheduled, hhmm(time.scheduled, e.timeZone)),
            cell(time.actual != null ? s.actual : s.estimated, hhmm(time.actual ?? time.estimated, e.timeZone), strong: true),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            cell(s.terminal, e.terminal ?? '—'),
            cell(s.gate, e.gate ?? '—'),
            if (e.baggage != null) cell(s.baggage, e.baggage!),
          ]),
          if (air.best != null) ...[
            const SizedBox(height: 8),
            Text('$airLabel ${hhmm(air.best, e.timeZone)} · ${air.actual != null ? s.actual : s.estimated}', style: t.bodySmall?.copyWith(color: muted)),
          ],
        ]),
      ),
    );
  }
}
