import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/stores.dart';
import '../../domain/documents.dart';
import '../../domain/passport.dart' show flagEmoji;

String countryLabel(String iso) => iso.isEmpty ? '' : '${flagEmoji(iso)} $iso'.trim();

/// Passports, visas and IDs with a days-left badge; problems for booked trips are raised on the flights page.
class DocumentsSection extends ConsumerWidget {
  const DocumentsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final docs = ref.watch(travelDocsProvider);
    final today = ref.watch(clockProvider)().toUtc();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: Text(s.docsTitle, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            ),
            TextButton.icon(onPressed: () => showDocumentDialog(context, ref), icon: const Icon(Icons.add), label: Text(s.addDoc)),
          ],
        ),
        Text(s.docsHint, style: t.bodySmall?.copyWith(color: muted)),
        const SizedBox(height: 8),
        if (docs.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(s.noDocs, style: t.bodyMedium?.copyWith(color: muted)),
          ),
        for (final d in docs)
          Builder(
            builder: (context) {
              final left = d.daysLeft(today);
              final color = left < 0 ? AetherColors.bad : (left <= expiringSoonDays ? AetherColors.delayed : AetherColors.onTime);
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  child: ListTile(
                    leading: Icon(switch (d.kind) {
                      DocKind.passport => Icons.menu_book_outlined,
                      DocKind.visa => Icons.approval_outlined,
                      DocKind.idCard => Icons.badge_outlined,
                      DocKind.other => Icons.description_outlined,
                    }),
                    title: Text(
                      '${s.docKindName(d.kind)} · ${d.holder}'.replaceAll(RegExp(r' · $'), ''),
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      [countryLabel(d.country), d.expiry.toIso8601String().substring(0, 10)].where((x) => x.isNotEmpty).join(' · '),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          s.docLeft(left),
                          style: t.labelMedium?.copyWith(color: color, fontWeight: FontWeight.w700),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline),
                          tooltip: s.cancel,
                          onPressed: () => ref.read(travelDocsProvider.notifier).remove(d.id),
                        ),
                      ],
                    ),
                    onTap: () => showDocumentDialog(context, ref, existing: d),
                  ),
                ),
              );
            },
          ),
      ],
    );
  }
}

Future<void> showDocumentDialog(BuildContext context, WidgetRef ref, {TravelDoc? existing}) async {
  final now = ref.read(clockProvider)();
  final doc = await showDialog<TravelDoc>(
    context: context,
    builder: (_) => _DocumentDialog(existing: existing, now: now),
  );
  if (doc != null) ref.read(travelDocsProvider.notifier).upsert(doc);
}

/// Owns its text controllers, so they are disposed only after the dialog's exit animation has finished.
class _DocumentDialog extends StatefulWidget {
  const _DocumentDialog({required this.existing, required this.now});
  final TravelDoc? existing;
  final DateTime now;

  @override
  State<_DocumentDialog> createState() => _DocumentDialogState();
}

class _DocumentDialogState extends State<_DocumentDialog> {
  late final _holder = TextEditingController(text: widget.existing?.holder ?? '');
  late final _country = TextEditingController(text: widget.existing?.country ?? '');
  late DocKind _kind = widget.existing?.kind ?? DocKind.passport;
  late DateTime? _expiry = widget.existing?.expiry;

  @override
  void dispose() {
    _holder.dispose();
    _country.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final now = widget.now;
    return AlertDialog(
      title: Text(s.addDoc),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final k in DocKind.values)
                  ChoiceChip(label: Text(s.docKindName(k)), selected: _kind == k, onSelected: (_) => setState(() => _kind = k)),
              ],
            ),
            const SizedBox(height: 12),
            TextField(controller: _holder, decoration: InputDecoration(labelText: s.holder)),
            TextField(
              controller: _country,
              maxLength: 2,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(labelText: s.countryCode, helperText: s.docCountryHint, helperMaxLines: 2, counterText: ''),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              icon: const Icon(Icons.event, size: 18),
              label: Text(_expiry == null ? s.expiryDate : '${s.expiryDate}: ${_expiry!.toIso8601String().substring(0, 10)}'),
              onPressed: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _expiry ?? now.add(const Duration(days: 365)),
                  firstDate: DateTime(now.year - 5),
                  lastDate: DateTime(now.year + 30),
                );
                if (picked != null) setState(() => _expiry = DateTime.utc(picked.year, picked.month, picked.day));
              },
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s.cancel)),
        FilledButton(
          onPressed: _expiry == null
              ? null
              : () => Navigator.pop(
                    context,
                    TravelDoc(
                      id: widget.existing?.id ?? 'd${now.microsecondsSinceEpoch.toRadixString(36)}',
                      kind: _kind,
                      holder: _holder.text.trim(),
                      country: _country.text.trim().toUpperCase(),
                      expiry: _expiry!,
                    ),
                  ),
          child: Text(s.save),
        ),
      ],
    );
  }
}
