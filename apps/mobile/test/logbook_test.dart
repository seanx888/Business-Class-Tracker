import 'dart:convert';

import 'package:aethersky/core/format.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:aethersky/domain/logbook.dart';
import 'package:aethersky/domain/trip.dart';
import 'package:flutter_test/flutter_test.dart';

final now = DateTime.utc(2027, 3, 1);

Flight flown(
  String carrier,
  String number,
  String from,
  String to,
  DateTime dep, {
  int? km,
  String? type,
  String? reg,
  bool cancelled = false,
  String tz = 'Asia/Taipei',
}) {
  final arr = dep.add(const Duration(hours: 3));
  return Flight(
    id: '$carrier$number-${dep.toIso8601String().substring(0, 10)}',
    carrier: carrier,
    number: number,
    origin: FlightEndpoint(iata: from, timeZone: tz),
    destination: FlightEndpoint(iata: to),
    gateOut: FlightTime(scheduled: dep, actual: dep),
    takeoff: FlightTime(actual: dep),
    landing: FlightTime(actual: arr),
    gateIn: FlightTime(scheduled: arr, actual: arr),
    distanceKm: km,
    aircraftType: type,
    registration: reg,
    cancelled: cancelled,
  );
}

void main() {
  initTimeZones();

  group('FlightLog', () {
    test('clean trims, upper-cases codes, drops blanks and out-of-range ratings', () {
      final l = FlightLog.clean(
        aircraftType: ' b789 ',
        registration: ' b-16722',
        purpose: TripPurpose.leisure,
        ratings: {RatingAspect.overall: 5, RatingAspect.food: 0, RatingAspect.seat: 6, RatingAspect.service: 3},
        experience: '  Great crew.  ',
        photos: ['a.jpg'],
      );
      expect(l.aircraftType, 'B789');
      expect(l.registration, 'B-16722');
      expect(l.ratings, {RatingAspect.overall: 5, RatingAspect.service: 3});
      expect(l.experience, 'Great crew.');
      expect(FlightLog.clean(aircraftType: '   ', experience: '\n').isEmpty, isTrue);
    });

    test('aircraft and purpose alone are facts, not a review', () {
      expect(FlightLog.clean(aircraftType: 'A359', purpose: TripPurpose.business).hasReview, isFalse);
      expect(FlightLog.clean(ratings: {RatingAspect.overall: 4}).hasReview, isTrue);
      expect(FlightLog.clean(experience: 'ok').hasReview, isTrue);
      expect(FlightLog.clean(photos: ['a.jpg']).hasReview, isTrue);
    });

    test('JSON round trip keeps everything', () {
      final l = FlightLog.clean(
        aircraftType: 'A359',
        registration: 'B-58501',
        purpose: TripPurpose.business,
        ratings: {RatingAspect.seat: 4, RatingAspect.food: 2},
        experience: 'Meal was cold.',
        photos: ['1-a.jpg', '2-b.jpg'],
      );
      final back = FlightLog.fromJson(jsonDecode(jsonEncode(l.toJson())) as Map<String, dynamic>);
      expect(back.aircraftType, 'A359');
      expect(back.purpose, TripPurpose.business);
      expect(back.ratings, {RatingAspect.seat: 4, RatingAspect.food: 2});
      expect(back.photos, ['1-a.jpg', '2-b.jpg']);
    });

    test('loading is tolerant: unknown enums, wrong types and unsafe file names are dropped, never fatal', () {
      final l = FlightLog.fromJson(
        {
          'purpose': 'holiday',
          'ratings': {'overall': 9, 'seat': 'five', 'legroom': 3, 'food': 2.6},
          'photos': ['ok.jpg', '../../etc/passwd', 'a/b.jpg', '', 42, '..hidden', 'x..y.jpg'],
          'aircraftType': 12,
        }.cast<String, dynamic>(),
      );
      expect(l.purpose, isNull);
      expect(l.ratings, {RatingAspect.food: 3});
      expect(l.photos, ['ok.jpg']);
    });
  });

  group('TripInfo with a log', () {
    test('an old stored trip without a log still loads, and a log makes the trip non-empty', () {
      final old = TripInfo.fromJson({'cabin': 'business', 'seat': '12A'});
      expect(old.log.isEmpty, isTrue);
      expect(old.isEmpty, isFalse);
      expect(const TripInfo().isEmpty, isTrue);
      expect(TripInfo(log: FlightLog.clean(experience: 'Nice')).isEmpty, isFalse);
    });

    test('the log survives the trip round trip and is left out of the JSON when empty', () {
      final t = TripInfo.clean(
        cabin: Cabin.first,
        seat: '1a',
        log: FlightLog.clean(aircraftType: 'B77W', experience: 'Suite'),
      );
      final back = TripInfo.fromJson(jsonDecode(jsonEncode(t.toJson())) as Map<String, dynamic>);
      expect(back.cabin, Cabin.first);
      expect(back.seat, '1A');
      expect(back.log.aircraftType, 'B77W');
      expect(back.log.experience, 'Suite');
      expect(TripInfo.clean(cabin: Cabin.economy).toJson().containsKey('log'), isFalse);
    });

    test('copyWith replaces only the log', () {
      final t = TripInfo.clean(cabin: Cabin.premium, seat: '30K').copyWith(log: FlightLog.clean(experience: 'x'));
      expect(t.cabin, Cabin.premium);
      expect(t.log.experience, 'x');
    });
  });

  final flights = [
    flown('BR', '198', 'TPE', 'NRT', DateTime.utc(2026, 3, 10, 1), km: 2190, type: 'A333', reg: 'B-16337'),
    flown('BR', '197', 'NRT', 'TPE', DateTime.utc(2026, 3, 14, 6), km: 2190, type: 'B789'),
    flown('CI', '160', 'TPE', 'ICN', DateTime.utc(2026, 7, 1, 2), km: 1480, type: 'A359'),
    flown('JX', '2', 'TPE', 'LAX', DateTime.utc(2026, 12, 31, 16, 30), km: 10930),
    flown('BR', '1', 'TPE', 'NRT', DateTime.utc(2026, 5, 1), km: 2190, cancelled: true),
    flown('CI', '999', 'TPE', 'HKG', now.add(const Duration(days: 3))),
  ];
  final infos = {
    flights[0].id: TripInfo(
      cabin: Cabin.business,
      log: FlightLog.clean(
        purpose: TripPurpose.business,
        ratings: {RatingAspect.overall: 5, RatingAspect.food: 4},
        experience: 'Fine',
        photos: ['a.jpg', 'b.jpg'],
      ),
    ),
    flights[1].id: TripInfo(
      cabin: Cabin.economy,
      log: FlightLog.clean(aircraftType: 'b78x', ratings: {RatingAspect.overall: 3}, registration: 'b-16337'),
    ),
    flights[2].id: const TripInfo(cabin: Cabin.economy),
  };

  group('log entries', () {
    final entries = logEntries(flights, infos, now);

    test('only flights that happened, newest first', () {
      expect(entries.map((e) => e.flight.ident), ['JX2', 'CI160', 'BR197', 'BR198']);
    });

    test('the traveller\'s aircraft wins over the reported one; the reported one is the fallback', () {
      expect(entries.firstWhere((e) => e.flight.ident == 'BR197').aircraftType, 'B78X');
      expect(entries.firstWhere((e) => e.flight.ident == 'BR198').aircraftType, 'A333');
      expect(entries.firstWhere((e) => e.flight.ident == 'JX2').aircraftType, isNull);
    });

    test('the year is the year at the origin airport', () {
      final jx = entries.first;
      expect(entryYear(jx, atAirport), 2027, reason: '00:30 on 1 Jan in Taipei');
      expect(entryYear(entries.last, atAirport), 2026);
    });
  });

  group('statistics', () {
    final s = computeLogbook(logEntries(flights, infos, now));

    test('totals and airline counts', () {
      expect(s.flights, 4);
      expect(s.distanceKm, 2190 + 2190 + 1480 + 10930);
      expect(s.airlines.map((a) => (a.key, a.flights)), [('BR', 2), ('JX', 1), ('CI', 1)], reason: 'ties are broken by distance');
      expect(s.airlines.first.km, 4380);
    });

    test('aircraft types come from the record, else the data source; unknown types are not counted', () {
      expect(s.aircraftTypes.map((a) => a.key).toSet(), {'A333', 'B78X', 'A359'});
      expect(s.aircraftTypes.every((a) => a.flights == 1), isTrue);
    });

    test('cabins, purposes, ratings, reviews, photos and tails', () {
      expect(s.cabins, {Cabin.business: 1, Cabin.economy: 2});
      expect(s.purposes, {TripPurpose.business: 1});
      expect(s.ratings[RatingAspect.overall], (average: 4.0, count: 2));
      expect(s.ratings[RatingAspect.food], (average: 4.0, count: 1));
      expect(s.ratings.containsKey(RatingAspect.seat), isFalse);
      expect(s.reviewed, 2);
      expect(s.photos, 2);
      expect(s.registrations, 1, reason: 'B-16337 twice counts once');
    });

    test('an empty logbook is empty', () {
      final e = computeLogbook(const []);
      expect(e.isEmpty, isTrue);
      expect(e.airlines, isEmpty);
    });
  });

  group('CSV', () {
    String csv() =>
        logbookCsv(logEntries(flights, infos, now), dateOf: (e) => '2026-03-10', airlineName: (c) => c == 'BR' ? 'EVA Air, Taiwan' : c);

    test('starts with a BOM and the header, uses CRLF, quotes cells that need it', () {
      final text = csv();
      expect(text.startsWith('﻿Date,Flight,Airline'), isTrue);
      final lines = text.split('\r\n');
      expect(lines.length, 6, reason: 'header + 4 flights + trailing break');
      expect(lines.last, '');
      final br198 = lines.firstWhere((l) => l.contains(',BR198,'));
      expect(br198, contains('"EVA Air, Taiwan"'));
      expect(br198, contains(',business,'));
      expect(br198, '2026-03-10,BR198,"EVA Air, Taiwan",TPE,NRT,2190,A333,B-16337,business,,business,5,,4,,Fine,');
    });

    test('quotes inside text are doubled and line breaks stay inside the cell', () {
      expect(csvCell('He said "hi"\nbye'), '"He said ""hi""\nbye"');
      expect(csvCell(null), '');
      expect(csvCell(2190), '2190');
    });

    test('anything that a spreadsheet would run as a formula is neutralised', () {
      expect(csvCell('=HYPERLINK("http://x")'), startsWith('"\'='));
      expect(csvCell('+1 555'), "'+1 555");
      expect(csvCell('-5'), '-5', reason: 'a plain number stays a number');
      expect(csvCell('@home'), "'@home");
    });
  });
}
