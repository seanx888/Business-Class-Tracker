import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../data/photo_service.dart';
import '../../data/stores.dart';
import '../../domain/aircraft_types.dart';
import '../../domain/flight.dart';
import '../../domain/trip.dart';
import 'log_widgets.dart';

Future<void> showLogEntrySheet(BuildContext context, Flight flight) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => LogEntrySheet(flight: flight),
  );
}

/// Edit what the traveller records after a flight: aircraft, cabin, purpose, ratings, review, photos.
class LogEntrySheet extends ConsumerStatefulWidget {
  const LogEntrySheet({super.key, required this.flight});
  final Flight flight;

  @override
  ConsumerState<LogEntrySheet> createState() => _LogEntrySheetState();
}

class _LogEntrySheetState extends ConsumerState<LogEntrySheet> {
  // Kept in a field: `ref` cannot be used inside dispose().
  late final PhotoService _photoService = ref.read(photoServiceProvider);
  late final TripInfo _initial = ref.read(tripInfosProvider)[widget.flight.id] ?? const TripInfo();
  late final _type = TextEditingController(text: _initial.log.aircraftType ?? '');
  late final _reg = TextEditingController(text: _initial.log.registration ?? '');
  late final _experience = TextEditingController(text: _initial.log.experience ?? '');
  late Cabin? _cabin = _initial.cabin;
  late TripPurpose? _purpose = _initial.log.purpose;
  late final Map<RatingAspect, int> _ratings = {..._initial.log.ratings};
  late final List<String> _photos = [..._initial.log.photos];

  /// Photos added during this edit: deleted again when the sheet is dismissed without saving.
  final _added = <String>[];

  /// Photos removed during this edit: deleted for good only on save, so "undo" and "cancel" both bring them back.
  final _removed = <({String name, int index})>[];
  bool _saved = false;

  @override
  void dispose() {
    if (!_saved) {
      for (final n in _added) {
        _photoService.delete(n);
      }
    }
    _type.dispose();
    _reg.dispose();
    _experience.dispose();
    super.dispose();
  }

  Future<void> _addPhoto(PhotoSource source) async {
    final name = await _photoService.add(source);
    if (name == null || !mounted) return;
    setState(() {
      _added.add(name);
      _photos.add(name);
    });
  }

  Future<void> _choosePhotoSource() async {
    final s = S.of(context);
    final source = await showModalBottomSheet<PhotoSource>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              minTileHeight: 56,
              leading: const Icon(Icons.photo_camera_outlined),
              title: Text(s.logFromCamera),
              onTap: () => Navigator.of(ctx).pop(PhotoSource.camera),
            ),
            ListTile(
              minTileHeight: 56,
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(s.logFromLibrary),
              onTap: () => Navigator.of(ctx).pop(PhotoSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source != null) await _addPhoto(source);
  }

  void _removePhoto(String name) => setState(() {
    final i = _photos.indexOf(name);
    if (i < 0) return;
    _photos.removeAt(i);
    _removed.add((name: name, index: i));
  });

  void _undoRemove() => setState(() {
    final r = _removed.removeLast();
    _photos.insert(r.index.clamp(0, _photos.length), r.name);
  });

  void _save() {
    final f = _initial;
    ref
        .read(tripInfosProvider.notifier)
        .set(
          widget.flight.id,
          TripInfo.clean(
            cabin: _cabin,
            seat: f.seat,
            pnr: f.pnr,
            notes: f.notes,
            travelMinutes: f.travelMinutes,
            log: FlightLog.clean(
              aircraftType: _type.text,
              registration: _reg.text,
              purpose: _purpose,
              ratings: _ratings,
              experience: _experience.text,
              photos: _photos,
            ),
          ),
        );
    _saved = true;
    // Photos that were on the entry before and are gone now, or that were added and removed again, are no longer referenced.
    for (final r in _removed) {
      _photoService.delete(r.name);
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final service = _photoService;
    final reported = widget.flight.aircraftType;
    final typed = _type.text.trim().toUpperCase();
    final suggestions = typed.isEmpty ? const <String>[] : aircraftTypeSuggestions(typed, limit: 6).where((c) => c != typed).toList();
    final typeName = typed.isEmpty ? null : aircraftTypeNames[typed];

    Widget section(String title) => Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 8),
      child: Text(title, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
    );

    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${widget.flight.ident}  ${widget.flight.origin.iata} to ${widget.flight.destination.iata}',
              style: t.titleLarge?.copyWith(fontWeight: FontWeight.w800),
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _type,
              autocorrect: false,
              enableSuggestions: false,
              textCapitalization: TextCapitalization.characters,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: s.logAircraftType,
                hintText: reported == null ? 'A359…' : '$reported…',
                helperText: typeName ?? (reported == null ? null : s.logReportedType(reported)),
                border: const OutlineInputBorder(),
              ),
            ),
            if (suggestions.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final c in suggestions)
                      ActionChip(
                        label: Text(c),
                        onPressed: () => setState(() {
                          _type.text = c;
                          _type.selection = TextSelection.collapsed(offset: c.length);
                        }),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _reg,
              autocorrect: false,
              enableSuggestions: false,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(labelText: s.logRegistration, hintText: 'B-16722…', border: const OutlineInputBorder()),
            ),
            section(s.cabin),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final c in Cabin.values)
                  ChoiceChip(
                    label: Text(s.cabinName(c)),
                    selected: _cabin == c,
                    onSelected: (on) => setState(() => _cabin = on ? c : null),
                  ),
              ],
            ),
            section(s.logPurpose),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final p in TripPurpose.values)
                  ChoiceChip(
                    label: Text(s.purposeName(p)),
                    selected: _purpose == p,
                    onSelected: (on) => setState(() => _purpose = on ? p : null),
                  ),
              ],
            ),
            section(s.logRatings),
            for (final a in RatingAspect.values)
              Row(
                children: [
                  SizedBox(width: 64, child: Text(s.ratingName(a), style: t.bodyMedium)),
                  Expanded(
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: StarRating(
                        label: s.ratingName(a),
                        value: _ratings[a],
                        onChanged: (v) => setState(() => v == null ? _ratings.remove(a) : _ratings[a] = v),
                      ),
                    ),
                  ),
                ],
              ),
            Text(s.logRatingHint, style: t.bodySmall?.copyWith(color: muted)),
            section(s.logExperience),
            TextField(
              controller: _experience,
              minLines: 3,
              maxLines: 8,
              maxLength: 2000,
              keyboardType: TextInputType.multiline,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(hintText: s.logExperienceHint, border: const OutlineInputBorder()),
            ),
            section(s.logPhotos),
            if (!service.available)
              Text(s.logPhotosAppOnly, style: t.bodySmall?.copyWith(color: muted))
            else ...[
              if (_photos.isNotEmpty)
                SizedBox(
                  height: 96,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _photos.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (_, i) => Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: PhotoThumb(name: _photos[i], onRemove: () => _removePhoto(_photos[i])),
                    ),
                  ),
                ),
              if (_removed.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Row(
                    children: [
                      Expanded(child: Text(s.logPhotoRemoved, style: t.bodyMedium)),
                      TextButton(onPressed: _undoRemove, child: Text(s.logUndo)),
                    ],
                  ),
                ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.add_a_photo_outlined, size: 18),
                  label: Text(s.logAddPhoto),
                  onPressed: _photos.length >= FlightLog.maxPhotos ? null : _choosePhotoSource,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _photos.length >= FlightLog.maxPhotos ? s.logPhotoLimit(FlightLog.maxPhotos) : s.logPhotosOnDevice,
                style: t.bodySmall?.copyWith(color: muted),
              ),
            ],
            const SizedBox(height: 20),
            FilledButton(onPressed: _save, child: Text(s.logSaveEntry)),
          ],
        ),
      ),
    );
  }
}

/// The logbook entry on a finished flight's page: aircraft, ratings, review excerpt, photos, and the way to edit them.
class LogCard extends ConsumerWidget {
  const LogCard({super.key, required this.flight});
  final Flight flight;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final info = ref.watch(tripInfosProvider)[flight.id] ?? const TripInfo();
    final log = info.log;
    final type = log.aircraftType ?? flight.aircraftType;
    final reg = log.registration ?? flight.registration;
    final facts = [if (type != null) aircraftTypeName(type) ?? type, ?reg, if (log.purpose != null) s.purposeName(log.purpose!)];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(s.logbook, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                ),
                TextButton.icon(
                  onPressed: () => showLogEntrySheet(context, flight),
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: Text(s.edit),
                ),
              ],
            ),
            if (facts.isNotEmpty) Text(facts.join('  ·  '), style: t.bodyMedium),
            if (log.ratings.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 16,
                runSpacing: 4,
                children: [for (final e in log.ratings.entries) RatingBadge(label: s.ratingName(e.key), value: e.value)],
              ),
            ],
            if (log.experience != null) ...[
              const SizedBox(height: 8),
              Text(log.experience!, style: t.bodyMedium, maxLines: 6, overflow: TextOverflow.ellipsis),
            ],
            if (log.photos.isNotEmpty) ...[
              const SizedBox(height: 12),
              SizedBox(
                height: 72,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: log.photos.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (_, i) => PhotoThumb(name: log.photos[i], size: 72),
                ),
              ),
            ],
            if (!log.hasReview) ...[
              if (facts.isNotEmpty) const SizedBox(height: 8),
              Text(s.logCardHint, style: t.bodyMedium?.copyWith(color: muted)),
              const SizedBox(height: 12),
              FilledButton.tonal(onPressed: () => showLogEntrySheet(context, flight), child: Text(s.logAddDetails)),
            ],
          ],
        ),
      ),
    );
  }
}
