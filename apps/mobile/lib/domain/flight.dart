// Flight model = the JSON contract served by the backend (`flight-lookup` Edge Function),
// which normalizes FlightAware AeroAPI / OAG data. Status is derived here from the four
// timestamps airlines report (gate out → wheels off → wheels on → gate in), so the UI stays
// correct between server updates.

enum FlightPhase { scheduled, delayed, departed, enRoute, landed, arrived, cancelled, diverted }

/// Scheduled / estimated / actual time for one event (gate out, takeoff, landing, gate in).
class FlightTime {
  const FlightTime({this.scheduled, this.estimated, this.actual});

  final DateTime? scheduled;
  final DateTime? estimated;
  final DateTime? actual;

  /// Best current knowledge: actual, else estimated, else scheduled.
  DateTime? get best => actual ?? estimated ?? scheduled;

  /// Minutes late vs schedule (negative = early), null when unknown.
  int? get delayMinutes {
    final s = scheduled;
    final b = actual ?? estimated;
    if (s == null || b == null) return null;
    return b.difference(s).inMinutes;
  }

  static DateTime? _parse(Object? v) => v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toUtc() : null;

  factory FlightTime.fromJson(Map<String, dynamic>? j) => j == null
      ? const FlightTime()
      : FlightTime(scheduled: _parse(j['scheduled']), estimated: _parse(j['estimated']), actual: _parse(j['actual']));

  Map<String, dynamic> toJson() => {
        if (scheduled != null) 'scheduled': scheduled!.toIso8601String(),
        if (estimated != null) 'estimated': estimated!.toIso8601String(),
        if (actual != null) 'actual': actual!.toIso8601String(),
      };
}

class FlightEndpoint {
  const FlightEndpoint({required this.iata, this.name, this.city, this.timeZone, this.terminal, this.gate, this.baggage});

  final String iata;
  final String? name;
  final String? city;
  final String? timeZone; // IANA, e.g. Asia/Taipei
  final String? terminal;
  final String? gate;
  final String? baggage;

  factory FlightEndpoint.fromJson(Map<String, dynamic> j) => FlightEndpoint(
        iata: (j['iata'] as String? ?? '').toUpperCase(),
        name: j['name'] as String?,
        city: j['city'] as String?,
        timeZone: j['tz'] as String?,
        terminal: j['terminal'] as String?,
        gate: j['gate'] as String?,
        baggage: j['baggage'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'iata': iata,
        if (name != null) 'name': name,
        if (city != null) 'city': city,
        if (timeZone != null) 'tz': timeZone,
        if (terminal != null) 'terminal': terminal,
        if (gate != null) 'gate': gate,
        if (baggage != null) 'baggage': baggage,
      };
}

class Flight {
  const Flight({
    required this.id,
    required this.carrier,
    required this.number,
    required this.origin,
    required this.destination,
    this.gateOut = const FlightTime(),
    this.takeoff = const FlightTime(),
    this.landing = const FlightTime(),
    this.gateIn = const FlightTime(),
    this.cancelled = false,
    this.diverted = false,
    this.aircraftType,
    this.registration,
    this.distanceKm,
    this.inboundIdent,
    this.source = 'demo',
  });

  final String id;
  final String carrier; // IATA, e.g. BR
  final String number; // e.g. 198
  final FlightEndpoint origin;
  final FlightEndpoint destination;
  final FlightTime gateOut;
  final FlightTime takeoff;
  final FlightTime landing;
  final FlightTime gateIn;
  final bool cancelled;
  final bool diverted;
  final String? aircraftType;
  final String? registration;
  final int? distanceKm;
  final String? inboundIdent;
  final String source;

  String get ident => '$carrier$number';

  /// A departure 15+ minutes late is "delayed" (the usual on-time definition).
  static const delayThresholdMinutes = 15;

  FlightPhase get phase {
    if (cancelled) return FlightPhase.cancelled;
    if (diverted) return FlightPhase.diverted;
    if (gateIn.actual != null) return FlightPhase.arrived;
    if (landing.actual != null) return FlightPhase.landed;
    if (takeoff.actual != null) return FlightPhase.enRoute;
    if (gateOut.actual != null) return FlightPhase.departed;
    if ((gateOut.delayMinutes ?? 0) >= delayThresholdMinutes) return FlightPhase.delayed;
    return FlightPhase.scheduled;
  }

  /// Departure delay in minutes (gate out), arrival delay (gate in) — null when unknown.
  int? get departureDelay => gateOut.delayMinutes;
  int? get arrivalDelay => gateIn.delayMinutes ?? landing.delayMinutes;

  /// 0…1 share of the flight completed, from takeoff to (estimated) landing.
  double progress(DateTime now) {
    switch (phase) {
      case FlightPhase.landed:
      case FlightPhase.arrived:
        return 1;
      case FlightPhase.enRoute:
        final off = takeoff.actual!;
        final on = landing.best;
        if (on == null || !on.isAfter(off)) return 0.5;
        final p = now.difference(off).inSeconds / on.difference(off).inSeconds;
        return p.clamp(0.0, 0.99);
      default:
        return 0;
    }
  }

  /// Total block time (gate out → gate in) using the best known times.
  Duration? get blockTime {
    final a = gateOut.best;
    final b = gateIn.best;
    return a != null && b != null && b.isAfter(a) ? b.difference(a) : null;
  }

  factory Flight.fromJson(Map<String, dynamic> j) => Flight(
        id: j['id'] as String,
        carrier: (j['carrier'] as String).toUpperCase(),
        number: j['number'].toString(),
        origin: FlightEndpoint.fromJson(j['origin'] as Map<String, dynamic>),
        destination: FlightEndpoint.fromJson(j['destination'] as Map<String, dynamic>),
        gateOut: FlightTime.fromJson(j['out'] as Map<String, dynamic>?),
        takeoff: FlightTime.fromJson(j['off'] as Map<String, dynamic>?),
        landing: FlightTime.fromJson(j['on'] as Map<String, dynamic>?),
        gateIn: FlightTime.fromJson(j['in'] as Map<String, dynamic>?),
        cancelled: j['cancelled'] == true,
        diverted: j['diverted'] == true,
        aircraftType: (j['aircraft'] as Map<String, dynamic>?)?['type'] as String?,
        registration: (j['aircraft'] as Map<String, dynamic>?)?['registration'] as String?,
        distanceKm: (j['distanceKm'] as num?)?.round(),
        inboundIdent: ((j['inbound'] as Map<String, dynamic>?)?['ident'] ?? (j['inbound'] as Map<String, dynamic>?)?['id']) as String?,
        source: j['source'] as String? ?? 'unknown',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'carrier': carrier,
        'number': number,
        'origin': origin.toJson(),
        'destination': destination.toJson(),
        'out': gateOut.toJson(),
        'off': takeoff.toJson(),
        'on': landing.toJson(),
        'in': gateIn.toJson(),
        'cancelled': cancelled,
        'diverted': diverted,
        'aircraft': {
          if (aircraftType != null) 'type': aircraftType,
          if (registration != null) 'registration': registration,
        },
        if (distanceKm != null) 'distanceKm': distanceKm,
        if (inboundIdent != null) 'inbound': {'ident': inboundIdent},
        'source': source,
      };
}

/// "BR198", "br 198", "BR0198" → (BR, 198); null when it doesn't look like a flight number.
({String carrier, String number})? parseFlightNumber(String input) {
  final m = RegExp(r'^\s*([A-Za-z0-9]{2})\s*0*(\d{1,4})\s*$').firstMatch(input);
  if (m == null) return null;
  final carrier = m.group(1)!.toUpperCase();
  if (RegExp(r'^\d\d$').hasMatch(carrier)) return null;
  return (carrier: carrier, number: m.group(2)!);
}
