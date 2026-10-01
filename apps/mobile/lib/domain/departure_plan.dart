// "When do I leave?" — from the departure time back to the front door: gate time − airport buffer − journey to the airport.
// Also the rule-of-thumb online check-in window (airlines differ: usually 24–48 h before departure).
import 'flight.dart';

class DepartureSettings {
  const DepartureSettings({
    this.travel = const Duration(minutes: 60),
    this.bufferInternational = const Duration(minutes: 180),
    this.bufferDomestic = const Duration(minutes: 120),
  });

  /// Door to airport.
  final Duration travel;

  /// How long before departure to be at the airport.
  final Duration bufferInternational;
  final Duration bufferDomestic;
}

class DeparturePlan {
  const DeparturePlan({
    required this.departure,
    required this.arriveAtAirport,
    required this.leaveHome,
    required this.buffer,
    required this.travel,
    required this.international,
  });

  final DateTime departure;
  final DateTime arriveAtAirport;
  final DateTime leaveHome;
  final Duration buffer;
  final Duration travel;
  final bool international;
}

/// The plan for [f], or null when the flight has already left, is cancelled, or has no departure time.
/// [international] is null-safe: pass whether the flight crosses a border (unknown counts as international).
/// [travelOverride] replaces the default door-to-airport time for this flight only.
DeparturePlan? planDeparture(Flight f, DepartureSettings settings, {required bool international, Duration? travelOverride}) {
  if (f.cancelled) return null;
  final phase = f.phase;
  if (phase != FlightPhase.scheduled && phase != FlightPhase.delayed) return null;
  final dep = f.gateOut.best;
  if (dep == null) return null;
  final buffer = international ? settings.bufferInternational : settings.bufferDomestic;
  final travel = travelOverride ?? settings.travel;
  final arrive = dep.subtract(buffer);
  return DeparturePlan(
    departure: dep,
    arriveAtAirport: arrive,
    leaveHome: arrive.subtract(travel),
    buffer: buffer,
    travel: travel,
    international: international,
  );
}

/// Online check-in usually opens 24–48 h before departure; the window we point people to.
const checkInWindow = Duration(hours: 48);

/// True when it is worth showing a check-in prompt: departing within [checkInWindow] and not yet left.
bool checkInLikelyOpen(Flight f, DateTime now) {
  if (f.cancelled) return false;
  final phase = f.phase;
  if (phase != FlightPhase.scheduled && phase != FlightPhase.delayed) return false;
  final dep = f.gateOut.best;
  if (dep == null) return false;
  final until = dep.difference(now);
  return !until.isNegative && until <= checkInWindow;
}
