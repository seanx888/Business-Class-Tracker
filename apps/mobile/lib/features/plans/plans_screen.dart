import 'package:flutter/material.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../domain/plans.dart';

/// Tier comparison (paywall preview). Purchases will go through RevenueCat.
class PlansScreen extends StatelessWidget {
  const PlansScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    String tierName(Tier x) => switch (x) { Tier.free => s.free, Tier.pro => 'Pro', Tier.elite => 'Elite' };
    return Scaffold(
      appBar: AppBar(title: Text(s.plans)),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
        Text(s.plansHint, style: t.bodyMedium?.copyWith(color: muted)),
        const SizedBox(height: 16),
        Row(children: [
          for (final tier in Tier.values)
            Expanded(
              child: Card(
                color: tier == Tier.elite ? AetherColors.navy : null,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(tierName(tier), style: t.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: tier == Tier.elite ? AetherColors.gold : null)),
                    const SizedBox(height: 4),
                    Text(
                      tier == Tier.free ? r'US$0' : 'US\$${planPrices.firstWhere((p) => p.tier == tier).yearlyUsd.toStringAsFixed(2)}',
                      style: t.titleSmall?.merge(tabular).copyWith(fontWeight: FontWeight.w700, color: tier == Tier.elite ? Colors.white : null),
                    ),
                    Text(tier == Tier.free ? ' ' : s.perYear, style: t.labelSmall?.copyWith(color: tier == Tier.elite ? Colors.white70 : muted)),
                  ]),
                ),
              ),
            ),
        ].expand((w) => [w, const SizedBox(width: 8)]).toList()..removeLast()),
        const SizedBox(height: 16),
        Card(
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 24, 0),
              child: Row(children: [
                const Spacer(),
                for (final tier in Tier.values)
                  SizedBox(width: 36, child: Text(tierName(tier), textAlign: TextAlign.center, style: t.labelSmall?.copyWith(fontWeight: FontWeight.w700, color: muted))),
              ]),
            ),
            for (final f in planFeatures)
              ListTile(
                dense: true,
                title: Text(s.lang == 'en' ? f.en : f.zh),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  for (final tier in Tier.values)
                    SizedBox(
                      width: 36,
                      child: Icon(
                        includes(tier, f.minTier) ? Icons.check_circle : Icons.remove,
                        size: 18,
                        color: includes(tier, f.minTier) ? AetherColors.onTime : muted,
                        semanticLabel: '${tierName(tier)}: ${includes(tier, f.minTier) ? '✓' : '—'}',
                      ),
                    ),
                ]),
              ),
          ]),
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: null, child: Text(s.comingSoon)),
      ]),
    );
  }
}
