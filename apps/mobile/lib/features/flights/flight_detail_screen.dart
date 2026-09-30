import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/share_text.dart';
import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/external.dart';
import '../../data/stores.dart';
import '../../domain/airlines.dart';
import '../../domain/connections.dart';
import '../../domain/flight.dart';
import '../../domain/ics.dart';
import '../../domain/manual_flight.dart';
import 'connection_widgets.dart';
import 'lounge_card.dart';
import 'trip_info_card.dart';
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
    if (flight.isManual) return _ManualDetail(flight: flight);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final now = ref.watch(clockProvider)().toUtc();
    final countries = ref.watch(airportCountriesProvider).asData?.value;
    final connections = findConnections(ref.watch(myFlightsProvider), now, countryOf: countries == null ? null : (iata) => countries[iata])
        .where((c) => c.from.id == flight.id || c.to.id == flight.id);
    return Scaffold(
      appBar: AppBar(
        title: Text(flight.ident),
        actions: [
          IconButton(
            tooltip: s.shareFlight,
            icon: const Icon(Icons.ios_share),
            onPressed: () => ref.read(externalActionsProvider).share(text: flightShareText(s, flight), subject: _title(flight)),
          ),
          IconButton(
            tooltip: s.addToCalendar,
            icon: const Icon(Icons.event_available_outlined),
            onPressed: () => _addToCalendar(ref, s, flight),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(myFlightsProvider.notifier).refreshAll(force: true),
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
          Row(children: [
            Text(flight.origin.iata, style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Icon(Icons.arrow_forward)),
            Text(flight.destination.iata, style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const Spacer(),
            StatusChip(flight),
          ]),
          Text('${flight.origin.city ?? ''} – ${flight.destination.city ?? ''}', style: t.bodyMedium?.copyWith(color: muted)),
          const SizedBox(height: 4),
          Text(countdownText(s, flight, now), style: t.titleMedium?.merge(tabular).copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          ProgressLine(progress: flight.progress(now), color: AetherColors.phase(flight.phase)),
          const SizedBox(height: 16),
          _EndpointPanel(title: s.departure, e: flight.origin, time: flight.gateOut, air: flight.takeoff, airLabel: s.takeoff),
          const SizedBox(height: 12),
          _EndpointPanel(title: s.arrival, e: flight.destination, time: flight.gateIn, air: flight.landing, airLabel: s.landing),
          const SizedBox(height: 12),
          for (final c in connections) ConnectionChip(connection: c),
          TripInfoCard(flight: flight),
          const SizedBox(height: 12),
          if (flight.phase != FlightPhase.arrived && flight.phase != FlightPhase.landed && flight.phase != FlightPhase.cancelled) ...[
            LoungeCard(flight: flight),
            const SizedBox(height: 12),
          ],
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

String _title(Flight f) => '${f.ident} ${f.origin.iata} → ${f.destination.iata}';

/// Hands a .ics file to the share sheet — pick Calendar (iOS) / Google Calendar (Android) to save the entry.
void _addToCalendar(WidgetRef ref, S s, Flight flight) {
  final now = ref.read(clockProvider)();
  final ics = flightIcs(flight, now: now, description: flightCalendarDescription(s, flight, ref.read(tripInfosProvider)[flight.id]));
  if (ics == null) return;
  final day = (flight.gateOut.best ?? now).toUtc().toIso8601String().substring(0, 10);
  ref.read(externalActionsProvider).share(text: _title(flight), subject: flight.ident, fileName: '${flight.ident}-$day.ics', fileText: ics, fileMime: 'text/calendar');
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

/// A hand-entered flight has no live data: show what we know (day, route, distance) and the traveller's own notes.
class _ManualDetail extends ConsumerWidget {
  const _ManualDetail({required this.flight});
  final Flight flight;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final f = flight;
    final day = f.gateOut.best == null ? '—' : DateFormat.yMMMMEEEEd(s.locale).format(f.gateOut.best!.toUtc());
    return Scaffold(
      appBar: AppBar(title: Text(f.ident)),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
        Row(children: [
          Text(f.origin.iata, style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Icon(Icons.arrow_forward)),
          Text(f.destination.iata, style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
        ]),
        Text('${f.origin.city ?? ''} – ${f.destination.city ?? ''}', style: t.bodyMedium?.copyWith(color: muted)),
        const SizedBox(height: 4),
        Text(day, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              _kv(context, s.statAirlines, airlineDisplayName(f.carrier, chinese: s.lang == 'zh')),
              _kv(context, s.distance, f.distanceKm == null ? '—' : '${f.distanceKm} km'),
              _kv(context, s.blockTime, '${duration(f.blockTime)} (${s.estimatedTime})'),
              _kv(context, s.dataSource, s.manualBadge),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        TripInfoCard(flight: f),
      ]),
    );
  }
}
