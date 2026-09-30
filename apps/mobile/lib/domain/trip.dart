// What the traveller knows about a booking and the server doesn't: cabin, seat, booking reference, notes, and, after the flight,
// the logbook entry (aircraft, ratings, review, photos). Kept apart from [Flight] (which is refreshed from the backend and would
// overwrite it) and keyed by Flight.id.

enum Cabin {
  economy,
  premium,
  business,
  first;

  /// Business and first are the cabins that carry lounge access on their own.
  bool get isPremium => this == business || this == first;

  static Cabin? parse(Object? v) {
    for (final c in values) {
      if (c.name == v) return c;
    }
    return null;
  }
}

/// Why the trip was taken (FlightMemory's "reason" field).
enum TripPurpose {
  leisure,
  business,
  crew,
  other;

  static TripPurpose? parse(Object? v) {
    for (final p in values) {
      if (p.name == v) return p;
    }
    return null;
  }
}

/// The four things worth a star rating after a flight.
enum RatingAspect {
  overall,
  seat,
  food,
  service;

  static RatingAspect? parse(Object? v) {
    for (final a in values) {
      if (a.name == v) return a;
    }
    return null;
  }
}

/// The traveller's own record of a flight that has happened: which aircraft it really was, how it went, and photos.
class FlightLog {
  const FlightLog({this.aircraftType, this.registration, this.purpose, this.ratings = const {}, this.experience, this.photos = const []});

  /// ICAO designator ("B789") or free text; wins over what the data source reported, which is often only the scheduled type.
  final String? aircraftType;
  final String? registration; // "B-16722"
  final TripPurpose? purpose;

  /// Star ratings, 1 to 5; an aspect that was not rated is absent.
  final Map<RatingAspect, int> ratings;

  /// Free-text review: the experience, the meal, what to remember. Separate from [TripInfo.notes] (logistics).
  final String? experience;

  /// File names (not paths) of photos kept in the app's own storage, oldest first.
  final List<String> photos;

  static const maxPhotos = 12;
  static const maxRating = 5;

  bool get isEmpty =>
      (aircraftType ?? '').isEmpty &&
      (registration ?? '').isEmpty &&
      purpose == null &&
      ratings.isEmpty &&
      (experience ?? '').isEmpty &&
      photos.isEmpty;

  /// Something worth showing as a review: a rating, text or a photo (aircraft and purpose alone are just facts).
  bool get hasReview => ratings.isNotEmpty || (experience ?? '').isNotEmpty || photos.isNotEmpty;

  int? rating(RatingAspect a) => ratings[a];

  /// Same log with a different photo list.
  FlightLog withPhotos(List<String> next) => FlightLog(
    aircraftType: aircraftType,
    registration: registration,
    purpose: purpose,
    ratings: ratings,
    experience: experience,
    photos: List.unmodifiable(next),
  );

  /// Trims input, upper-cases codes, drops blanks and ratings outside 1 to 5.
  factory FlightLog.clean({
    String? aircraftType,
    String? registration,
    TripPurpose? purpose,
    Map<RatingAspect, int> ratings = const {},
    String? experience,
    List<String> photos = const [],
  }) {
    String? c(String? v) {
      final t = v?.trim();
      return t == null || t.isEmpty ? null : t;
    }

    return FlightLog(
      aircraftType: c(aircraftType)?.toUpperCase(),
      registration: c(registration)?.toUpperCase(),
      purpose: purpose,
      ratings: {
        for (final e in ratings.entries)
          if (e.value >= 1 && e.value <= maxRating) e.key: e.value,
      },
      experience: c(experience),
      photos: List.unmodifiable(photos),
    );
  }

  static final _fileName = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$');

  /// Tolerant of missing and hand-edited values: a bad field is dropped, never fatal.
  factory FlightLog.fromJson(Map<String, dynamic> j) {
    final r = j['ratings'];
    final p = j['photos'];
    return FlightLog.clean(
      aircraftType: j['aircraftType'] is String ? j['aircraftType'] as String : null,
      registration: j['registration'] is String ? j['registration'] as String : null,
      purpose: TripPurpose.parse(j['purpose']),
      ratings: {
        if (r is Map)
          for (final e in r.entries)
            if (RatingAspect.parse(e.key) != null && e.value is num) RatingAspect.parse(e.key)!: (e.value as num).round(),
      },
      experience: j['experience'] is String ? j['experience'] as String : null,
      // A file name only: nothing that could point outside the photo folder.
      photos: [
        if (p is List)
          for (final n in p)
            if (n is String && _fileName.hasMatch(n) && !n.contains('..')) n,
      ],
    );
  }

  Map<String, dynamic> toJson() => {
    if (aircraftType != null) 'aircraftType': aircraftType,
    if (registration != null) 'registration': registration,
    if (purpose != null) 'purpose': purpose!.name,
    if (ratings.isNotEmpty) 'ratings': {for (final e in ratings.entries) e.key.name: e.value},
    if (experience != null) 'experience': experience,
    if (photos.isNotEmpty) 'photos': photos,
  };
}

class TripInfo {
  const TripInfo({this.cabin, this.seat, this.pnr, this.notes, this.travelMinutes, this.log = const FlightLog()});

  final Cabin? cabin;
  final String? seat; // "12A"
  final String? pnr; // booking reference, "K7XQ2P"
  final String? notes;

  /// Door-to-airport time for THIS flight, overriding the default in Settings (e.g. leaving from a hotel).
  final int? travelMinutes;

  /// The logbook entry: filled in after the flight.
  final FlightLog log;

  bool get isEmpty =>
      cabin == null && (seat ?? '').isEmpty && (pnr ?? '').isEmpty && (notes ?? '').isEmpty && travelMinutes == null && log.isEmpty;

  TripInfo copyWith({
    Cabin? cabin,
    String? seat,
    String? pnr,
    String? notes,
    int? travelMinutes,
    FlightLog? log,
    bool clearCabin = false,
  }) => TripInfo(
    cabin: clearCabin ? null : (cabin ?? this.cabin),
    seat: seat ?? this.seat,
    pnr: pnr ?? this.pnr,
    notes: notes ?? this.notes,
    travelMinutes: travelMinutes ?? this.travelMinutes,
    log: log ?? this.log,
  );

  /// Trims input; blank fields become null so "empty" stays meaningful.
  factory TripInfo.clean({Cabin? cabin, String? seat, String? pnr, String? notes, int? travelMinutes, FlightLog log = const FlightLog()}) {
    String? c(String? v) {
      final t = v?.trim();
      return t == null || t.isEmpty ? null : t;
    }

    return TripInfo(
      cabin: cabin,
      seat: c(seat)?.toUpperCase(),
      pnr: c(pnr)?.toUpperCase(),
      notes: c(notes),
      travelMinutes: travelMinutes != null && travelMinutes > 0 ? travelMinutes : null,
      log: log,
    );
  }

  factory TripInfo.fromJson(Map<String, dynamic> j) => TripInfo(
    cabin: Cabin.parse(j['cabin']),
    seat: j['seat'] as String?,
    pnr: j['pnr'] as String?,
    notes: j['notes'] as String?,
    travelMinutes: (j['travelMinutes'] as num?)?.round(),
    log: j['log'] is Map<String, dynamic> ? FlightLog.fromJson(j['log'] as Map<String, dynamic>) : const FlightLog(),
  );

  Map<String, dynamic> toJson() => {
    if (cabin != null) 'cabin': cabin!.name,
    if (seat != null) 'seat': seat,
    if (pnr != null) 'pnr': pnr,
    if (notes != null) 'notes': notes,
    if (travelMinutes != null) 'travelMinutes': travelMinutes,
    if (!log.isEmpty) 'log': log.toJson(),
  };
}
