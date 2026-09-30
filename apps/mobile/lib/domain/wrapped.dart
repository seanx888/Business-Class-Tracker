// "Your year in the air": Passport stats restricted to one calendar year, plus a few year-only highlights.
import 'flight.dart';
import 'passport.dart';

class WrappedStats {
  const WrappedStats({
    required this.year,
    required this.stats,
    required this.busiestMonth,
    required this.busiestMonthFlights,
    required this.first,
    required this.last,
  });

  final int year;
  final PassportStats stats;

  /// 1–12, the month with the most flights (earliest on a tie); null with no flights.
  final int? busiestMonth;
  final int busiestMonthFlights;

  /// First and last flight of the year (best-known departure).
  final Flight? first;
  final Flight? last;

  bool get isEmpty => stats.isEmpty;
}

typedef LocalTime = DateTime Function(DateTime utc, String? timeZone);

DateTime _local(Flight f, LocalTime? localTime) {
  final dep = f.gateOut.best ?? f.takeoff.best ?? DateTime.utc(1970);
  return f.origin.timeZone == null || localTime == null ? dep : localTime(dep, f.origin.timeZone);
}

/// Years that have at least one flown flight, newest first.
List<int> wrappedYears(Iterable<Flight> flights, DateTime now, {LocalTime? localTime}) {
  final years = {for (final f in flownFlights(flights, now)) _local(f, localTime).year}.toList()..sort((a, b) => b.compareTo(a));
  return years;
}

WrappedStats computeWrapped(
  Iterable<Flight> flights,
  DateTime now,
  int year, {
  String? Function(String iata)? countryOf,
  LocalTime? localTime,
}) {
  final inYear = flownFlights(flights, now).where((f) => _local(f, localTime).year == year).toList()
    ..sort((a, b) => (a.gateOut.best ?? DateTime.utc(9999)).compareTo(b.gateOut.best ?? DateTime.utc(9999)));
  final stats = computePassport(inYear, now, countryOf: countryOf, localTime: localTime);
  final perMonth = <int, int>{};
  for (final f in inYear) {
    final m = _local(f, localTime).month;
    perMonth[m] = (perMonth[m] ?? 0) + 1;
  }
  int? best;
  for (final m in (perMonth.keys.toList()..sort())) {
    if (best == null || perMonth[m]! > perMonth[best]!) best = m;
  }
  return WrappedStats(
    year: year,
    stats: stats,
    busiestMonth: best,
    busiestMonthFlights: best == null ? 0 : perMonth[best]!,
    first: inYear.isEmpty ? null : inYear.first,
    last: inYear.isEmpty ? null : inYear.last,
  );
}
