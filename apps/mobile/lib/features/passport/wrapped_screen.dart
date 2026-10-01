import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/external.dart';
import '../../data/stores.dart';
import '../../domain/airlines.dart';
import '../../domain/passport.dart' show flagEmoji;
import '../../domain/wrapped.dart';

/// Design size of the shareable card; captured at 3× → 1080 × 1350 px (4:5, the format social feeds like).
const wrappedCardSize = Size(360, 450);

/// The shareable "year in the air" card. Pure widget — the screen captures it as an image.
class WrappedCard extends StatelessWidget {
  const WrappedCard({super.key, required this.wrapped, required this.s});
  final WrappedStats wrapped;
  final S s;

  @override
  Widget build(BuildContext context) {
    final st = wrapped.stats;
    final km = NumberFormat.decimalPattern('en_US');
    const ink = Colors.white;
    final soft = Colors.white.withValues(alpha: 0.72);
    TextStyle base(double size, {FontWeight w = FontWeight.w400, Color? color}) =>
        TextStyle(fontSize: size, fontWeight: w, color: color ?? ink, height: 1.25, fontFeatures: const [FontFeature.tabularFigures()]);
    final month = wrapped.busiestMonth == null ? null : DateFormat.MMMM(s.locale).format(DateTime(wrapped.year, wrapped.busiestMonth!));
    final topAirline = st.airlines.isEmpty ? null : st.airlines.first;
    return SizedBox(
      width: wrappedCardSize.width,
      height: wrappedCardSize.height,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AetherColors.navy, AetherColors.night]),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 28, 28, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    'ÆtherSky',
                    style: base(14, w: FontWeight.w700, color: AetherColors.gold),
                  ),
                  const Spacer(),
                  Text(
                    s.wrappedYear(wrapped.year),
                    style: base(14, w: FontWeight.w700, color: AetherColors.gold),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Text('${st.flights}', style: base(88, w: FontWeight.w800)),
              Text(
                s.wrappedFlightsLabel(st.flights),
                style: base(20, w: FontWeight.w600, color: soft),
              ),
              const SizedBox(height: 18),
              Text('${km.format(st.distanceKm)} km', style: base(30, w: FontWeight.w800)),
              if (s.wrappedAroundEarth(st.earthLaps).isNotEmpty) Text(s.wrappedAroundEarth(st.earthLaps), style: base(14, color: soft)),
              const SizedBox(height: 4),
              Text(s.wrappedHours(st.airtime.inHours), style: base(16, w: FontWeight.w600)),
              const SizedBox(height: 16),
              if (st.countries.isNotEmpty) ...[
                Text(s.wrappedCountries(st.countries.length), style: base(14, color: soft)),
                const SizedBox(height: 4),
                Text(st.countries.take(14).map(flagEmoji).join(' '), style: base(22), maxLines: 2, overflow: TextOverflow.ellipsis),
              ],
              const Spacer(),
              if (st.topRoute != null)
                Text('${s.wrappedTopRoute}　${st.topRoute!.a} ↔ ${st.topRoute!.b}', style: base(14, w: FontWeight.w600)),
              if (topAirline != null)
                Text(
                  '${s.wrappedTopAirline}　${airlineDisplayName(topAirline.code, chinese: s.lang == 'zh')}',
                  style: base(14, w: FontWeight.w600),
                ),
              if (month != null) Text(s.wrappedBusiest(month, wrapped.busiestMonthFlights), style: base(14, w: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}

class WrappedScreen extends ConsumerStatefulWidget {
  const WrappedScreen({super.key});

  @override
  ConsumerState<WrappedScreen> createState() => _WrappedScreenState();
}

class _WrappedScreenState extends ConsumerState<WrappedScreen> {
  final _boundary = GlobalKey();
  int? _year;

  Future<Uint8List?> _capture() async {
    final render = _boundary.currentContext?.findRenderObject();
    if (render is! RenderRepaintBoundary) return null;
    final image = await render.toImage(pixelRatio: 3);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data?.buffer.asUint8List();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final flights = ref.watch(myFlightsProvider);
    final now = ref.watch(clockProvider)().toUtc();
    final countries = ref.watch(airportCountriesProvider).asData?.value;
    String? countryOf(String iata) => countries?[iata];
    final years = wrappedYears(flights, now, localTime: atAirport);
    final year = years.contains(_year) ? _year! : (years.isEmpty ? now.year : years.first);
    final wrapped = computeWrapped(flights, now, year, countryOf: countries == null ? null : countryOf, localTime: atAirport);
    final km = NumberFormat.decimalPattern('en_US').format(wrapped.stats.distanceKm);
    return Scaffold(
      appBar: AppBar(title: Text(s.wrappedEntry)),
      body: years.isEmpty
          ? Center(
              child: Padding(padding: const EdgeInsets.all(32), child: Text(s.wrappedEmpty)),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
              children: [
                if (years.length > 1)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Wrap(
                      spacing: 8,
                      children: [
                        for (final y in years)
                          ChoiceChip(label: Text('$y'), selected: y == year, onSelected: (_) => setState(() => _year = y)),
                      ],
                    ),
                  ),
                Center(
                  child: FittedBox(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(20),
                      child: RepaintBoundary(
                        key: _boundary,
                        child: WrappedCard(wrapped: wrapped, s: s),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  icon: const Icon(Icons.ios_share),
                  label: Text(s.shareImage),
                  onPressed: () async {
                    final bytes = await _capture();
                    if (bytes == null || !context.mounted) return;
                    await ref
                        .read(externalActionsProvider)
                        .share(
                          text: s.wrappedShareText(year, wrapped.stats.flights, km),
                          subject: s.wrappedEntry,
                          fileName: 'aethersky-$year.png',
                          fileBytes: bytes,
                          fileMime: 'image/png',
                        );
                  },
                ),
              ],
            ),
    );
  }
}
