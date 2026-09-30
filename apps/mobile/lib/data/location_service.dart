import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

enum LocationFailure {
  /// The user said no this time (asking again is fine).
  denied,

  /// The user said "don't ask again": only the system settings can change it.
  deniedForever,

  /// Location is switched off on the phone.
  serviceOff,

  /// No fix could be obtained (indoors, timeout, unsupported platform).
  unavailable,
}

class LocationOutcome {
  const LocationOutcome.fix(double this.lat, double this.lon) : failure = null;
  const LocationOutcome.failed(LocationFailure this.failure) : lat = null, lon = null;

  final double? lat;
  final double? lon;
  final LocationFailure? failure;

  bool get hasFix => lat != null && lon != null;
}

/// Where the phone is. The single seam to the platform, so the radar can be tested without a GPS.
abstract class LocationService {
  Future<LocationOutcome> current();

  /// Opens the system page where the user can fix a failure ([LocationFailure.deniedForever] or [LocationFailure.serviceOff]).
  Future<void> openSettings(LocationFailure failure);
}

class GeolocatorLocationService implements LocationService {
  const GeolocatorLocationService();

  @override
  Future<LocationOutcome> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return const LocationOutcome.failed(LocationFailure.serviceOff);
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.deniedForever) return const LocationOutcome.failed(LocationFailure.deniedForever);
      if (permission == LocationPermission.denied || permission == LocationPermission.unableToDetermine) {
        return const LocationOutcome.failed(LocationFailure.denied);
      }
      try {
        // City-block accuracy is plenty for "what is flying near me" and is quick and light on battery.
        final p = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.low, timeLimit: Duration(seconds: 15)),
        );
        return LocationOutcome.fix(p.latitude, p.longitude);
      } on TimeoutException {
        final last = await Geolocator.getLastKnownPosition();
        return last == null
            ? const LocationOutcome.failed(LocationFailure.unavailable)
            : LocationOutcome.fix(last.latitude, last.longitude);
      }
    } catch (_) {
      return const LocationOutcome.failed(LocationFailure.unavailable);
    }
  }

  @override
  Future<void> openSettings(LocationFailure failure) async {
    try {
      if (failure == LocationFailure.serviceOff) {
        await Geolocator.openLocationSettings();
      } else {
        await Geolocator.openAppSettings();
      }
    } catch (_) {
      // nothing more to do; the user can open settings by hand
    }
  }
}

final locationServiceProvider = Provider<LocationService>((ref) => const GeolocatorLocationService());
