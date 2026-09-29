import 'package:aethersky/domain/itinerary_parser.dart';
import 'package:flutter_test/flutter_test.dart';

final now = DateTime.utc(2026, 9, 29);
DateTime d(int y, int m, int day) => DateTime.utc(y, m, day);

/// "BR198@2026-12-20" for compact comparisons.
List<String> parse(String text, {DateTime? at}) => parseItinerary(text, now: at ?? now).map((f) => f.toString()).toList();

void main() {
  test('single flight number in an airline e-mail line', () {
    expect(parse('Your flight BR 198 departs 20 Dec 2026 at 08:35 from TPE'), ['BR198@2026-12-20']);
  });

  test('EVA-style table with DDMMMYYYY dates and a return leg', () {
    const mail = '''
Dear passenger, your booking K7XQ2P is confirmed.
Flight  Date  Route
BR 198  20DEC2026  TPE - NRT  08:35 12:45
BR 197  05JAN2027  NRT - TPE  14:30 17:40
''';
    expect(parse(mail), ['BR198@2026-12-20', 'BR197@2027-01-05']);
  });

  test('Chinese itinerary: 2026年12月20日 and 1月5日, leading zeros in the flight number removed', () {
    const mail = '''
訂位代號：K7XQ2P
去程：2026年12月20日 CI0160 桃園 TPE → 仁川 ICN 09:10
回程：2027年1月5日 KE692 仁川 ICN → 桃園 TPE
''';
    expect(parse(mail), ['CI160@2026-12-20', 'KE692@2027-01-05']);
  });

  test('Korean itinerary', () {
    expect(parse('가는 편 2026년 12월 20일(일) KE692 ICN→TPE'), ['KE692@2026-12-20']);
    expect(parse('오는 편 1월 5일 KE691 TPE→ICN', at: d(2026, 12, 1)), [
      'KE691@2027-01-05',
    ], reason: 'January is next year when read in December');
  });

  test('GDS itinerary lines (Amadeus style) with year-less dates', () {
    const gds = '''
 1  BR 198 J 20DEC 6 TPENRT HK1  0835 1245  20DEC  E  0 789
 2  BR 197 J 05JAN 2 NRTTPE HK1  1430 1740  05JAN  E  0 789
''';
    expect(parse(gds), ['BR198@2026-12-20', 'BR197@2027-01-05'], reason: 'return leg falls after New Year');
  });

  test('date heading above the legs (Google Flights / OTA layout) applies to every leg under it', () {
    const text = '''
Sat, Dec 20 · 8:35 AM – 12:45 PM
EVA Air BR 198 · Boeing 787-9
Tokyo → Osaka
Sun, Dec 21
JAL JL 3011
''';
    expect(parse(text), ['BR198@2026-12-20', 'JL3011@2026-12-21']);
  });

  test('table read cell by cell: the date below belongs to the flight above it', () {
    const text = '''
Flight
BR198
Departure
2026-12-20 08:35
Flight
BR197
Departure
2027-01-05 14:30
''';
    expect(parse(text), ['BR198@2026-12-20', 'BR197@2027-01-05']);
  });

  test('month/day styles: Dec 20, 2026 · 20th December · 12/20 · 20-Dec-26', () {
    expect(parse('BR198 Dec 20, 2026'), ['BR198@2026-12-20']);
    expect(parse('BR198 on 20th December 2026'), ['BR198@2026-12-20']);
    expect(parse('BR198 12/20/2026'), ['BR198@2026-12-20']);
    expect(parse('BR198 12/20'), ['BR198@2026-12-20']);
    expect(parse('BR198 20/12/2026'), ['BR198@2026-12-20'], reason: 'first number > 12 can only be the day');
    expect(parse('BR198 20-Dec-26'), ['BR198@2026-12-20']);
  });

  test('year-less dates: recent past stays this year, older ones roll to next year', () {
    expect(parse('BR198 25SEP', at: now), ['BR198@2026-09-25'], reason: 'within a week');
    expect(parse('BR198 10AUG', at: now), ['BR198@2027-08-10']);
  });

  test('a flight with no date at all is still reported (the UI asks for the date)', () {
    final f = parseItinerary('Please check in for BR198 online', now: now).single;
    expect(f.ident, 'BR198');
    expect(f.date, isNull);
  });

  test('the same leg mentioned twice is reported once', () {
    expect(parse('BR198 20DEC2026\nReminder: BR198 20DEC2026'), ['BR198@2026-12-20']);
  });

  group('false positives', () {
    test('aircraft types are not flights (A350, A320, B787, B738)', () {
      expect(parse('Aircraft: A350-900 · 20DEC2026'), isEmpty);
      expect(parse('Airbus A320 / Boeing B787 / B738 on 2026-12-20'), isEmpty);
    });

    test('times of day, dates and PNRs are not flights', () {
      expect(parse('Departure 10:35 AM 20 Dec 2026'), isEmpty, reason: 'AM + 20 is a time and a day, not Aeroméxico 20');
      expect(parse('Booking ref K7XQ2P, 2026-12-20, total 12 000'), isEmpty);
      expect(parse('at 5 pm, meet me; IT 2026-12-20'), isEmpty, reason: 'digits followed by -12 form a date');
    });

    test('unknown airline codes and lower-case words are ignored', () {
      expect(parse('ZZ 123 20DEC2026'), isEmpty);
      expect(parse('see you at 5, br 198 maybe'), isEmpty, reason: 'only upper-case codes; typed single numbers go through the normal box');
    });

    test('airlines the fare scanner excludes are still recognised — a booked flight is yours to track', () {
      expect(parse('CX 400 20DEC2026'), ['CX400@2026-12-20']);
    });
  });

  test('empty and junk input', () {
    expect(parse(''), isEmpty);
    expect(parse('hello world'), isEmpty);
  });
}
