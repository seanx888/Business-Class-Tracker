// Travel documents: passports, visas, ID cards — only the kind, holder, country and EXPIRY DATE. No document number is
// ever stored. Two checks: is a document about to expire, and is a passport/visa still good for the trips you have booked
// (many countries refuse entry when a passport has under six months left).
import 'flight.dart';
import 'schedule.dart';

enum DocKind { passport, visa, idCard, other }

class TravelDoc {
  const TravelDoc({required this.id, required this.kind, required this.holder, required this.country, required this.expiry});

  final String id;
  final DocKind kind;
  final String holder;

  /// ISO 3166 alpha-2. Passport / ID: the issuing country. Visa: the country it lets you enter.
  final String country;
  final DateTime expiry; // a calendar day (UTC midnight)

  int daysLeft(DateTime today) => expiry.difference(DateTime.utc(today.year, today.month, today.day)).inDays;

  static DocKind _kind(Object? v) => DocKind.values.firstWhere((k) => k.name == v, orElse: () => DocKind.other);

  static TravelDoc? fromJson(Map<String, dynamic> j) {
    final expiry = DateTime.tryParse('${j['expiry']}');
    final id = j['id'];
    if (expiry == null || id is! String) return null;
    return TravelDoc(
      id: id,
      kind: _kind(j['kind']),
      holder: (j['holder'] as String?) ?? '',
      country: ((j['country'] as String?) ?? '').toUpperCase(),
      expiry: DateTime.utc(expiry.year, expiry.month, expiry.day),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': kind.name,
    'holder': holder,
    'country': country,
    'expiry': expiry.toIso8601String().substring(0, 10),
  };
}

/// How many days before expiry a document is called "expiring soon".
const expiringSoonDays = 180;

/// Entry rule of thumb used for the trip check (many countries: passport valid ≥ 6 months after arrival).
const passportValidityAfterEntry = Duration(days: 183);

enum DocIssueKind {
  /// The passport expires before you even arrive.
  passportExpiredByTrip,

  /// The visa expires before you arrive.
  visaExpiredByTrip,

  /// The document is already expired.
  expired,

  /// A passport that will have less than six months left on arrival.
  passportUnderSixMonths,

  /// Expires within [expiringSoonDays].
  expiringSoon,
}

class DocIssue {
  const DocIssue({required this.kind, required this.doc, this.flight, this.country});

  final DocIssueKind kind;
  final TravelDoc doc;

  /// The first upcoming flight the issue applies to (trip checks only).
  final Flight? flight;

  /// The country being entered (trip checks only).
  final String? country;

  /// Errors (you will be refused / it is unusable) before warnings.
  bool get isError => kind == DocIssueKind.passportExpiredByTrip || kind == DocIssueKind.visaExpiredByTrip || kind == DocIssueKind.expired;
}

/// Everything worth telling the traveller, most serious first. [countryOf] maps an airport code to its ISO country.
List<DocIssue> checkDocuments(
  Iterable<TravelDoc> docs,
  Iterable<Flight> flights,
  DateTime now, {
  String? Function(String iata)? countryOf,
}) {
  final today = DateTime.utc(now.year, now.month, now.day);
  final upcoming = flights.where((f) => !isFinished(f, now) && !f.cancelled).toList()
    ..sort((a, b) => (a.gateOut.best ?? DateTime.utc(9999)).compareTo(b.gateOut.best ?? DateTime.utc(9999)));
  final issues = <DocIssue>[];

  for (final d in docs) {
    final left = d.daysLeft(today);
    if (left < 0) {
      issues.add(DocIssue(kind: DocIssueKind.expired, doc: d));
      continue; // an expired document needs no further findings
    }
    var tripIssue = false;
    final seen = <String>{};
    for (final f in upcoming) {
      final entering = countryOf?.call(f.destination.iata);
      if (entering == null || entering.isEmpty || d.country.isEmpty) continue;
      final arrival = f.gateIn.best ?? f.landing.best ?? f.gateOut.best;
      if (arrival == null) continue;
      final arrivalDay = DateTime.utc(arrival.year, arrival.month, arrival.day);
      if (d.kind == DocKind.passport && entering != d.country && seen.add(entering)) {
        if (d.expiry.isBefore(arrivalDay)) {
          issues.add(DocIssue(kind: DocIssueKind.passportExpiredByTrip, doc: d, flight: f, country: entering));
          tripIssue = true;
        } else if (d.expiry.isBefore(arrivalDay.add(passportValidityAfterEntry))) {
          issues.add(DocIssue(kind: DocIssueKind.passportUnderSixMonths, doc: d, flight: f, country: entering));
          tripIssue = true;
        }
      } else if (d.kind == DocKind.visa && entering == d.country && seen.add(entering)) {
        if (d.expiry.isBefore(arrivalDay)) {
          issues.add(DocIssue(kind: DocIssueKind.visaExpiredByTrip, doc: d, flight: f, country: entering));
          tripIssue = true;
        }
      }
    }
    // The generic reminder is redundant once a trip check already names the problem.
    if (!tripIssue && left <= expiringSoonDays) issues.add(DocIssue(kind: DocIssueKind.expiringSoon, doc: d));
  }

  int rank(DocIssue i) => switch (i.kind) {
    DocIssueKind.passportExpiredByTrip || DocIssueKind.visaExpiredByTrip => 0,
    DocIssueKind.expired => 1,
    DocIssueKind.passportUnderSixMonths => 2,
    DocIssueKind.expiringSoon => 3,
  };
  return issues..sort((a, b) {
    final r = rank(a).compareTo(rank(b));
    return r != 0 ? r : a.doc.expiry.compareTo(b.doc.expiry);
  });
}
