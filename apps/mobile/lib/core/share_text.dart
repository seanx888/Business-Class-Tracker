import '../domain/flight.dart';
import '../domain/trip.dart';
import 'format.dart';
import 'strings.dart';

/// Plain-text flight summary for messaging apps — status, local times, terminal / gate.
/// Deliberately leaves out the booking reference and seat: those stay private.
String flightShareText(S s, Flight f) {
  final dep = f.gateOut.best;
  final arr = f.gateIn.best;
  String place(FlightEndpoint e, {bool gate = false}) =>
      [e.iata, if (e.terminal != null) 'T${e.terminal}', if (gate && e.gate != null) '${s.gate} ${e.gate}'].join(' ');
  final delay = f.departureDelay;
  final lines = <String>[
    '✈ ${f.ident} · ${f.origin.iata} → ${f.destination.iata}',
    shortDay(dep, f.origin.timeZone, s.locale),
    '${s.departure} ${hhmm(dep, f.origin.timeZone)} · ${place(f.origin, gate: true)}',
    '${s.arrival} ${hhmm(arr, f.destination.timeZone)}${dayOffset(dep, f.origin.timeZone, arr, f.destination.timeZone)} · ${place(f.destination)}'
        '${f.destination.baggage != null ? ' · ${s.baggage} ${f.destination.baggage}' : ''}',
    '${s.phase(f.phase)}${delay != null && delay >= Flight.delayThresholdMinutes ? ' · ${s.late(delay)}' : ''}',
    '— ÆtherSky',
  ];
  return lines.where((l) => l.trim().isNotEmpty).join('\n');
}

/// Calendar-entry description: everything you want at hand at the airport, including the private bits.
String flightCalendarDescription(S s, Flight f, TripInfo? trip) {
  final lines = <String>[
    flightShareText(s, f).split('\n').skip(1).where((l) => !l.startsWith('—')).join('\n'),
    if (trip?.cabin != null) '${s.cabin}: ${s.cabinName(trip!.cabin!)}',
    if ((trip?.seat ?? '').isNotEmpty) '${s.seat}: ${trip!.seat}',
    if ((trip?.pnr ?? '').isNotEmpty) '${s.pnr}: ${trip!.pnr}',
    if ((trip?.notes ?? '').isNotEmpty) trip!.notes!,
  ];
  return lines.where((l) => l.trim().isNotEmpty).join('\n');
}
