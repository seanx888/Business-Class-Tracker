// What the traveller knows about a booking and the server doesn't: cabin, seat, booking reference, notes.
// Kept apart from [Flight] (which is refreshed from the backend and would overwrite it) and keyed by Flight.id.

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

class TripInfo {
  const TripInfo({this.cabin, this.seat, this.pnr, this.notes});

  final Cabin? cabin;
  final String? seat; // "12A"
  final String? pnr; // booking reference, "K7XQ2P"
  final String? notes;

  bool get isEmpty => cabin == null && (seat ?? '').isEmpty && (pnr ?? '').isEmpty && (notes ?? '').isEmpty;

  TripInfo copyWith({Cabin? cabin, String? seat, String? pnr, String? notes, bool clearCabin = false}) =>
      TripInfo(cabin: clearCabin ? null : (cabin ?? this.cabin), seat: seat ?? this.seat, pnr: pnr ?? this.pnr, notes: notes ?? this.notes);

  /// Trims input; blank fields become null so "empty" stays meaningful.
  factory TripInfo.clean({Cabin? cabin, String? seat, String? pnr, String? notes}) {
    String? c(String? v) {
      final t = v?.trim();
      return t == null || t.isEmpty ? null : t;
    }

    return TripInfo(cabin: cabin, seat: c(seat)?.toUpperCase(), pnr: c(pnr)?.toUpperCase(), notes: c(notes));
  }

  factory TripInfo.fromJson(Map<String, dynamic> j) =>
      TripInfo(cabin: Cabin.parse(j['cabin']), seat: j['seat'] as String?, pnr: j['pnr'] as String?, notes: j['notes'] as String?);

  Map<String, dynamic> toJson() => {
    if (cabin != null) 'cabin': cabin!.name,
    if (seat != null) 'seat': seat,
    if (pnr != null) 'pnr': pnr,
    if (notes != null) 'notes': notes,
  };
}
