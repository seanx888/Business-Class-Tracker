import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/format.dart';
import 'data/photo_service.dart';
import 'data/stores.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  initTimeZones();
  await initializeDateFormatting();
  final prefs = await SharedPreferences.getInstance();
  // Photos are kept in the app's own folder; the web build has none, so the feature stays hidden there.
  final photos = kIsWeb ? const NoPhotoService() : DevicePhotoService(await getApplicationDocumentsDirectory());
  runApp(
    ProviderScope(
      retry: noAutoRetry,
      overrides: [prefsProvider.overrideWithValue(prefs), photoServiceProvider.overrideWithValue(photos)],
      child: const AetherApp(),
    ),
  );
}
