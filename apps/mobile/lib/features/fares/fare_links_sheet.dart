import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../data/external.dart';
import '../../domain/airlines.dart';
import '../../domain/links.dart';

/// Bottom sheet with one-tap searches for a fare (Google Flights first — it honours the cabin),
/// plus the carrier's own site when known. Same links as the PWA.
Future<void> showFareLinksSheet(
  BuildContext context, {
  required String title,
  required FareQuery query,
  String? carrier,
  bool onlyGoogle = false,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => _FareLinksSheet(title: title, query: query, carrier: carrier, onlyGoogle: onlyGoogle),
  );
}

class _FareLinksSheet extends ConsumerWidget {
  const _FareLinksSheet({required this.title, required this.query, this.carrier, required this.onlyGoogle});
  final String title;
  final FareQuery query;
  final String? carrier;
  final bool onlyGoogle;

  Future<void> _open(BuildContext context, WidgetRef ref, String url) async {
    final s = S.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final ok = await ref.read(externalActionsProvider).openUrl(Uri.parse(url));
    if (!ok) messenger.showSnackBar(SnackBar(content: Text(s.openFail)));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final localized = FareQuery(
      origin: query.origin,
      destination: query.destination,
      departDate: query.departDate,
      returnDate: query.returnDate,
      currency: query.currency,
      lang: s.linkLang,
      gl: query.gl,
      cabin: query.cabin,
    );
    final links = onlyGoogle ? [searchLinks(localized).first] : searchLinks(localized);
    final site = carrier == null ? null : airlineUrl(carrier!);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(s.fareHint, style: t.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 12),
            for (final l in links)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.travel_explore),
                title: Text(l.label),
                subtitle: Text(s.openSearch),
                trailing: const Icon(Icons.open_in_new, size: 18),
                onTap: () => _open(context, ref, l.url),
              ),
            if (site != null)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.flight),
                title: Text('${airlineDisplayName(carrier!, chinese: s.lang == 'zh')} · ${s.airlineSite}'),
                trailing: const Icon(Icons.open_in_new, size: 18),
                onTap: () => _open(context, ref, site),
              ),
          ],
        ),
      ),
    );
  }
}
