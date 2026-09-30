import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/aircraft_source.dart';
import '../../data/location_service.dart';
import '../../domain/nearby.dart';

/// What to ask the ADS-B feed: a centre and a radius.
typedef RadarQuery = ({double lat, double lon, int radiusKm});

/// The phone's position. Auto-disposed so every visit to the tab asks afresh (permissions can change in system settings).
final myLocationProvider = FutureProvider.autoDispose<LocationOutcome>((ref) => ref.watch(locationServiceProvider).current());

/// Aircraft within the radius, nearest first. Invalidate to refresh; the previous list stays on screen meanwhile.
final nearbyProvider = FutureProvider.autoDispose.family<List<NearbyAircraft>, RadarQuery>((ref, q) {
  return ref.watch(aircraftSourceProvider).around(q.lat, q.lon, q.radiusKm.toDouble());
});
