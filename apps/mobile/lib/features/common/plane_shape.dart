import 'package:flutter/painting.dart';

/// A small aircraft silhouette pointing up (north), [r] pixels from the centre to the nose. Shared by the route map and the radar.
Path planePath(double r) {
  const right = [(0.0, -1.0), (0.14, -0.35), (0.95, 0.2), (0.95, 0.38), (0.14, 0.12), (0.1, 0.7), (0.42, 0.9), (0.42, 1.02), (0.0, 0.9)];
  final path = Path()..moveTo(0, -r);
  for (final (x, y) in right.skip(1)) {
    path.lineTo(x * r, y * r);
  }
  for (final (x, y) in right.skip(1).toList().reversed) {
    path.lineTo(-x * r, y * r);
  }
  return path..close();
}
