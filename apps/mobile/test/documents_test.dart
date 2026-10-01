import 'package:aethersky/domain/documents.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:flutter_test/flutter_test.dart';

final now = DateTime.utc(2026, 9, 30, 8);
DateTime day(int y, int m, int d) => DateTime.utc(y, m, d);

TravelDoc doc(String id, DocKind kind, String country, DateTime expiry, {String holder = 'Sean'}) =>
    TravelDoc(id: id, kind: kind, holder: holder, country: country, expiry: expiry);

Flight trip(String ident, String from, String to, DateTime dep, {Duration block = const Duration(hours: 3)}) => Flight(
  id: '$ident-${dep.toIso8601String().substring(0, 10)}',
  carrier: ident.substring(0, 2),
  number: ident.substring(2),
  origin: FlightEndpoint(iata: from),
  destination: FlightEndpoint(iata: to),
  gateOut: FlightTime(scheduled: dep),
  gateIn: FlightTime(scheduled: dep.add(block)),
);

const countries = {'TPE': 'TW', 'NRT': 'JP', 'ICN': 'KR', 'LAX': 'US'};
String? countryOf(String i) => countries[i];

List<DocIssue> check(List<TravelDoc> docs, List<Flight> flights) => checkDocuments(docs, flights, now, countryOf: countryOf);

void main() {
  test('days left counts calendar days from today', () {
    expect(doc('a', DocKind.passport, 'TW', day(2026, 10, 30)).daysLeft(now), 30);
    expect(doc('a', DocKind.passport, 'TW', day(2026, 9, 30)).daysLeft(now), 0);
    expect(doc('a', DocKind.passport, 'TW', day(2026, 9, 1)).daysLeft(now), -29);
  });

  test('an expired document is an error and needs nothing else said', () {
    final i = check([doc('p', DocKind.passport, 'TW', day(2026, 9, 1))], [trip('BR198', 'TPE', 'NRT', day(2026, 12, 20))]).single;
    expect(i.kind, DocIssueKind.expired);
    expect(i.isError, isTrue);
  });

  test('expiring within 180 days is a heads-up; comfortably valid is silent', () {
    expect(check([doc('p', DocKind.passport, 'TW', day(2027, 2, 1))], []).single.kind, DocIssueKind.expiringSoon);
    expect(check([doc('p', DocKind.passport, 'TW', day(2027, 4, 1))], []), isEmpty, reason: '183 days left');
    expect(check([doc('p', DocKind.passport, 'TW', day(2027, 3, 29))], []).single.kind, DocIssueKind.expiringSoon, reason: '180 days left');
  });

  test('passport with under six months left on arrival in another country → warning naming the first flight', () {
    final p = doc('p', DocKind.passport, 'TW', day(2027, 3, 1)); // valid on arrival, but only 71 days left after a 20 Dec arrival
    final i = check([p], [trip('BR6', 'NRT', 'LAX', day(2027, 1, 5)), trip('BR198', 'TPE', 'NRT', day(2026, 12, 20))]).first;
    expect(i.kind, DocIssueKind.passportUnderSixMonths);
    expect(i.country, 'JP');
    expect(i.flight!.ident, 'BR198', reason: 'the earliest flight into that country');
    expect(i.isError, isFalse);
  });

  test('passport that expires before arrival → error', () {
    final p = doc('p', DocKind.passport, 'TW', day(2026, 12, 1));
    final i = check([p], [trip('BR198', 'TPE', 'NRT', day(2026, 12, 20))]).single;
    expect(i.kind, DocIssueKind.passportExpiredByTrip);
    expect(i.isError, isTrue);
    expect(i.country, 'JP');
  });

  test('a long-valid passport raises nothing; flying home (own country) or domestically is not an "entry"', () {
    final good = doc('p', DocKind.passport, 'TW', day(2032, 1, 1));
    expect(check([good], [trip('BR198', 'TPE', 'NRT', day(2026, 12, 20))]), isEmpty);
    final short = doc('p', DocKind.passport, 'TW', day(2026, 12, 1));
    expect(
      check([short], [trip('BR197', 'NRT', 'TPE', day(2026, 11, 1)), trip('BR2', 'TPE', 'TPE', day(2026, 11, 3))]).map((i) => i.kind),
      [DocIssueKind.expiringSoon],
      reason: 'flying into your own country needs no entry check — only the generic reminder remains',
    );
  });

  test('one finding per destination country, however many flights go there', () {
    final p = doc('p', DocKind.passport, 'TW', day(2027, 1, 30));
    final issues = check(
      [p],
      [
        trip('BR198', 'TPE', 'NRT', day(2026, 12, 20)),
        trip('BR197', 'NRT', 'TPE', day(2026, 12, 28)),
        trip('BR12', 'TPE', 'NRT', day(2027, 1, 10)),
      ],
    );
    expect(issues.where((i) => i.country == 'JP'), hasLength(1));
  });

  test('visa: only matters when it lapses before you arrive in that country', () {
    final visa = doc('v', DocKind.visa, 'US', day(2026, 11, 1));
    final late = check([visa], [trip('BR6', 'NRT', 'LAX', day(2026, 12, 20))]).single;
    expect(late.kind, DocIssueKind.visaExpiredByTrip);
    expect(late.country, 'US');
    final fine = check([doc('v', DocKind.visa, 'US', day(2027, 6, 1))], [trip('BR6', 'NRT', 'LAX', day(2026, 12, 20))]);
    expect(fine, isEmpty, reason: 'valid on arrival and not near expiry');
    expect(
      check([visa], [trip('BR198', 'TPE', 'NRT', day(2026, 12, 20))]).single.kind,
      DocIssueKind.expiringSoon,
      reason: 'no US trip → only the reminder',
    );
  });

  test('finished or cancelled flights are ignored; a doc with no country only gets the generic reminder', () {
    final p = doc('p', DocKind.passport, 'TW', day(2026, 12, 1));
    final past = trip('BR198', 'TPE', 'NRT', day(2026, 9, 1));
    expect(check([p], [past]).map((i) => i.kind), [DocIssueKind.expiringSoon]);
    final noCountry = doc('p', DocKind.passport, '', day(2026, 12, 1));
    expect(check([noCountry], [trip('BR198', 'TPE', 'NRT', day(2026, 12, 20))]).map((i) => i.kind), [DocIssueKind.expiringSoon]);
  });

  test('most serious first: trip errors, then expired, then six-month warnings, then reminders', () {
    final issues = check(
      [
        doc('soon', DocKind.idCard, 'TW', day(2026, 12, 1)),
        doc('old', DocKind.other, 'TW', day(2026, 8, 1)),
        doc('six', DocKind.passport, 'TW', day(2027, 3, 1), holder: 'Blue'),
        doc('bad', DocKind.passport, 'TW', day(2026, 12, 1), holder: 'Kid'),
      ],
      [trip('BR198', 'TPE', 'NRT', day(2026, 12, 20))],
    );
    expect(issues.map((i) => i.doc.id), ['bad', 'old', 'six', 'soon']);
  });

  test('JSON round trip keeps the fields — and there is no field for a document number', () {
    final d = doc('p', DocKind.passport, 'tw', day(2030, 5, 6));
    final j = d.toJson();
    expect(j.keys.toSet(), {'id', 'kind', 'holder', 'country', 'expiry'});
    final back = TravelDoc.fromJson(j)!;
    expect(back.expiry, day(2030, 5, 6));
    expect(back.kind, DocKind.passport);
    expect(TravelDoc.fromJson({'id': 'x', 'expiry': 'nope'}), isNull);
    expect(TravelDoc.fromJson({'id': 'x', 'kind': 'weird', 'expiry': '2030-01-01'})!.kind, DocKind.other);
  });
}
