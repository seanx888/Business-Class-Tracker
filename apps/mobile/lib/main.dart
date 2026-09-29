import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/format.dart';
import 'data/stores.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  initTimeZones();
  await initializeDateFormatting();
  final prefs = await SharedPreferences.getInstance();
  runApp(ProviderScope(overrides: [prefsProvider.overrideWithValue(prefs)], child: const AetherApp()));
}
