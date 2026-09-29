import 'dart:convert';

import 'package:aethersky/data/flight_repository.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support.dart';

/// Knows two flights; everything else is "not found".
class StubSource implements FlightDataSource {
  final lookups = <String>[];

  Flight _flight(String carrier, String number, DateTime date, String from, String to) => Flight(
    id: '$carrier$number-${date.toIso8601String().substring(0, 10)}',
    carrier: carrier,
    number: number,
    origin: FlightEndpoint(iata: from, city: from, timeZone: 'Asia/Taipei'),
    destination: FlightEndpoint(iata: to, city: to, timeZone: 'Asia/Tokyo'),
    gateOut: FlightTime(scheduled: DateTime.utc(date.year, date.month, date.day, 1)),
    gateIn: FlightTime(scheduled: DateTime.utc(date.year, date.month, date.day, 4)),
  );

  @override
  Future<Flight?> lookup(String carrier, String number, DateTime date) async {
    lookups.add('$carrier$number@${date.toIso8601String().substring(0, 10)}');
    return switch ('$carrier$number') {
      'BR198' => _flight('BR', '198', date, 'TPE', 'NRT'),
      'BR197' => _flight('BR', '197', date, 'NRT', 'TPE'),
      _ => null,
    };
  }

  @override
  Future<Flight?> refresh(Flight flight) async => flight;
}

const mail = '''
Your booking K7XQ2P
BR 198  20DEC2026  TPE - NRT
BR 197  05JAN2027  NRT - TPE
JL 999  06JAN2027  NRT - HND
''';

void main() {
  DateTime clock() => DateTime.utc(2026, 9, 29);

  Future<void> openImport(WidgetTester tester, StubSource source, {Map<String, Object> prefs = const {}}) async {
    await pumpApp(tester, source: source, clock: clock, prefs: prefs);
    await tester.tap(find.byTooltip('新增航班'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('或貼上訂位確認信'));
    await tester.pumpAndSettle();
  }

  testWidgets('paste an e-mail → flights are found and looked up → add the ones that exist', (tester) async {
    final source = StubSource();
    await openImport(tester, source);
    await tester.enterText(find.byType(TextField), mail);
    await tester.tap(find.text('找出航班'));
    await tester.pumpAndSettle();

    expect(source.lookups, ['BR198@2026-12-20', 'BR197@2027-01-05', 'JL999@2027-01-06']);
    expect(find.text('BR198'), findsWidgets);
    expect(find.text('JL999'), findsOneWidget);
    expect(find.text('找不到這個航班'), findsOneWidget, reason: 'JL999 is unknown to the stub source');
    expect(find.text('加入 2 個航班'), findsOneWidget, reason: 'only the two found flights are selected');

    await tester.tap(find.text('加入 2 個航班'));
    await tester.pumpAndSettle();
    final saved = jsonDecode((await SharedPreferences.getInstance()).getString('aether.flights.v1')!) as List;
    expect(saved.map((f) => (f as Map)['id']), unorderedEquals(['BR198-2026-12-20', 'BR197-2027-01-05']));
  });

  testWidgets('untick a flight → it is not added; already-tracked flights are marked and not re-added', (tester) async {
    final source = StubSource();
    final tracked = await source.lookup('BR', '198', DateTime.utc(2026, 12, 20));
    await openImport(
      tester,
      source,
      prefs: {
        'aether.flights.v1': jsonEncode([tracked!.toJson()]),
      },
    );
    await tester.enterText(find.byType(TextField), mail);
    await tester.tap(find.text('找出航班'));
    await tester.pumpAndSettle();

    expect(find.text('已在追蹤'), findsOneWidget);
    expect(find.text('加入 1 個航班'), findsOneWidget);
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, '加入 0 個航班')).onPressed, isNull);
  });

  testWidgets('text without any flight number says so', (tester) async {
    await openImport(tester, StubSource());
    await tester.enterText(find.byType(TextField), 'Thanks for booking with us, see you soon!');
    await tester.tap(find.text('找出航班'));
    await tester.pumpAndSettle();
    expect(find.textContaining('沒有找到航班號碼'), findsOneWidget);
  });

  testWidgets('a flight found without a date offers a date picker and looks up once chosen', (tester) async {
    final source = StubSource();
    await openImport(tester, source);
    await tester.enterText(find.byType(TextField), 'Please check in for BR198 online');
    await tester.tap(find.text('找出航班'));
    await tester.pumpAndSettle();
    expect(source.lookups, isEmpty, reason: 'no date → nothing to look up yet');

    await tester.tap(find.text('選擇日期'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('確定'));
    await tester.pumpAndSettle();
    expect(source.lookups.single, startsWith('BR198@2026-09-29'));
    expect(find.text('加入 1 個航班'), findsOneWidget);
  });

  testWidgets('the empty state offers the paste import right away', (tester) async {
    await pumpApp(tester, source: StubSource(), clock: clock);
    await tester.tap(find.text('貼上訂位確認信'));
    await tester.pumpAndSettle();
    expect(find.text('找出航班'), findsOneWidget);
  });
}
