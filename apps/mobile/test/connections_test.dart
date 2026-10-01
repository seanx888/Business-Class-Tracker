import 'package:aethersky/domain/connections.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:flutter_test/flutter_test.dart';

final now = DateTime.utc(2026, 12, 20, 0);
DateTime at(int h, [int m = 0]) => DateTime.utc(2026, 12, 20, h, m);

Flight leg(
  String id,
  String from,
  String to,
  DateTime out,
  DateTime into, {
  DateTime? inEst,
  String? fromTerm,
  String? toTerm,
  bool cancelled = false,
}) {
  return Flight(
    id: id,
    carrier: 'BR',
    number: id.replaceAll(RegExp(r'\D'), ''),
    origin: FlightEndpoint(iata: from, terminal: fromTerm),
    destination: FlightEndpoint(iata: to, terminal: toTerm),
    gateOut: FlightTime(scheduled: out),
    gateIn: FlightTime(scheduled: into, estimated: inEst),
    cancelled: cancelled,
  );
}

const countries = {'TPE': 'TW', 'NRT': 'JP', 'HND': 'JP', 'KIX': 'JP', 'LAX': 'US', 'SFO': 'US', 'ICN': 'KR'};
String? countryOf(String i) => countries[i];

void main() {
  test('layover risk bands: international 45 / 90, domestic 30 / 60, +30 min with a terminal change', () {
    ConnectionRisk r(int min, {bool intl = true, bool term = false}) => assessLayover(Duration(minutes: min), international: intl, terminalChange: term);
    expect(r(-5), ConnectionRisk.missed);
    expect(r(44), ConnectionRisk.critical);
    expect(r(45), ConnectionRisk.tight);
    expect(r(89), ConnectionRisk.tight);
    expect(r(90), ConnectionRisk.ok);
    expect(r(29, intl: false), ConnectionRisk.critical);
    expect(r(30, intl: false), ConnectionRisk.tight);
    expect(r(60, intl: false), ConnectionRisk.ok);
    // With a terminal change the bands move up by 30 minutes.
    expect(r(74, term: true), ConnectionRisk.critical);
    expect(r(75, term: true), ConnectionRisk.tight);
    expect(r(119, term: true), ConnectionRisk.tight);
    expect(r(120, term: true), ConnectionRisk.ok);
    expect(r(59, intl: false, term: true), ConnectionRisk.critical);
    expect(r(89, intl: false, term: true), ConnectionRisk.tight);
    expect(r(90, intl: false, term: true), ConnectionRisk.ok);
  });

  test('TPE→NRT then NRT→LAX two hours later is an international connection that is fine', () {
    final a = leg('BR198', 'TPE', 'NRT', at(1), at(4));
    final b = leg('BR6', 'NRT', 'LAX', at(6), at(18));
    final c = findConnections([b, a], now, countryOf: countryOf).single;
    expect(c.from.id, 'BR198');
    expect(c.to.id, 'BR6');
    expect(c.airport, 'NRT');
    expect(c.layover, const Duration(hours: 2));
    expect(c.international, isTrue);
    expect(c.risk, ConnectionRisk.ok);
    expect(c.shrunkBy, Duration.zero);
  });

  test('a delay on the first leg eats the layover and raises the risk; the original schedule is kept for comparison', () {
    final a = leg('BR198', 'TPE', 'NRT', at(1), at(4), inEst: at(5, 10));
    final b = leg('BR6', 'NRT', 'LAX', at(6), at(18));
    final c = findConnections([a, b], now, countryOf: countryOf).single;
    expect(c.layover, const Duration(minutes: 50));
    expect(c.scheduledLayover, const Duration(hours: 2));
    expect(c.shrunkBy, const Duration(minutes: 70));
    expect(c.risk, ConnectionRisk.tight);
  });

  test('arriving after the next flight has left is "missed"', () {
    final a = leg('BR198', 'TPE', 'NRT', at(1), at(4), inEst: at(6, 30));
    final b = leg('BR6', 'NRT', 'LAX', at(6), at(18));
    final c = findConnections([a, b], now, countryOf: countryOf).single;
    expect(c.risk, ConnectionRisk.missed);
    expect(c.layover.isNegative, isTrue);
  });

  test('a terminal change tightens the verdict', () {
    final a = leg('BR198', 'TPE', 'NRT', at(1), at(4), toTerm: '2');
    final b = leg('BR6', 'NRT', 'LAX', at(5, 30), at(18), fromTerm: '1');
    final c = findConnections([a, b], now, countryOf: countryOf).single;
    expect(c.terminalChange, isTrue);
    expect(c.layover, const Duration(minutes: 90));
    expect(c.risk, ConnectionRisk.tight, reason: '90 min is fine alone, not with a terminal change (needs 120)');
    final same = findConnections(
      [leg('x1', 'TPE', 'NRT', at(1), at(4), toTerm: '1'), leg('x2', 'NRT', 'LAX', at(5, 30), at(18), fromTerm: '1')],
      now,
      countryOf: countryOf,
    ).single;
    expect(same.terminalChange, isFalse);
    expect(same.risk, ConnectionRisk.ok);
  });

  test('domestic-only legs use the lower thresholds; unknown countries are treated as international', () {
    final a = leg('JL1', 'NRT', 'HND', at(1), at(2));
    final b = leg('JL2', 'HND', 'KIX', at(3), at(4));
    final dom = findConnections([a, b], now, countryOf: countryOf).single;
    expect(dom.international, isFalse);
    expect(dom.risk, ConnectionRisk.ok, reason: '60 min domestic');
    final unknown = findConnections([a, b], now).single;
    expect(unknown.international, isTrue);
    expect(unknown.risk, ConnectionRisk.tight, reason: '60 min is tight when the leg might be international');
  });

  test('not connections: different airports, a wait of more than a day, cancelled or finished flights, unrelated earlier flights', () {
    final a = leg('BR198', 'TPE', 'NRT', at(1), at(4));
    expect(findConnections([a, leg('BR7', 'HND', 'LAX', at(6), at(18))], now, countryOf: countryOf), isEmpty, reason: 'NRT ≠ HND');
    final dayLater = at(4).add(const Duration(hours: 30));
    expect(findConnections([a, leg('BR8', 'NRT', 'LAX', dayLater, dayLater.add(const Duration(hours: 12)))], now, countryOf: countryOf), isEmpty);
    expect(findConnections([a, leg('BR9', 'NRT', 'LAX', at(6), at(18), cancelled: true)], now, countryOf: countryOf), isEmpty);
    final done = leg('BR1', 'TPE', 'NRT', at(1), at(4));
    expect(findConnections([done, leg('BR2', 'NRT', 'LAX', at(6), at(18))], DateTime.utc(2026, 12, 21), countryOf: countryOf), isEmpty);
    final earlier = leg('BR10', 'NRT', 'LAX', at(4).subtract(const Duration(hours: 9)), at(18));
    expect(findConnections([a, earlier], now, countryOf: countryOf), isEmpty, reason: 'left 9 h before we land: unrelated, not "missed"');
  });

  test('each first leg pairs with the next departure from its arrival airport only', () {
    final a = leg('BR198', 'TPE', 'NRT', at(1), at(4));
    final b = leg('BR6', 'NRT', 'LAX', at(6), at(18));
    final c = leg('BR7', 'NRT', 'SFO', at(8), at(20));
    final found = findConnections([a, b, c], now, countryOf: countryOf);
    expect(found.map((x) => x.to.id), ['BR6']);
  });

  test('atRisk lists the worst first and drops comfortable ones', () {
    final ok = findConnections([leg('a', 'TPE', 'NRT', at(1), at(4)), leg('b', 'NRT', 'LAX', at(7), at(18))], now, countryOf: countryOf);
    final tight = findConnections([leg('c', 'TPE', 'NRT', at(1), at(4)), leg('d', 'NRT', 'LAX', at(5, 15), at(18))], now, countryOf: countryOf);
    final missed = findConnections([leg('e', 'TPE', 'NRT', at(1), at(4), inEst: at(7)), leg('f', 'NRT', 'LAX', at(6), at(18))], now, countryOf: countryOf);
    final list = atRisk([...ok, ...tight, ...missed]);
    expect(list.map((c) => c.risk), [ConnectionRisk.missed, ConnectionRisk.tight]);
  });
}
