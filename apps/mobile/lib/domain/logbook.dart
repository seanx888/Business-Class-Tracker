// Logbook: the flown flights joined with what the traveller recorded about them, and the statistics FlightMemory-style
// logbooks are kept for (airlines, aircraft types, cabins, purpose, ratings). Pure functions; no I/O.
import 'flight.dart';
import 'passport.dart';
import 'trip.dart';

/// One flown flight plus the traveller's own record of it.
class LogEntry {
  const LogEntry(this.flight, this.info);

  final Flight flight;
  final TripInfo info;

  FlightLog get log => info.log;
  String get airline => flight.carrier;
  Cabin? get cabin => info.cabin;

  /// What the traveller said it was, else what the data source reported.
  String? get aircraftType => log.aircraftType ?? _blankToNull(flight.aircraftType)?.toUpperCase();
  String? get registration => log.registration ?? _blankToNull(flight.registration)?.toUpperCase();

  /// Departure instant used for ordering and for the year headings.
  DateTime? get departure => flight.gateOut.best ?? flight.takeoff.best;

  static String? _blankToNull(String? v) => v == null || v.trim().isEmpty ? null : v.trim();
}

/// Flights that really happened, newest first, each with its (possibly empty) record.
List<LogEntry> logEntries(Iterable<Flight> flights, Map<String, TripInfo> infos, DateTime now) {
  final out = [for (final f in flownFlights(flights, now)) LogEntry(f, infos[f.id] ?? const TripInfo())];
  out.sort((a, b) {
    final x = a.departure;
    final y = b.departure;
    if (x == null && y == null) return a.flight.id.compareTo(b.flight.id);
    if (x == null) return 1; // undated last
    if (y == null) return -1;
    final c = y.compareTo(x);
    return c != 0 ? c : a.flight.id.compareTo(b.flight.id);
  });
  return out;
}

/// The calendar year of departure at the origin airport; null when the flight has no time at all.
int? entryYear(LogEntry e, DateTime Function(DateTime utc, String? timeZone) localTime) {
  final d = e.departure;
  if (d == null) return null;
  // Hand-entered flights carry only a date (noon UTC), which is already the local day.
  return (e.flight.origin.timeZone == null ? d : localTime(d, e.flight.origin.timeZone)).year;
}

typedef CountKm = ({String key, int flights, int km});

class LogbookStats {
  const LogbookStats({
    required this.flights,
    required this.distanceKm,
    required this.airlines,
    required this.aircraftTypes,
    required this.cabins,
    required this.purposes,
    required this.ratings,
    required this.reviewed,
    required this.photos,
    required this.registrations,
  });

  final int flights;
  final int distanceKm;

  /// Airline code → flights and km, most flown first.
  final List<CountKm> airlines;

  /// Aircraft designator → flights and km, most flown first; flights with no known type are not counted here.
  final List<CountKm> aircraftTypes;
  final Map<Cabin, int> cabins;
  final Map<TripPurpose, int> purposes;

  /// Average and number of ratings per aspect (only aspects that were rated at least once).
  final Map<RatingAspect, ({double average, int count})> ratings;

  /// Entries with a rating, a written review or a photo.
  final int reviewed;
  final int photos;

  /// Distinct aircraft registrations flown ("tail spotting").
  final int registrations;

  bool get isEmpty => flights == 0;
}

LogbookStats computeLogbook(Iterable<LogEntry> entries) {
  final list = entries.toList();
  final airlines = <String, ({int flights, int km})>{};
  final types = <String, ({int flights, int km})>{};
  final cabins = <Cabin, int>{};
  final purposes = <TripPurpose, int>{};
  final sums = <RatingAspect, int>{};
  final counts = <RatingAspect, int>{};
  final tails = <String>{};
  var km = 0;
  var reviewed = 0;
  var photos = 0;

  ({int flights, int km}) bump(Map<String, ({int flights, int km})> m, String k, int d) {
    final cur = m[k] ?? (flights: 0, km: 0);
    return m[k] = (flights: cur.flights + 1, km: cur.km + d);
  }

  for (final e in list) {
    final d = e.flight.distanceKm ?? 0;
    km += d;
    bump(airlines, e.airline, d);
    final t = e.aircraftType;
    if (t != null) bump(types, t, d);
    final c = e.cabin;
    if (c != null) cabins[c] = (cabins[c] ?? 0) + 1;
    final p = e.log.purpose;
    if (p != null) purposes[p] = (purposes[p] ?? 0) + 1;
    for (final r in e.log.ratings.entries) {
      sums[r.key] = (sums[r.key] ?? 0) + r.value;
      counts[r.key] = (counts[r.key] ?? 0) + 1;
    }
    if (e.log.hasReview) reviewed++;
    photos += e.log.photos.length;
    final reg = e.registration;
    if (reg != null) tails.add(reg);
  }

  List<CountKm> ranked(Map<String, ({int flights, int km})> m) {
    final keys = m.keys.toList()
      ..sort((a, b) {
        final c = m[b]!.flights.compareTo(m[a]!.flights);
        if (c != 0) return c;
        final k = m[b]!.km.compareTo(m[a]!.km);
        return k != 0 ? k : a.compareTo(b);
      });
    return [for (final k in keys) (key: k, flights: m[k]!.flights, km: m[k]!.km)];
  }

  return LogbookStats(
    flights: list.length,
    distanceKm: km,
    airlines: ranked(airlines),
    aircraftTypes: ranked(types),
    cabins: cabins,
    purposes: purposes,
    ratings: {
      for (final a in RatingAspect.values)
        if (counts[a] != null) a: (average: sums[a]! / counts[a]!, count: counts[a]!),
    },
    reviewed: reviewed,
    photos: photos,
    registrations: tails.length,
  );
}

/// One CSV cell: quoted when needed, and neutralised when it would be read as a spreadsheet formula.
String csvCell(Object? v) {
  var t = v == null ? '' : '$v';
  if (t.isNotEmpty && '=+-@\t\r'.contains(t[0]) && double.tryParse(t) == null) t = "'$t";
  return t.contains(RegExp('[",\n\r]')) ? '"${t.replaceAll('"', '""')}"' : t;
}

const logbookCsvHeader = [
  'Date',
  'Flight',
  'Airline',
  'From',
  'To',
  'Distance (km)',
  'Aircraft',
  'Registration',
  'Cabin',
  'Seat',
  'Purpose',
  'Overall',
  'Seat rating',
  'Food',
  'Service',
  'Experience',
  'Notes',
];

/// The whole logbook as CSV (RFC 4180, CRLF, UTF-8 with BOM so spreadsheets read Chinese and Korean correctly).
/// [dateOf] formats the local departure date, [airlineName] turns a carrier code into a name.
String logbookCsv(
  Iterable<LogEntry> entries, {
  required String Function(LogEntry e) dateOf,
  required String Function(String carrier) airlineName,
}) {
  final rows = <List<Object?>>[
    logbookCsvHeader,
    for (final e in entries)
      [
        dateOf(e),
        e.flight.ident,
        airlineName(e.airline),
        e.flight.origin.iata,
        e.flight.destination.iata,
        e.flight.distanceKm,
        e.aircraftType,
        e.registration,
        e.cabin?.name,
        e.info.seat,
        e.log.purpose?.name,
        for (final a in RatingAspect.values) e.log.rating(a),
        e.log.experience,
        e.info.notes,
      ],
  ];
  return '﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n';
}
