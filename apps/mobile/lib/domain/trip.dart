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
  const TripInfo({this.cabin, this.seat, this.pnr, this.notes, this.travelMinutes});

  final Cabin? cabin;
  final String? seat; // "12A"
  final String? pnr; // booking reference, "K7XQ2P"
  final String? notes;

  /// Door-to-airport time for THIS flight, overriding the default in Settings (e.g. leaving from a hotel).
  final int? travelMinutes;

  bool get isEmpty => cabin == null && (seat ?? '').isEmpty && (pnr ?? '').isEmpty && (notes ?? '').isEmpty && travelMinutes == null;

  TripInfo copyWith({Cabin? cabin, String? seat, String? pnr, String? notes, int? travelMinutes, bool clearCabin = false}) => TripInfo(
    cabin: clearCabin ? null : (cabin ?? this.cabin),
    seat: seat ?? this.seat,
    pnr: pnr ?? this.pnr,
    notes: notes ?? this.notes,
    travelMinutes: travelMinutes ?? this.travelMinutes,
  );

  /// Trims input; blank fields become null so "empty" stays meaningful.
  factory TripInfo.clean({Cabin? cabin, String? seat, String? pnr, String? notes, int? travelMinutes}) {
    String? c(String? v) {
      final t = v?.trim();
      return t == null || t.isEmpty ? null : t;
    }

    return TripInfo(cabin: cabin, seat: c(seat)?.toUpperCase(), pnr: c(pnr)?.toUpperCase(), notes: c(notes), travelMinutes: travelMinutes != null && travelMinutes > 0 ? travelMinutes : null);
  }

  factory TripInfo.fromJson(Map<String, dynamic> j) =>
      TripInfo(cabin: Cabin.parse(j['cabin']), seat: j['seat'] as String?, pnr: j['pnr'] as String?, notes: j['notes'] as String?, travelMinutes: (j['travelMinutes'] as num?)?.round());

  Map<String, dynamic> toJson() => {
    if (cabin != null) 'cabin': cabin!.name,
    if (seat != null) 'seat': seat,
    if (pnr != null) 'pnr': pnr,
    if (notes != null) 'notes': notes,
    if (travelMinutes != null) 'travelMinutes': travelMinutes,
  };
}
