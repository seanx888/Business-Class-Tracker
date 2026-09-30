import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/stores.dart';
import '../../domain/manual_flight.dart';

Future<void> showManualFlightSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const ManualFlightSheet(),
  );
}

/// Add a flight that already happened: number, day, and the two airports. Distance comes from the airport table.
class ManualFlightSheet extends ConsumerStatefulWidget {
  const ManualFlightSheet({super.key});

  @override
  ConsumerState<ManualFlightSheet> createState() => _ManualFlightSheetState();
}

class _ManualFlightSheetState extends ConsumerState<ManualFlightSheet> {
  final _number = TextEditingController();
  final _from = TextEditingController();
  final _to = TextEditingController();
  late DateTime _date = _yesterday;
  String? _error;
  String? _lastSaved; // confirmation shown inside the sheet (a SnackBar would sit under the modal)

  DateTime get _yesterday {
    final n = ref.read(clockProvider)();
    return DateTime(n.year, n.month, n.day).subtract(const Duration(days: 1));
  }

  @override
  void dispose() {
    _number.dispose();
    _from.dispose();
    _to.dispose();
    super.dispose();
  }

  String _city(String code) {
    final geo = ref.watch(airportGeoProvider).asData?.value[code.trim().toUpperCase()];
    return geo == null ? '' : geo.city;
  }

  /// Saves the flight; returns whether it worked. On failure the reason is shown under the form.
  bool _save() {
    final s = S.of(context);
    final geo = ref.read(airportGeoProvider).asData?.value ?? const {};
    final r = buildManualFlight(
      flightNumber: _number.text,
      date: _date,
      from: _from.text,
      to: _to.text,
      fromGeo: geo[_from.text.trim().toUpperCase()],
      toGeo: geo[_to.text.trim().toUpperCase()],
      today: ref.read(clockProvider)(),
    );
    if (r.flight == null) {
      setState(() => _error = s.manualError(r.error!));
      return false;
    }
    ref.read(myFlightsProvider.notifier).upsert(r.flight!);
    setState(() => _lastSaved = s.manualSaved(r.flight!.ident));
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final loc = MaterialLocalizations.of(context);
    Widget airport(TextEditingController c, String label) => Expanded(
      child: TextField(
        controller: c,
        textCapitalization: TextCapitalization.characters,
        maxLength: 3,
        onChanged: (_) => setState(() => _error = null),
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          counterText: '',
          helperText: _city(c.text).isEmpty ? ' ' : _city(c.text),
        ),
      ),
    );
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(s.manualTitle, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(s.manualHint, style: t.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 16),
          TextField(
            controller: _number,
            textCapitalization: TextCapitalization.characters,
            onChanged: (_) => setState(() => _error = null),
            decoration: InputDecoration(labelText: s.flightNumber, border: const OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.calendar_today_outlined, size: 18),
            label: Text('${s.date}: ${loc.formatMediumDate(_date)}'),
            onPressed: () async {
              final picked = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(1990), lastDate: _yesterday);
              if (picked != null) setState(() => _date = picked);
            },
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [airport(_from, s.fromAirport), const SizedBox(width: 12), airport(_to, s.toAirport)],
          ),
          if (_lastSaved != null && _error == null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, size: 18, color: AetherColors.onTime),
                  const SizedBox(width: 8),
                  Text(_lastSaved!, style: t.bodyMedium),
                ],
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_error!, style: t.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.error)),
            ),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () {
                    if (_save()) {
                      setState(() {
                        _number.clear();
                        _from.clear();
                        _to.clear();
                        _error = null;
                      });
                    }
                  },
                  child: Text(s.saveAndAnother),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () {
                    if (_save()) Navigator.of(context).pop();
                  },
                  child: Text(s.save),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
