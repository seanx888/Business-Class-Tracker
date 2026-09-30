import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/stores.dart';
import '../../domain/fares.dart';
import '../../domain/links.dart';
import 'fare_links_sheet.dart';

/// Real Tracker results and today's deals, straight from the scanner's daily files.
class FaresScreen extends ConsumerWidget {
  const FaresScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final trackers = ref.watch(trackersProvider);
    final deals = ref.watch(dealsProvider);
    Widget failed(Object e, VoidCallback retry) => ListTile(
          leading: const Icon(Icons.cloud_off_outlined),
          title: Text(s.loadFail),
          subtitle: Text('$e', maxLines: 2, overflow: TextOverflow.ellipsis),
          trailing: TextButton(onPressed: retry, child: Text(s.retry)),
        );
    return Scaffold(
      appBar: AppBar(title: Text(s.tabFares)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(trackersProvider);
          ref.invalidate(dealsProvider);
          await ref.read(trackersProvider.future).catchError((_) => <TrackerResult>[]);
        },
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
          Text(s.fareTrackers, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          Text(s.fareTrackersHint, style: t.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 8),
          ...trackers.when(
            data: (list) => list.isEmpty ? [ListTile(title: Text(s.noTrackers))] : [for (final r in list) _TrackerTile(r)],
            loading: () => const [Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))],
            error: (e, _) => [failed(e, () => ref.invalidate(trackersProvider))],
          ),
          const SizedBox(height: 20),
          Text(s.topDeals, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ...deals.when(
            data: (d) => [
              if (d.demo) Text(s.demoData, style: t.bodySmall),
              for (final deal in d.deals) _DealTile(deal),
            ],
            loading: () => const [Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))],
            error: (e, _) => [failed(e, () => ref.invalidate(dealsProvider))],
          ),
        ]),
      ),
    );
  }
}

class _TrackerTile extends StatelessWidget {
  const _TrackerTile(this.r);
  final TrackerResult r;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final change = r.changeSinceLast;
    final dates = r.returnDate == null ? isoToMd(r.depart) : '${isoToMd(r.depart)} – ${isoToMd(r.returnDate)}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => showFareLinksSheet(
            context,
            title: '${r.origin} → ${r.destination}',
            carrier: r.bestCarrier,
            onlyGoogle: true, // only Google Flights honours non-business Real Tracker cabins
            query: FareQuery(
              origin: r.origin,
              destination: r.destination,
              departDate: r.bestDepart ?? r.depart,
              returnDate: r.bestDepart != null ? r.bestReturn : r.returnDate,
              cabin: r.cabin,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${r.origin} → ${r.destination}', style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  Text([dates, if (r.flexDays > 0) s.flex(r.flexDays), r.cabin].join(' · '), style: t.bodySmall?.copyWith(color: muted)),
                  if (r.bestCarrier != null)
                    Text('${r.bestCarrier} · ${r.bestStops == 0 ? s.nonstop : s.stops(r.bestStops ?? 0)}${r.bestDepart != null && r.bestDepart != r.depart ? ' · ${isoToMd(r.bestDepart)}' : ''}',
                        style: t.bodySmall?.copyWith(color: muted)),
                ]),
              ),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(twd(r.bestPrice), style: t.titleLarge?.merge(tabular).copyWith(fontWeight: FontWeight.w800)),
                if (change != null && change != 0)
                  Text(s.vsLast('${change < 0 ? '−' : '+'}${twd(change.abs())}'),
                      style: t.bodySmall?.copyWith(color: change < 0 ? AetherColors.onTime : AetherColors.bad, fontWeight: FontWeight.w600)),
                if (r.targetHit) Text(s.targetHit, style: t.bodySmall?.copyWith(color: AetherColors.onTime, fontWeight: FontWeight.w700)),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}

class _DealTile extends StatelessWidget {
  const _DealTile(this.d);
  final Deal d;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final hot = d.tier == 'hot';
    return ListTile(
      contentPadding: EdgeInsets.zero,
      onTap: () => showFareLinksSheet(
        context,
        title: '${d.origin} → ${d.destination}',
        carrier: d.carrier,
        query: FareQuery(origin: d.origin, destination: d.destination, departDate: d.departDate, returnDate: d.returnDate),
      ),
      leading: CircleAvatar(
        backgroundColor: hot ? AetherColors.gold.withValues(alpha: 0.25) : Theme.of(context).colorScheme.surfaceContainerHighest,
        child: Text(d.carrier, style: t.labelMedium?.copyWith(fontWeight: FontWeight.w700)),
      ),
      title: Text('${d.origin} → ${d.destination}', style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text('${isoToMd(d.departDate)}${d.returnDate != null ? ' – ${isoToMd(d.returnDate)}' : ''} · ${d.stops == 0 ? s.nonstop : s.stops(d.stops)} · ${d.alliance}'),
      trailing: Text(twd(d.priceTwd), style: t.titleMedium?.merge(tabular).copyWith(fontWeight: FontWeight.w700)),
    );
  }
}
