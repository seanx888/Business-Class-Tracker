import 'package:intl/intl.dart';

import '../../core/strings.dart';
import '../../domain/nearby.dart';

const _nbsp = ' ';

/// "12,000 ft", "On ground", "—". A non-breaking space keeps number and unit together.
String altitudeText(S s, NearbyAircraft a) {
  if (a.onGround) return s.radarOnGround;
  final ft = a.altitudeFt;
  return ft == null ? '—' : '${NumberFormat.decimalPattern('en_US').format(ft)}${_nbsp}ft';
}

String speedText(NearbyAircraft a) => a.groundSpeedKt == null ? '—' : '${a.groundSpeedKt!.round()}${_nbsp}kt';

String headingText(NearbyAircraft a) => a.trackDeg == null ? '—' : '${a.trackDeg!.round()}°';

/// "+1,800 ft/min" / "−900 ft/min" (real minus sign), "—" when unknown.
String verticalRateText(NearbyAircraft a) {
  final v = a.verticalRateFpm;
  if (v == null) return '—';
  final n = NumberFormat.decimalPattern('en_US').format(v.abs());
  return '${v < 0 ? '−' : '+'}$n${_nbsp}ft/min';
}

/// "12 km SW" (one decimal below 10 km).
String distanceText(NearbyAircraft a) {
  final km = a.distanceKm;
  final n = km < 10 ? km.toStringAsFixed(1) : km.round().toString();
  return '$n${_nbsp}km$_nbsp${compassPoint(a.bearingDeg)}';
}

/// "12:04:33" in the phone's local time.
String clockText(DateTime t) => DateFormat.Hms().format(t.toLocal());
