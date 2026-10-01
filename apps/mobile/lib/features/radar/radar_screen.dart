import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/location_service.dart';
import '../../data/stores.dart';
import '../../domain/aircraft_types.dart';
import '../../domain/geo.dart';
import '../../domain/settings.dart';
import '../../domain/nearby.dart';
import 'aircraft_sheet.dart';
import 'airport_picker.dart';
import 'radar_format.dart';
import 'radar_state.dart';
import 'sky_plan.dart';

/// Radar Lite: what is flying near you (or near an airport), from a community ADS-B feed. List first, sky plan view on demand.
class RadarScreen extends ConsumerStatefulWidget {
  const RadarScreen({super.key});

  @override
  ConsumerState<RadarScreen> createState() => _RadarScreenState();
}

class _RadarScreenState extends ConsumerState<RadarScreen> {
  static const refreshEvery = Duration(seconds: 15);
  bool _sky = false;
  String? _selectedHex;
  DateTime? _updated;
  RadarQuery? _query;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(refreshEvery, (_) {
      // The tab stays alive in the background; only poll the feed while it is the one on screen.
      if (mounted && TickerMode.valuesOf(context).enabled) _refresh();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _refresh() {
    final q = _query;
    if (q != null) ref.invalidate(nearbyProvider(q));
  }

  Future<void> _open(NearbyAircraft a) async {
    setState(() => _selectedHex = a.hex);
    await showAircraftSheet(context, a);
    if (mounted) setState(() => _selectedHex = null);
  }

  Future<void> _pickAirport() async {
    final code = await showAirportPicker(context);
    if (code != null) {
      ref.read(settingsProvider.notifier).update((x) => x.copyWith(radarAirport: code, radarUseLocation: false));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final settings = ref.watch(settingsProvider);
    final geo = ref.watch(airportGeoProvider).asData?.value;

    // 1. Where are we looking?
    ({double lat, double lon, String? airport})? center;
    Widget? blocker;
    var locating = false;
    if (settings.radarUseLocation) {
      final loc = ref.watch(myLocationProvider);
      loc.when(
        data: (o) {
          if (o.hasFix) {
            center = (lat: o.lat!, lon: o.lon!, airport: null);
          } else {
            blocker = _LocationProblem(
              failure: o.failure!,
              onRetry: () => ref.invalidate(myLocationProvider),
              onSettings: () => ref.read(locationServiceProvider).openSettings(o.failure!),
              onPickAirport: _pickAirport,
            );
          }
        },
        loading: () => locating = true,
        error: (_, _) => blocker = _LocationProblem(
          failure: LocationFailure.unavailable,
          onRetry: () => ref.invalidate(myLocationProvider),
          onSettings: null,
          onPickAirport: _pickAirport,
        ),
      );
    } else {
      final g = geo?[settings.radarAirport];
      if (g == null) {
        blocker = _NeedAirport(onPick: _pickAirport);
      } else {
        center = (lat: g.lat, lon: g.lon, airport: settings.radarAirport);
      }
    }

    // 2. What is flying there?
    _query = center == null ? null : (lat: center!.lat, lon: center!.lon, radiusKm: settings.radarRadiusKm);
    Widget content;
    if (locating) {
      content = _Skeleton(label: s.radarLocating);
    } else if (blocker != null) {
      content = ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [blocker!]);
    } else {
      final q = _query!;
      ref.listen(nearbyProvider(q), (prev, next) {
        if (next.hasValue && !next.isLoading) setState(() => _updated = ref.read(clockProvider)());
      });
      final async = ref.watch(nearbyProvider(q));
      content = async.when(
        data: (list) => RefreshIndicator(
          onRefresh: () async {
            _refresh();
            try {
              await ref.read(nearbyProvider(q).future);
            } catch (_) {}
          },
          child: _Results(
            list: list,
            radiusKm: settings.radarRadiusKm,
            airport: center!.airport,
            sky: _sky,
            selectedHex: _selectedHex,
            updated: _updated,
            onSelect: _open,
          ),
        ),
        loading: () => const _Skeleton(),
        error: (e, _) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [_ErrorCard(onRetry: _refresh)],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(s.radarTitle),
        actions: [
          SegmentedButton<bool>(
            showSelectedIcon: false,
            style: const ButtonStyle(visualDensity: VisualDensity.compact),
            segments: [
              ButtonSegment(value: false, label: Text(s.radarList), icon: const Icon(Icons.view_list_outlined, size: 18)),
              ButtonSegment(value: true, label: Text(s.radarSky), icon: const Icon(Icons.radar, size: 18)),
            ],
            selected: {_sky},
            onSelectionChanged: (v) => setState(() => _sky = v.first),
          ),
          const SizedBox(width: 12),
        ],
      ),
      body: Column(
        children: [
          _Controls(geo: geo, onPickAirport: _pickAirport),
          Expanded(child: content),
        ],
      ),
    );
  }
}

class _Controls extends ConsumerWidget {
  const _Controls({required this.geo, required this.onPickAirport});
  final Map<String, AirportGeo>? geo;
  final VoidCallback onPickAirport;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final notifier = ref.read(settingsProvider.notifier);
    final st = ref.watch(settingsProvider);
    final city = geo?[st.radarAirport]?.city;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SegmentedButton<bool>(
            showSelectedIcon: false,
            segments: [
              ButtonSegment(value: true, label: Text(s.radarMyLocation), icon: const Icon(Icons.my_location, size: 18)),
              ButtonSegment(value: false, label: Text(s.radarAirport), icon: const Icon(Icons.flight_takeoff, size: 18)),
            ],
            selected: {st.radarUseLocation},
            onSelectionChanged: (v) => notifier.update((x) => x.copyWith(radarUseLocation: v.first)),
          ),
          if (!st.radarUseLocation && st.radarAirport.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: ActionChip(
                  avatar: const Icon(Icons.edit_location_alt_outlined, size: 18),
                  label: Text([st.radarAirport, if (city != null && city.isNotEmpty) city].join('  '), overflow: TextOverflow.ellipsis),
                  tooltip: s.radarPickAirport,
                  onPressed: onPickAirport,
                ),
              ),
            ),
          const SizedBox(height: 8),
          SegmentedButton<int>(
            showSelectedIcon: false,
            style: const ButtonStyle(visualDensity: VisualDensity.compact),
            segments: [for (final r in AppSettings.radarRadii) ButtonSegment(value: r, label: Text(s.radarRadius(r)))],
            selected: {st.radarRadiusKm},
            onSelectionChanged: (v) => notifier.update((x) => x.copyWith(radarRadiusKm: v.first)),
          ),
        ],
      ),
    );
  }
}

class _Results extends StatelessWidget {
  const _Results({
    required this.list,
    required this.radiusKm,
    required this.airport,
    required this.sky,
    required this.selectedHex,
    required this.updated,
    required this.onSelect,
  });
  final List<NearbyAircraft> list;
  final int radiusKm;
  final String? airport;
  final bool sky;
  final String? selectedHex;
  final DateTime? updated;
  final ValueChanged<NearbyAircraft> onSelect;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    if (list.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const ExcludeSemantics(child: Icon(Icons.radar, size: 32)),
                  const SizedBox(height: 8),
                  Text(s.radarEmptyTitle, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(s.radarEmptyHint, style: t.bodyMedium),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(s.radarAttribution, style: t.bodySmall?.copyWith(color: muted)),
        ],
      );
    }
    final summary = Semantics(
      liveRegion: true,
      child: Text(
        s.radarSummary(list.length, radiusKm, updated == null ? '…' : clockText(updated!)),
        style: t.bodySmall?.copyWith(color: muted),
      ),
    );
    final attribution = Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Text(s.radarAttribution, style: t.bodySmall?.copyWith(color: muted)),
    );
    if (sky) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          summary,
          const SizedBox(height: 8),
          SkyPlan(
            aircraft: list,
            radiusKm: radiusKm,
            centerIsAirport: airport != null,
            semanticsLabel: s.radarSkyLabel,
            selectedHex: selectedHex,
            onSelect: onSelect,
          ),
          attribution,
        ],
      );
    }
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: list.length + 2,
      itemBuilder: (context, i) {
        if (i == 0) return Padding(padding: const EdgeInsets.only(bottom: 8), child: summary);
        if (i == list.length + 1) return attribution;
        final a = list[i - 1];
        return _AircraftTile(aircraft: a, overhead: airport == null && a.isOverhead(), onTap: () => onSelect(a));
      },
    );
  }
}

class _AircraftTile extends StatelessWidget {
  const _AircraftTile({required this.aircraft, required this.overhead, required this.onTap});
  final NearbyAircraft aircraft;
  final bool overhead;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final a = aircraft;
    final airline = airlineOf(a, chinese: s.lang == 'zh');
    final type = aircraftTypeName(a.type);
    final trendIcon = switch (a.trend) {
      VerticalTrend.climbing => Icons.north_east,
      VerticalTrend.descending => Icons.south_east,
      VerticalTrend.level => Icons.east,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 56),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                a.label,
                                style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (airline != null) ...[
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(
                                  airline,
                                  style: t.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          [?type, ?a.registration].join('  '),
                          style: t.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            ExcludeSemantics(
                              child: Icon(trendIcon, size: 16, color: a.onGround ? scheme.onSurfaceVariant : AetherColors.air),
                            ),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                [altitudeText(s, a), if (!a.onGround) speedText(a)].join('  '),
                                style: t.bodySmall?.merge(tabular).copyWith(fontWeight: FontWeight.w600),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        if (overhead || a.emergencySquawk)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Wrap(
                              spacing: 8,
                              children: [
                                if (overhead) _Tag(icon: Icons.vertical_align_top, text: s.radarOverhead, color: AetherColors.air),
                                if (a.emergencySquawk)
                                  _Tag(icon: Icons.error_outline, text: s.radarEmergency(a.squawk!), color: AetherColors.bad),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(distanceText(a), style: t.bodyMedium?.merge(tabular).copyWith(fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Status as icon + word (never colour alone); the text stays in the normal ink colour so it passes contrast on the tint.
class _Tag extends StatelessWidget {
  const _Tag({required this.icon, required this.text, required this.color});
  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.onSurface),
            ),
          ),
        ],
      ),
    );
  }
}

/// Placeholder rows shaped like the real ones (no spinner, no shimmer).
class _Skeleton extends StatelessWidget {
  const _Skeleton({this.label});
  final String? label;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final fill = Theme.of(context).colorScheme.surfaceContainerHighest;
    return Semantics(
      label: label ?? s.radarLoading,
      liveRegion: true,
      child: ExcludeSemantics(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            for (var i = 0; i < 5; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  height: 84,
                  decoration: BoxDecoration(color: fill.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(16)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _LocationProblem extends StatelessWidget {
  const _LocationProblem({required this.failure, required this.onRetry, required this.onSettings, required this.onPickAirport});
  final LocationFailure failure;
  final VoidCallback onRetry;
  final VoidCallback? onSettings;
  final VoidCallback onPickAirport;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final needsSettings = failure == LocationFailure.deniedForever || failure == LocationFailure.serviceOff;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const ExcludeSemantics(child: Icon(Icons.location_off_outlined, size: 32)),
            const SizedBox(height: 8),
            Text(s.radarLocationProblem(failure), style: t.bodyLarge),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (needsSettings && onSettings != null)
                  FilledButton(onPressed: onSettings, child: Text(s.radarOpenSettings))
                else
                  FilledButton(onPressed: onRetry, child: Text(s.radarTryAgain)),
                OutlinedButton(onPressed: onPickAirport, child: Text(s.radarPickAirport)),
                if (needsSettings) TextButton(onPressed: onRetry, child: Text(s.radarTryAgain)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _NeedAirport extends StatelessWidget {
  const _NeedAirport({required this.onPick});
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const ExcludeSemantics(child: Icon(Icons.flight_takeoff, size: 32)),
            const SizedBox(height: 8),
            Text(s.radarNeedAirport, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 16),
            FilledButton(onPressed: onPick, child: Text(s.radarPickAirport)),
          ],
        ),
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const ExcludeSemantics(child: Icon(Icons.cloud_off_outlined, size: 32)),
            const SizedBox(height: 8),
            Text(s.radarErrorTitle, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(s.radarErrorHint, style: t.bodyMedium),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: Text(s.radarTryAgain)),
          ],
        ),
      ),
    );
  }
}
