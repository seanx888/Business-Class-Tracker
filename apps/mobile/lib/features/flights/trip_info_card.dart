import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/stores.dart';
import '../../domain/flight.dart';
import '../../domain/trip.dart';

/// Cabin · seat · booking reference · notes for one tracked flight (entered by the traveller).
class TripInfoCard extends ConsumerWidget {
  const TripInfoCard({super.key, required this.flight});
  final Flight flight;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final info = ref.watch(tripInfosProvider)[flight.id] ?? const TripInfo();

    Widget cell(String label, String value, {VoidCallback? onLongPress}) => Expanded(
      child: GestureDetector(
        onLongPress: onLongPress,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: t.labelSmall?.copyWith(color: muted)),
            Text(value, style: t.titleMedium?.merge(tabular).copyWith(fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(s.myTrip, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                const Spacer(),
                TextButton.icon(
                  onPressed: () => showTripInfoSheet(context, flight),
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: Text(s.edit),
                ),
              ],
            ),
            if (info.isEmpty)
              Text(s.tripHint, style: t.bodyMedium?.copyWith(color: muted))
            else ...[
              Row(
                children: [
                  cell(s.cabin, info.cabin == null ? '—' : s.cabinName(info.cabin!)),
                  cell(s.seat, info.seat ?? '—'),
                  cell(s.pnr, info.pnr ?? '—', onLongPress: info.pnr == null ? null : () => _copy(context, info.pnr!)),
                ],
              ),
              if (info.notes != null) ...[const SizedBox(height: 10), Text(info.notes!, style: t.bodyMedium)],
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _copy(BuildContext context, String text) async {
    final s = S.of(context);
    final messenger = ScaffoldMessenger.of(context);
    await Clipboard.setData(ClipboardData(text: text));
    messenger.showSnackBar(SnackBar(content: Text(s.copied)));
  }
}

Future<void> showTripInfoSheet(BuildContext context, Flight flight) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _TripInfoSheet(flight: flight),
  );
}

class _TripInfoSheet extends ConsumerStatefulWidget {
  const _TripInfoSheet({required this.flight});
  final Flight flight;

  @override
  ConsumerState<_TripInfoSheet> createState() => _TripInfoSheetState();
}

class _TripInfoSheetState extends ConsumerState<_TripInfoSheet> {
  late final TripInfo _initial = ref.read(tripInfosProvider)[widget.flight.id] ?? const TripInfo();
  late Cabin? _cabin = _initial.cabin;
  late final _seat = TextEditingController(text: _initial.seat ?? '');
  late final _pnr = TextEditingController(text: _initial.pnr ?? '');
  late final _notes = TextEditingController(text: _initial.notes ?? '');

  @override
  void dispose() {
    _seat.dispose();
    _pnr.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${widget.flight.ident} · ${s.myTrip}',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          Text(s.cabin, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final c in Cabin.values)
                ChoiceChip(label: Text(s.cabinName(c)), selected: _cabin == c, onSelected: (on) => setState(() => _cabin = on ? c : null)),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _seat,
                  textCapitalization: TextCapitalization.characters,
                  decoration: InputDecoration(labelText: s.seat, border: const OutlineInputBorder()),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _pnr,
                  textCapitalization: TextCapitalization.characters,
                  decoration: InputDecoration(labelText: s.pnr, border: const OutlineInputBorder()),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notes,
            maxLines: 3,
            decoration: InputDecoration(labelText: s.notes, border: const OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () {
              ref
                  .read(tripInfosProvider.notifier)
                  .set(widget.flight.id, TripInfo.clean(cabin: _cabin, seat: _seat.text, pnr: _pnr.text, notes: _notes.text));
              Navigator.of(context).pop();
            },
            child: Text(s.save),
          ),
        ],
      ),
    );
  }
}
