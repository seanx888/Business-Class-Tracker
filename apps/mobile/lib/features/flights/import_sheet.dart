import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../data/stores.dart';
import '../../domain/flight.dart';
import '../../domain/itinerary_parser.dart';
import 'widgets.dart';

Future<void> showImportSheet(BuildContext context, {String? initialText}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => ImportSheet(initialText: initialText),
  );
}

class _Candidate {
  _Candidate(this.parsed) : date = parsed.date;
  final ParsedFlight parsed;
  DateTime? date;
  Flight? found;
  bool loading = false;
  bool selected = true;
  bool tracked = false;
  String? error;
}

/// Paste a confirmation e-mail → see every flight found → look each one up → add the ones you want.
class ImportSheet extends ConsumerStatefulWidget {
  const ImportSheet({super.key, this.initialText});
  final String? initialText;

  @override
  ConsumerState<ImportSheet> createState() => _ImportSheetState();
}

class _ImportSheetState extends ConsumerState<ImportSheet> {
  late final _text = TextEditingController(text: widget.initialText ?? '');
  List<_Candidate>? _items; // null until the first "Find flights"
  int _generation = 0; // ignores lookups from an earlier parse

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    if (data?.text != null && mounted) setState(() => _text.text = data!.text!);
  }

  Future<void> _analyze() async {
    final gen = ++_generation;
    final parsed = parseItinerary(_text.text, now: ref.read(clockProvider)().toUtc());
    final items = [for (final p in parsed) _Candidate(p)];
    setState(() => _items = items);
    for (final c in items) {
      if (gen != _generation || !mounted) return;
      await _lookup(c);
    }
  }

  Future<void> _lookup(_Candidate c) async {
    final date = c.date;
    if (date == null) return;
    setState(() {
      c.loading = true;
      c.error = null;
      c.found = null;
    });
    try {
      final f = await ref.read(flightSourceProvider).lookup(c.parsed.carrier, c.parsed.number, date);
      if (!mounted) return;
      setState(() {
        c.found = f;
        c.tracked = f != null && ref.read(myFlightsProvider).any((x) => x.id == f.id);
        c.selected = f != null && !c.tracked;
      });
    } catch (e) {
      if (mounted) setState(() => c.error = '$e');
    } finally {
      if (mounted) setState(() => c.loading = false);
    }
  }

  Future<void> _pickDate(_Candidate c) async {
    final now = ref.read(clockProvider)();
    final picked = await showDatePicker(
      context: context,
      initialDate: c.date ?? now,
      firstDate: now.subtract(const Duration(days: 3)),
      lastDate: now.add(const Duration(days: 330)),
    );
    if (picked == null || !mounted) return;
    c.date = DateTime.utc(picked.year, picked.month, picked.day);
    await _lookup(c);
  }

  void _addSelected() {
    final notifier = ref.read(myFlightsProvider.notifier);
    for (final c in _items ?? const <_Candidate>[]) {
      if (c.selected && c.found != null) notifier.upsert(c.found!);
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final items = _items;
    final chosen = items?.where((c) => c.selected && c.found != null).length ?? 0;
    final now = ref.watch(clockProvider)().toUtc();
    final loc = MaterialLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(s.importItinerary, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(s.importHint, style: t.bodySmall?.copyWith(color: muted)),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _text,
                    minLines: 5,
                    maxLines: 8,
                    decoration: const InputDecoration(border: OutlineInputBorder(), alignLabelWithHint: true),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      OutlinedButton.icon(
                        onPressed: _paste,
                        icon: const Icon(Icons.content_paste, size: 18),
                        label: Text(s.pasteClipboard),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: FilledButton(onPressed: _analyze, child: Text(s.analyze)),
                      ),
                    ],
                  ),
                  if (items != null) ...[
                    const SizedBox(height: 16),
                    if (items.isEmpty) Text(s.noneFound, style: t.bodyMedium),
                    for (final c in items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _CandidateTile(
                          c: c,
                          now: now,
                          dateLabel: c.date == null ? null : loc.formatMediumDate(c.date!),
                          onToggle: (v) => setState(() => c.selected = v),
                          onPickDate: () => _pickDate(c),
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ),
          // The primary action stays pinned below the scrolling list.
          if (items != null && items.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: FilledButton.icon(
                onPressed: chosen == 0 ? null : _addSelected,
                icon: const Icon(Icons.add),
                label: Text(s.addCount(chosen)),
              ),
            ),
        ],
      ),
    );
  }
}

class _CandidateTile extends StatelessWidget {
  const _CandidateTile({required this.c, required this.now, required this.dateLabel, required this.onToggle, required this.onPickDate});
  final _Candidate c;
  final DateTime now;
  final String? dateLabel;
  final ValueChanged<bool> onToggle;
  final VoidCallback onPickDate;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final f = c.found;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (f != null && !c.tracked) Checkbox(value: c.selected, onChanged: (v) => onToggle(v ?? false)),
                Text(c.parsed.ident, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(dateLabel ?? '', style: t.bodySmall?.copyWith(color: muted)),
                ),
                if (c.date == null || (f == null && !c.loading)) TextButton(onPressed: onPickDate, child: Text(s.pickDate)),
                if (c.loading) Text(s.searching, style: t.bodySmall),
                if (c.tracked) Text(s.alreadyTracked, style: t.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
              ],
            ),
            if (f != null) FlightCard(flight: f, now: now),
            if (c.error != null)
              Text('${s.loadFail}: ${c.error}', style: t.bodySmall?.copyWith(color: Theme.of(context).colorScheme.error)),
            if (f == null && !c.loading && c.error == null && c.date != null) Text(s.notFound, style: t.bodySmall?.copyWith(color: muted)),
          ],
        ),
      ),
    );
  }
}
