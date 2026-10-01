import 'dart:convert';
import 'dart:typed_data';

import 'package:aethersky/app.dart';
import 'package:aethersky/data/external.dart';
import 'package:aethersky/data/flight_repository.dart';
import 'package:aethersky/data/photo_service.dart';
import 'package:aethersky/data/stores.dart';
import 'package:aethersky/domain/flight.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Records what the app tries to open / share instead of touching platform channels.
class FakeExternalActions implements ExternalActions {
  final opened = <Uri>[];
  final shared = <({String text, String? subject, String? fileName, String? fileText, Uint8List? fileBytes})>[];
  bool canOpen = true;

  @override
  Future<bool> openUrl(Uri url) async {
    opened.add(url);
    return canOpen;
  }

  @override
  Future<void> share({
    required String text,
    String? subject,
    String? fileName,
    String? fileText,
    Uint8List? fileBytes,
    String fileMime = 'text/plain',
  }) async {
    shared.add((text: text, subject: subject, fileName: fileName, fileText: fileText, fileBytes: fileBytes));
  }
}

/// Photos kept in memory: `add` hands out the queued names, `deleted` records what was removed.
class FakePhotoService implements PhotoService {
  FakePhotoService({List<String> next = const [], this.available = true}) : _next = [...next];
  final List<String> _next;
  final stored = <String>{};
  final deleted = <String>[];
  final sources = <PhotoSource>[];

  @override
  final bool available;

  @override
  Future<String?> add(PhotoSource source) async {
    sources.add(source);
    if (_next.isEmpty) return null;
    final name = _next.removeAt(0);
    stored.add(name);
    return name;
  }

  @override
  Future<void> delete(String name) async {
    stored.remove(name);
    deleted.add(name);
  }

  // A 1x1 transparent PNG, so thumbnails decode without touching the disk.
  static final _png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');

  @override
  ImageProvider? imageFor(String name, {int? cacheWidth}) => MemoryImage(_png);
}

/// A source that knows nothing and never changes what is stored — for tests that seed their own flights.
class InertFlightSource implements FlightDataSource {
  @override
  Future<Flight?> lookup(String carrier, String number, DateTime date) async => null;

  @override
  Future<Flight?> refresh(Flight flight) async => flight;
}

Future<void> pumpApp(
  WidgetTester tester, {
  http.Client? client,
  ExternalActions? actions,
  FlightDataSource? source,
  Map<String, Object> prefs = const {},
  DateTime Function()? clock,
  List<Override> overrides = const [],
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
      retry: noAutoRetry,
      overrides: [
        prefsProvider.overrideWithValue(sp),
        flightSourceProvider.overrideWithValue(source ?? DemoFlightDataSource(clock: clock)),
        if (client != null) httpClientProvider.overrideWithValue(client),
        if (actions != null) externalActionsProvider.overrideWithValue(actions),
        if (clock != null) clockProvider.overrideWithValue(clock),
      ...overrides,
      ],
      child: const AetherApp(),
    ),
  );
  await tester.pumpAndSettle();
}
