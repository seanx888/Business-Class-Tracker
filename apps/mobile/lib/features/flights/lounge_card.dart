import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/external.dart';
import '../../data/stores.dart';
import '../../domain/airlines.dart';
import '../../domain/flight.dart';
import '../../domain/lounge_access.dart';
import '../../domain/trip.dart';
import 'trip_info_card.dart';

/// "Can I get into the lounge?" for one flight: your cabin + your wallet memberships against alliance rules.
class LoungeCard extends ConsumerWidget {
  const LoungeCard({super.key, required this.flight});
  final Flight flight;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final cabin = ref.watch(tripInfosProvider)[flight.id]?.cabin;
    final wallet = ref.watch(walletProvider);
    final v = checkLoungeAccess(carrier: flight.carrier, cabin: cabin, memberships: wallet);
    final zh = s.lang == 'zh';

    Widget row(IconData icon, Color? color, String text) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: t.bodyMedium)),
        ],
      ),
    );

    String describe(LoungeEntitlement e) {
      switch (e.basis) {
        case AccessBasis.ownCabin:
          return s.loungeOwnCabin(cabin ?? Cabin.business, airlineDisplayName(flight.carrier, chinese: zh));
        case AccessBasis.allianceCabin:
          return s.loungeAllianceCabin(cabin ?? Cabin.business, e.alliance);
        case AccessBasis.allianceStatus:
          final m = e.membership!;
          return s.loungeStatus(m.displayName(lang: s.lang), m.tier, e.status!.label, e.alliance, e.guests);
      }
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(s.loungeTitle, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                ),
                Text(s.loungeAt(flight.origin.iata), style: t.bodySmall?.copyWith(color: muted)),
              ],
            ),
            const SizedBox(height: 6),
            if (v.eligible)
              for (final e in v.entitlements) row(Icons.check_circle, AetherColors.onTime, describe(e))
            else if (!v.hints.contains(LoungeHint.needCabin))
              row(Icons.remove_circle_outline, muted, s.loungeNone),
            if (v.hints.contains(LoungeHint.needCabin))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(s.tripHint, style: t.bodyMedium?.copyWith(color: muted)),
                    ),
                    TextButton(onPressed: () => showTripInfoSheet(context, flight), child: Text(s.cabin)),
                  ],
                ),
              ),
            if (v.hints.contains(LoungeHint.needTier))
              row(Icons.info_outline, muted, s.loungeNeedTier(v.tierUnknownFor.map((m) => m.displayName(lang: s.lang)).join(', '))),
            if (v.hints.contains(LoungeHint.noAlliance)) row(Icons.info_outline, muted, s.loungeNoAlliance),
            if (v.hints.contains(LoungeHint.unknownCarrier)) row(Icons.info_outline, muted, s.loungeUnknownCarrier),
            const SizedBox(height: 4),
            Text(s.loungeDisclaimer, style: t.bodySmall?.copyWith(color: muted)),
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                icon: const Icon(Icons.search, size: 18),
                label: Text(s.findLounges(flight.origin.iata)),
                onPressed: () {
                  final query =
                      '${flight.origin.iata} airport lounge${v.alliance == Alliance.none ? '' : ' ${s.allianceName(v.alliance)}'}';
                  ref.read(externalActionsProvider).openUrl(Uri.https('www.google.com', '/search', {'q': query}));
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
