import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/external.dart';
import '../../data/stores.dart';
import '../../domain/aircraft_types.dart';
import '../../domain/airlines.dart';
import '../../domain/logbook.dart';
import '../../domain/trip.dart';
import '../flights/manual_flight_sheet.dart';
import 'log_entry_sheet.dart';
import 'log_widgets.dart';

/// Every flight that happened, with what the traveller recorded about it, and the statistics FlightMemory-style logbooks give.
class LogbookScreen extends ConsumerStatefulWidget {
  const LogbookScreen({super.key});

  @override
  ConsumerState<LogbookScreen> createState() => _LogbookScreenState();
}

class _LogbookScreenState extends ConsumerState<LogbookScreen> {
  bool _stats = false;

  Future<void> _export(List<LogEntry> entries) async {
    final s = S.of(context);
    final csv = logbookCsv(
      entries,
      dateOf: (e) {
        final d = entryLocalDeparture(e, atAirport);
        return d == null ? '' : DateFormat('yyyy-MM-dd').format(d);
      },
      airlineName: (c) => airlineDisplayName(c),
    );
    await ref
        .read(externalActionsProvider)
        .share(
          text: s.logExportText(entries.length),
          subject: s.logExportSubject,
          fileName: s.logExportFile,
          fileText: csv,
          fileMime: 'text/csv',
        );
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final now = ref.watch(clockProvider)().toUtc();
    final entries = logEntries(ref.watch(myFlightsProvider), ref.watch(tripInfosProvider), now);
    return Scaffold(
      appBar: AppBar(
        title: Text(s.logbook),
        actions: [
          IconButton(
            tooltip: s.manualTitle,
            icon: const Icon(Icons.edit_calendar_outlined),
            onPressed: () => showManualFlightSheet(context),
          ),
          if (entries.isNotEmpty) IconButton(tooltip: s.logExport, icon: const Icon(Icons.ios_share), onPressed: () => _export(entries)),
        ],
      ),
      body: entries.isEmpty
          ? const _EmptyLog()
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: SegmentedButton<bool>(
                    showSelectedIcon: false,
                    segments: [
                      ButtonSegment(value: false, label: Text(s.logEntriesTab), icon: const Icon(Icons.view_list_outlined, size: 18)),
                      ButtonSegment(value: true, label: Text(s.logStatsTab), icon: const Icon(Icons.bar_chart_outlined, size: 18)),
                    ],
                    selected: {_stats},
                    onSelectionChanged: (v) => setState(() => _stats = v.first),
                  ),
                ),
                Expanded(
                  child: _stats ? _StatsView(stats: computeLogbook(entries)) : _EntriesView(entries: entries),
                ),
              ],
            ),
    );
  }
}

class _EmptyLog extends StatelessWidget {
  const _EmptyLog();

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ExcludeSemantics(child: Icon(Icons.menu_book_outlined, size: 40)),
            const SizedBox(height: 12),
            Text(
              s.logEmptyTitle,
              style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(s.logEmptyHint, style: t.bodyMedium, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => showManualFlightSheet(context),
              icon: const Icon(Icons.edit_calendar_outlined),
              label: Text(s.manualTitle),
            ),
          ],
        ),
      ),
    );
  }
}

/// Year headings and entries in one virtualised list.
class _EntriesView extends StatelessWidget {
  const _EntriesView({required this.entries});
  final List<LogEntry> entries;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final items = <Object>[];
    int? year;
    var first = true;
    for (final e in entries) {
      final y = entryYear(e, atAirport);
      if (first || y != year) {
        final count = entries.where((x) => entryYear(x, atAirport) == y).length;
        items.add((year: y, count: count));
        year = y;
        first = false;
      }
      items.add(e);
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
      itemCount: items.length,
      itemBuilder: (context, i) {
        final item = items[i];
        if (item is LogEntry) return _EntryTile(entry: item);
        final h = item as ({int? year, int count});
        return Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 4),
          child: Semantics(
            header: true,
            child: Row(
              children: [
                Text(
                  h.year == null ? s.logUnknownYear : '${h.year}',
                  style: t.titleSmall?.merge(tabular).copyWith(fontWeight: FontWeight.w800),
                ),
                const Spacer(),
                Text(s.flightCount(h.count), style: t.bodySmall?.merge(tabular).copyWith(color: muted)),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _EntryTile extends ConsumerWidget {
  const _EntryTile({required this.entry});
  final LogEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final e = entry;
    final local = entryLocalDeparture(e, atAirport);
    final type = e.aircraftType == null ? null : aircraftTypeName(e.aircraftType!);
    final meta = [airlineDisplayName(e.airline, chinese: s.lang == 'zh'), ?type, if (e.cabin != null) s.cabinName(e.cabin!)].join('  ·  ');
    final overall = e.log.rating(RatingAspect.overall);
    final hasText = (e.log.experience ?? '').isNotEmpty;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => showLogEntrySheet(context, e.flight),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 56,
                child: Text(
                  local == null ? '' : DateFormat.MMMd(s.locale).format(local),
                  style: t.bodyMedium?.merge(tabular).copyWith(color: muted),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${e.flight.ident}  ${e.flight.origin.iata} → ${e.flight.destination.iata}',
                      style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      meta,
                      style: t.bodySmall?.copyWith(color: muted),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (hasText)
                    Padding(
                      padding: const EdgeInsets.only(left: 6),
                      child: Icon(Icons.notes, size: 16, color: muted, semanticLabel: s.logExperience),
                    ),
                  if (e.log.photos.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(left: 6),
                      child: Icon(Icons.photo_outlined, size: 16, color: muted, semanticLabel: s.logPhotos),
                    ),
                  if (overall != null)
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: RatingBadge(label: s.ratingName(RatingAspect.overall), value: overall, showLabel: false),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatsView extends StatelessWidget {
  const _StatsView({required this.stats});
  final LogbookStats stats;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final km = NumberFormat.decimalPattern('en_US');

    Widget tile(String label, String value) => Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: t.labelMedium?.copyWith(color: muted)),
              const SizedBox(height: 2),
              Text(value, style: t.headlineSmall?.merge(tabular).copyWith(fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ),
    );

    Widget heading(String text) => Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 8),
      child: Semantics(
        header: true,
        child: Text(text, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
      ),
    );

    List<Widget> bars(List<({String label, String? sub, int count, String? trailing})> rows) {
      final max = rows.fold<int>(1, (m, r) => r.count > m ? r.count : m);
      return [for (final r in rows) _BarRow(label: r.label, sub: r.sub, count: r.count, fraction: r.count / max, trailing: r.trailing)];
    }

    final top = 10;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
      children: [
        Row(
          children: [
            tile(s.statFlights, '${stats.flights}'),
            const SizedBox(width: 12),
            tile(s.statDistance, '${km.format(stats.distanceKm)} km'),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          [
            s.logStatReviewed(stats.reviewed),
            s.logStatPhotos(stats.photos),
            if (stats.registrations > 0) s.logStatTails(stats.registrations),
          ].join('  ·  '),
          style: t.bodySmall?.copyWith(color: muted),
        ),
        heading(s.statAirlines),
        ...bars([
          for (final a in stats.airlines.take(top))
            (label: airlineDisplayName(a.key, chinese: s.lang == 'zh'), sub: a.key, count: a.flights, trailing: '${km.format(a.km)} km'),
        ]),
        heading(s.logStatAircraft),
        if (stats.aircraftTypes.isEmpty)
          Text(s.logStatNoAircraft, style: t.bodyMedium?.copyWith(color: muted))
        else
          ...bars([
            for (final a in stats.aircraftTypes.take(top))
              (label: aircraftTypeName(a.key) ?? a.key, sub: a.key, count: a.flights, trailing: null),
          ]),
        heading(s.logStatCabins),
        if (stats.cabins.isEmpty)
          Text(s.logStatNoCabins, style: t.bodyMedium?.copyWith(color: muted))
        else
          ...bars([
            for (final c in Cabin.values)
              if (stats.cabins[c] != null) (label: s.cabinName(c), sub: null, count: stats.cabins[c]!, trailing: null),
          ]),
        if (stats.purposes.isNotEmpty) ...[
          heading(s.logStatPurpose),
          ...bars([
            for (final p in TripPurpose.values)
              if (stats.purposes[p] != null) (label: s.purposeName(p), sub: null, count: stats.purposes[p]!, trailing: null),
          ]),
        ],
        heading(s.logStatRatings),
        if (stats.ratings.isEmpty)
          Text(s.logNoRatingsYet, style: t.bodyMedium?.copyWith(color: muted))
        else
          for (final a in RatingAspect.values)
            if (stats.ratings[a] != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Expanded(child: Text(s.ratingName(a), style: t.bodyMedium)),
                    RatingBadge(
                      label: s.ratingName(a),
                      value: double.parse(stats.ratings[a]!.average.toStringAsFixed(1)),
                      showLabel: false,
                    ),
                    const SizedBox(width: 8),
                    Text('(${stats.ratings[a]!.count})', style: t.bodySmall?.merge(tabular).copyWith(color: muted)),
                  ],
                ),
              ),
      ],
    );
  }
}

/// A label, its count and (optionally) a secondary figure, over a bare rounded bar: no track behind it.
class _BarRow extends StatelessWidget {
  const _BarRow({required this.label, required this.sub, required this.count, required this.fraction, required this.trailing});
  final String label;
  final String? sub;
  final int count;
  final double fraction;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Semantics(
        container: true,
        label: '$label${sub == null ? '' : ' $sub'}, $count${trailing == null ? '' : ', $trailing'}',
        excludeSemantics: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(label, style: t.bodyMedium, overflow: TextOverflow.ellipsis),
                ),
                if (sub != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text(sub!, style: t.bodySmall?.merge(tabular).copyWith(color: muted)),
                  ),
                const SizedBox(width: 12),
                Text('$count', style: t.bodyMedium?.merge(tabular).copyWith(fontWeight: FontWeight.w700)),
                if (trailing != null)
                  SizedBox(
                    width: 92,
                    child: Text(
                      trailing!,
                      textAlign: TextAlign.end,
                      style: t.bodySmall?.merge(tabular).copyWith(color: muted),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            FractionallySizedBox(
              widthFactor: fraction.clamp(0.02, 1.0),
              child: Container(
                height: 6,
                decoration: BoxDecoration(color: AetherColors.air, borderRadius: BorderRadius.circular(3)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
