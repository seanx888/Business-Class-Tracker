import 'package:flutter/material.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../domain/connections.dart';

Color connectionColor(ConnectionRisk r) => switch (r) {
      ConnectionRisk.ok => AetherColors.onTime,
      ConnectionRisk.tight => AetherColors.delayed,
      ConnectionRisk.critical || ConnectionRisk.missed => AetherColors.bad,
    };

/// One line between two flight cards: where you change planes, how long you have, and how safe that is
/// (colour + icon + word — never colour alone).
class ConnectionChip extends StatelessWidget {
  const ConnectionChip({super.key, required this.connection, this.onTap});
  final Connection connection;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final c = connection;
    final color = connectionColor(c.risk);
    final icon = switch (c.risk) {
      ConnectionRisk.ok => Icons.swap_horiz,
      ConnectionRisk.tight => Icons.timelapse,
      ConnectionRisk.critical || ConnectionRisk.missed => Icons.warning_amber_rounded,
    };
    final fromTerminal = c.from.destination.terminal;
    final toTerminal = c.to.origin.terminal;
    final notes = <String>[
      if (c.terminalChange && fromTerminal != null && toTerminal != null) s.terminalChangeText(fromTerminal, toTerminal),
      if (c.shrunkBy >= const Duration(minutes: 10)) s.delayShrunk(c.shrunkBy),
      if (c.risk == ConnectionRisk.missed) s.connectionMissedAdvice else if (c.risk == ConnectionRisk.critical) s.connectionCriticalAdvice,
    ];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, size: 20, color: color),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text.rich(TextSpan(children: [
                    TextSpan(text: s.connectionTitle(c.airport, c.layover), style: t.titleSmall?.merge(tabular).copyWith(fontWeight: FontWeight.w700)),
                    TextSpan(text: '  ${s.connectionRisk(c.risk)}', style: t.labelLarge?.copyWith(color: color, fontWeight: FontWeight.w700)),
                  ])),
                  for (final n in notes) Text(n, style: t.bodySmall),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
