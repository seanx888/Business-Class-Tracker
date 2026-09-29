import 'package:aethersky/app.dart';
import 'package:aethersky/data/external.dart';
import 'package:aethersky/data/flight_repository.dart';
import 'package:aethersky/data/stores.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Records what the app tries to open / share instead of touching platform channels.
class FakeExternalActions implements ExternalActions {
  final opened = <Uri>[];
  final shared = <({String text, String? subject, String? fileName, String? fileText})>[];
  bool canOpen = true;

  @override
  Future<bool> openUrl(Uri url) async {
    opened.add(url);
    return canOpen;
  }

  @override
  Future<void> share({required String text, String? subject, String? fileName, String? fileText, String fileMime = 'text/plain'}) async {
    shared.add((text: text, subject: subject, fileName: fileName, fileText: fileText));
  }
}

Future<void> pumpApp(
  WidgetTester tester, {
  http.Client? client,
  ExternalActions? actions,
  FlightDataSource? source,
  Map<String, Object> prefs = const {},
  DateTime Function()? clock,
}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final sp = await SharedPreferences.getInstance();
  await initializeDateFormatting();
  await tester.binding.setSurfaceSize(const Size(420, 900));
  // The app's primary language is Traditional Chinese.
  tester.platformDispatcher.localesTestValue = const [Locale('zh', 'TW')];
  addTearDown(tester.platformDispatcher.clearLocalesTestValue);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        prefsProvider.overrideWithValue(sp),
        flightSourceProvider.overrideWithValue(source ?? DemoFlightDataSource(clock: clock)),
        if (client != null) httpClientProvider.overrideWithValue(client),
        if (actions != null) externalActionsProvider.overrideWithValue(actions),
        if (clock != null) clockProvider.overrideWithValue(clock),
      ],
      child: const AetherApp(),
    ),
  );
  await tester.pumpAndSettle();
}
