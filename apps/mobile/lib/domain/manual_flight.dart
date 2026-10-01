// A flight typed in by hand — an old trip with no live data, so Passport can start with real history.
// There are no airline times: the day is the truth, distance is the great-circle distance and the block time an estimate.
import 'flight.dart';
import 'geo.dart';

const manualSource = 'manual';

extension ManualFlight on Flight {
  bool get isManual => source == manualSource;
}

enum ManualFlightError { badNumber, unknownOrigin, unknownDestination, sameAirport, notPast }

/// Builds the flight, or explains what is wrong. [date] is the local calendar day of departure and must be
/// before [today] (today's and future flights are looked up normally).
({Flight? flight, ManualFlightError? error}) buildManualFlight({
  required String flightNumber,
  required DateTime date,
  required String from,
  required String to,
  required AirportGeo? fromGeo,
  required AirportGeo? toGeo,
  required DateTime today,
}) {
  final parsed = parseFlightNumber(flightNumber);
  if (parsed == null) return (flight: null, error: ManualFlightError.badNumber);
  final origin = from.trim().toUpperCase();
  final destination = to.trim().toUpperCase();
  if (fromGeo == null) return (flight: null, error: ManualFlightError.unknownOrigin);
  if (toGeo == null) return (flight: null, error: ManualFlightError.unknownDestination);
  if (origin == destination) return (flight: null, error: ManualFlightError.sameAirport);
  final day = DateTime.utc(date.year, date.month, date.day);
  if (!day.isBefore(DateTime.utc(today.year, today.month, today.day))) return (flight: null, error: ManualFlightError.notPast);

  final km = greatCircleKm(fromGeo, toGeo);
  final dep = day.add(const Duration(hours: 12)); // no clock time exists — the UI shows the date only
  final arr = dep.add(estimateBlockTime(km));
  final iso = day.toIso8601String().substring(0, 10);
  final flight = Flight(
    id: '${parsed.carrier}${parsed.number}-$iso',
    carrier: parsed.carrier,
    number: parsed.number,
    origin: FlightEndpoint(iata: origin, city: fromGeo.city.isEmpty ? null : fromGeo.city),
    destination: FlightEndpoint(iata: destination, city: toGeo.city.isEmpty ? null : toGeo.city),
    gateOut: FlightTime(scheduled: dep, actual: dep),
    takeoff: FlightTime(scheduled: dep, actual: dep),
    landing: FlightTime(scheduled: arr, actual: arr),
    gateIn: FlightTime(scheduled: arr, actual: arr),
    distanceKm: km.round(),
    source: manualSource,
  );
  return (flight: flight, error: null);
}
