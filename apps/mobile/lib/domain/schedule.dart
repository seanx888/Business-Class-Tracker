// Which of the user's flights matter right now. Pure functions of (flight, clock) so the list,
// the "next flight" card and the background refresh all agree — and stay unit-testable.
import 'flight.dart';

/// How long after landing a flight still counts as "current" (baggage belt, arrival gate, pickup).
const landedGrace = Duration(hours: 2);

/// A flight that never got an actual landing (cancelled, stale data) retires this long after it should have ended.
const staleGrace = Duration(hours: 3);

/// When the flight is expected to be over: actual/best arrival, else departure + 12 h.
DateTime? _expectedEnd(Flight f) {
  final arr = f.gateIn.best ?? f.landing.best;
  if (arr != null) return arr;
  final dep = f.gateOut.best ?? f.takeoff.best;
  return dep?.add(const Duration(hours: 12));
}

bool isFinished(Flight f, DateTime now) {
  final landedAt = f.gateIn.actual ?? f.landing.actual;
  if (landedAt != null) return now.isAfter(landedAt.add(landedGrace));
  final end = _expectedEnd(f);
  return end != null && now.isAfter(end.add(staleGrace));
}

/// Upcoming (and in-progress) first-to-go; finished ones most-recent first.
({List<Flight> upcoming, List<Flight> past}) splitFlights(Iterable<Flight> flights, DateTime now) {
  final upcoming = <Flight>[];
  final past = <Flight>[];
  for (final f in flights) {
    (isFinished(f, now) ? past : upcoming).add(f);
  }
  DateTime depOf(Flight f) => f.gateOut.best ?? f.takeoff.best ?? DateTime.utc(9999);
  upcoming.sort((a, b) => depOf(a).compareTo(depOf(b)));
  past.sort((a, b) => depOf(b).compareTo(depOf(a)));
  return (upcoming: upcoming, past: past);
}

Flight? nextFlight(Iterable<Flight> flights, DateTime now) {
  final up = splitFlights(flights, now).upcoming;
  return up.isEmpty ? null : up.first;
}

/// Time until (best-known) gate departure; negative once it should have left.
Duration? untilDeparture(Flight f, DateTime now) => f.gateOut.best?.difference(now);

/// Time until (best-known) landing for a flight that is in the air.
Duration? untilLanding(Flight f, DateTime now) => (f.landing.best ?? f.gateIn.best)?.difference(now);

/// Worth polling automatically: not finished, and departing within the next 2 days or already under way.
/// (Far-off flights change rarely; skipping them keeps data-API cost down — pull-to-refresh forces everything.)
bool needsAutoRefresh(Flight f, DateTime now) {
  if (isFinished(f, now)) return false;
  final dep = f.gateOut.best;
  if (dep == null) return true;
  return dep.difference(now) < const Duration(days: 2);
}
