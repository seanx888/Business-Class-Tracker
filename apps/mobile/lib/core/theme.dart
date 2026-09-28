import 'package:flutter/material.dart';

import '../domain/flight.dart';

/// ÆtherSky palette: night-sky navy + brass gold (from the app icon), calm neutrals,
/// and status colours that never rely on colour alone (every status also has a label).
class AetherColors {
  static const navy = Color(0xFF1A2744);
  static const night = Color(0xFF070B16);
  static const gold = Color(0xFFE3C270);
  static const onTime = Color(0xFF16A34A);
  static const delayed = Color(0xFFD97706);
  static const bad = Color(0xFFDC2626);
  static const air = Color(0xFF2563EB);

  static Color phase(FlightPhase p) => switch (p) {
        FlightPhase.scheduled => onTime,
        FlightPhase.delayed => delayed,
        FlightPhase.departed || FlightPhase.enRoute => air,
        FlightPhase.landed || FlightPhase.arrived => onTime,
        FlightPhase.cancelled || FlightPhase.diverted => bad,
      };
}

ThemeData aetherTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final scheme = ColorScheme.fromSeed(
    seedColor: AetherColors.navy,
    brightness: brightness,
    primary: dark ? const Color(0xFFB9C7F0) : AetherColors.navy,
    secondary: AetherColors.gold,
    surface: dark ? const Color(0xFF0D1424) : const Color(0xFFF8FAFC),
  );
  final base = ThemeData(colorScheme: scheme, useMaterial3: true, brightness: brightness);
  return base.copyWith(
    scaffoldBackgroundColor: dark ? AetherColors.night : const Color(0xFFF8FAFC),
    cardTheme: CardThemeData(
      elevation: 0,
      color: dark ? const Color(0xFF111A2E) : Colors.white,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: dark ? const Color(0xFF223052) : const Color(0xFFE2E8F0)),
      ),
    ),
    appBarTheme: AppBarTheme(
      centerTitle: false,
      backgroundColor: dark ? AetherColors.night : const Color(0xFFF8FAFC),
      surfaceTintColor: Colors.transparent,
      titleTextStyle: base.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: scheme.onSurface),
    ),
    navigationBarTheme: NavigationBarThemeData(
      indicatorColor: dark ? const Color(0xFF223052) : const Color(0xFFE6EBF7),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
    ),
  );
}

/// Prices and times line up in lists.
const tabular = TextStyle(fontFeatures: [FontFeature.tabularFigures()]);
