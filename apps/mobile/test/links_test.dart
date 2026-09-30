import 'dart:convert';
import 'dart:io';

import 'package:aethersky/domain/airlines.dart';
import 'package:aethersky/domain/links.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('link builders produce exactly the URLs of the PWA (shared fixture)', () {
    final cases = jsonDecode(File('../../test/fixtures/links-cases.json').readAsStringSync()) as List;
    expect(cases.length, greaterThanOrEqualTo(18));
    for (final c in cases.cast<Map<String, dynamic>>()) {
      final j = c['query'] as Map<String, dynamic>;
      final q = FareQuery(
        origin: j['origin'] as String,
        destination: j['destination'] as String,
        departDate: j['departDate'] as String,
        returnDate: j['returnDate'] as String?,
        currency: j['currency'] as String? ?? 'TWD',
        lang: j['lang'] as String? ?? 'zh-TW',
        gl: j['gl'] as String?,
        cabin: j['cabin'] as String? ?? 'business',
      );
      final got = switch (c['fn']) {
        'google' => googleFlightsUrl(q),
        'skyscanner' => skyscannerUrl(q),
        'kayak' => kayakUrl(q),
        _ => fail('unknown fn ${c['fn']}'),
      };
      expect(got, c['url'], reason: '${c['fn']}: ${c['name']}');
    }
  });

  test('searchLinks returns the three sites in PWA order', () {
    final links = searchLinks(const FareQuery(origin: 'TPE', destination: 'NRT', departDate: '2026-12-20'));
    expect(links.map((l) => l.key), ['google', 'skyscanner', 'kayak']);
  });

  test('airline table: alliances, LCC flag, blocked carriers still recognised', () {
    expect(allianceOfCarrier('CI'), Alliance.skyteam);
    expect(allianceOfCarrier('br'), Alliance.star);
    expect(allianceOfCarrier('JL'), Alliance.oneworld);
    expect(allianceOfCarrier('JX'), Alliance.none);
    expect(allianceOfCarrier('ZZ'), Alliance.none);
    expect(airlineDisplayName('BR', chinese: true), '長榮航空');
    expect(airlineDisplayName('CX'), 'Cathay Pacific', reason: 'excluded from fare search but a booked flight is still trackable');
    expect(isKnownAirlineCode('cx'), isTrue);
    expect(isKnownAirlineCode('A3'), isTrue);
    expect(isKnownAirlineCode('ZZ'), isFalse);
    expect(isLccCarrier('IT'), isTrue);
    expect(airlineWebsite('CI'), 'https://www.china-airlines.com');
    expect(airlineWebsite('ZZ'), isNull);
  });
}
