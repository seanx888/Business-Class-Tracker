import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../data/stores.dart';
import '../../domain/geo.dart';

/// Airports offered before the traveller types anything.
const commonAirports = [
  'TPE',
  'TSA',
  'KHH',
  'RMQ',
  'ICN',
  'GMP',
  'NRT',
  'HND',
  'KIX',
  'BKK',
  'SIN',
  'HKG',
  'LAX',
  'SFO',
  'JFK',
  'LHR',
  'CDG',
];

/// Search by code or city. Exact code first, then code prefix, then city text; at most [limit] results.
List<String> searchAirports(Map<String, AirportGeo> table, String query, {int limit = 40}) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) {
    return [
      for (final c in commonAirports)
        if (table.containsKey(c)) c,
    ];
  }
  final exact = <String>[];
  final prefix = <String>[];
  final city = <String>[];
  for (final e in table.entries) {
    final code = e.key.toLowerCase();
    if (code == q) {
      exact.add(e.key);
    } else if (code.startsWith(q)) {
      prefix.add(e.key);
    } else if (e.value.city.toLowerCase().contains(q)) {
      city.add(e.key);
    }
  }
  city.sort((a, b) => table[a]!.city.length.compareTo(table[b]!.city.length));
  return [...exact, ...prefix, ...city].take(limit).toList();
}

/// Bottom sheet that returns the chosen IATA code.
Future<String?> showAirportPicker(BuildContext context) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const _AirportPicker(),
  );
}

class _AirportPicker extends ConsumerStatefulWidget {
  const _AirportPicker();

  @override
  ConsumerState<_AirportPicker> createState() => _AirportPickerState();
}

class _AirportPickerState extends ConsumerState<_AirportPicker> {
  final _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final table = ref.watch(airportGeoProvider).asData?.value ?? const <String, AirportGeo>{};
    final results = searchAirports(table, _query.text);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.7,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: TextField(
                  controller: _query,
                  autocorrect: false,
                  enableSuggestions: false,
                  textCapitalization: TextCapitalization.characters,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    labelText: s.radarPickAirport,
                    hintText: s.airportSearchHint,
                    prefixIcon: const Icon(Icons.search),
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
              Expanded(
                child: results.isEmpty
                    ? Center(child: Text(s.airportNoMatch, style: t.bodyMedium))
                    : ListView.builder(
                        itemCount: results.length,
                        itemBuilder: (context, i) {
                          final code = results[i];
                          return ListTile(
                            minTileHeight: 56,
                            leading: SizedBox(
                              width: 44,
                              child: Text(code, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                            ),
                            title: Text(table[code]?.city ?? '', maxLines: 1, overflow: TextOverflow.ellipsis),
                            onTap: () => Navigator.of(context).pop(code),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
