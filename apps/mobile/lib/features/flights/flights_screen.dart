import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../core/strings.dart';
import '../../data/flight_repository.dart';
import '../../data/stores.dart';
import '../../domain/flight.dart';
import '../../domain/schedule.dart';
import 'import_sheet.dart';
import 'widgets.dart';

class FlightsScreen extends ConsumerStatefulWidget {
  const FlightsScreen({super.key});

  @override
  ConsumerState<FlightsScreen> createState() => _FlightsScreenState();
}

class _FlightsScreenState extends ConsumerState<FlightsScreen> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    // Keeps the "departs in 3 h 20 m" countdown honest while the screen is open.
    _tick = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Widget _dismissible(Flight f, DateTime now) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Dismissible(
        key: ValueKey(f.id),
        direction: DismissDirection.endToStart,
        background: Container(
          alignment: Alignment.centerRight,
          padding: const EdgeInsets.only(right: 20),
          child: Icon(Icons.delete_outline, color: scheme.error),
        ),
        onDismissed: (_) => ref.read(myFlightsProvider.notifier).remove(f.id),
        child: FlightCard(flight: f, now: now, onTap: () => context.go('/flights/${Uri.encodeComponent(f.id)}')),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final flights = ref.watch(myFlightsProvider);
    final now = ref.watch(clockProvider)().toUtc();
    final parts = splitFlights(flights, now);
    return Scaffold(
      appBar: AppBar(
        title: const Text('ÆtherSky'),
        actions: [
          IconButton(
            tooltip: s.addFlight,
            icon: const Icon(Icons.add_circle_outline),
            onPressed: () => showAddFlightSheet(context),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(myFlightsProvider.notifier).refreshAll(force: true),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [
            if (parts.upcoming.isNotEmpty) ...[
              NextFlightBanner(flight: parts.upcoming.first, now: now, onTap: () => context.go('/flights/${Uri.encodeComponent(parts.upcoming.first.id)}')),
              const SizedBox(height: 16),
            ],
            Text(s.upcoming, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            if (!AppConfig.hasApi)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(s.demoData, style: t.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
              ),
            const SizedBox(height: 12),
            if (parts.upcoming.isEmpty) const _EmptyFlights(),
            for (final f in parts.upcoming) _dismissible(f, now),
            if (parts.past.isNotEmpty)
              Theme(
                data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: const EdgeInsets.only(top: 4),
                  title: Text('${s.past} (${parts.past.length})', style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  children: [for (final f in parts.past) _dismissible(f, now)],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _EmptyFlights extends ConsumerWidget {
  const _EmptyFlights();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.flight_takeoff, size: 32),
          const SizedBox(height: 8),
          Text(s.noFlights, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(s.noFlightsHint, style: t.bodyMedium),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            FilledButton.icon(onPressed: () => showAddFlightSheet(context), icon: const Icon(Icons.add), label: Text(s.addFlight)),
            OutlinedButton.icon(onPressed: () => showImportSheet(context), icon: const Icon(Icons.content_paste), label: Text(s.importItinerary)),
          ]),
          if (!AppConfig.hasApi) ...[
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
              Text(s.tryDemo, style: t.bodySmall),
              for (final id in DemoFlightDataSource.sampleIdents)
                ActionChip(label: Text(id), onPressed: () => showAddFlightSheet(context, initial: id)),
            ]),
          ],
        ]),
      ),
    );
  }
}

Future<void> showAddFlightSheet(BuildContext context, {String? initial}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => AddFlightSheet(initial: initial),
  );
}

class AddFlightSheet extends ConsumerStatefulWidget {
  const AddFlightSheet({super.key, this.initial});
  final String? initial;

  @override
  ConsumerState<AddFlightSheet> createState() => _AddFlightSheetState();
}

class _AddFlightSheetState extends ConsumerState<AddFlightSheet> {
  late final _number = TextEditingController(text: widget.initial ?? '');
  DateTime _date = DateTime.now();
  Flight? _found;
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _number.dispose();
    super.dispose();
  }

  Future<void> _find() async {
    final s = S.of(context);
    final parsed = parseFlightNumber(_number.text);
    if (parsed == null) {
      setState(() => _error = s.badNumber);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _found = null;
    });
    try {
      final f = await ref.read(flightSourceProvider).lookup(parsed.carrier, parsed.number, _date);
      if (!mounted) return;
      setState(() {
        if (f == null) {
          _error = s.notFound;
        } else {
          _found = f;
        }
      });
    } catch (e) {
      if (mounted) setState(() => _error = '${s.loadFail}: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final loc = MaterialLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(s.addFlight, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        TextField(
          controller: _number,
          autofocus: widget.initial == null,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(labelText: s.flightNumber, border: const OutlineInputBorder(), errorText: _error),
          onSubmitted: (_) => _find(),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          icon: const Icon(Icons.calendar_today_outlined, size: 18),
          label: Text('${s.date}: ${loc.formatMediumDate(_date)}'),
          onPressed: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _date,
              firstDate: DateTime.now().subtract(const Duration(days: 3)),
              lastDate: DateTime.now().add(const Duration(days: 330)),
            );
            if (picked != null) setState(() => _date = picked);
          },
        ),
        const SizedBox(height: 12),
        FilledButton(onPressed: _busy ? null : _find, child: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(s.find)),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            icon: const Icon(Icons.content_paste, size: 18),
            label: Text(s.orPaste),
            onPressed: () {
              Navigator.of(context).pop();
              showImportSheet(context);
            },
          ),
        ),
        if (_found != null) ...[
          const SizedBox(height: 16),
          FlightCard(flight: _found!, now: DateTime.now().toUtc()),
          const SizedBox(height: 12),
          FilledButton.tonalIcon(
            icon: const Icon(Icons.notifications_active_outlined),
            label: Text(s.add),
            onPressed: () {
              ref.read(myFlightsProvider.notifier).upsert(_found!);
              Navigator.of(context).pop();
            },
          ),
        ],
      ]),
    );
  }
}
