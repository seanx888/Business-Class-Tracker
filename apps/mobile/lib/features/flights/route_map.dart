import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../data/stores.dart';
import '../../domain/flight.dart';
import '../../domain/geo.dart';
import '../../domain/route_map.dart';

/// The route on a world outline: great-circle arc, the part already flown, both airports and the aircraft.
class RouteMap extends ConsumerWidget {
  const RouteMap({super.key, required this.flight, required this.now});
  final Flight flight;
  final DateTime now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final geo = ref.watch(airportGeoProvider).asData?.value;
    final a = geo?[flight.origin.iata];
    final b = geo?[flight.destination.iata];
    if (a == null || b == null) return const SizedBox.shrink();
    final land = ref.watch(worldLandProvider).asData?.value ?? const <List<double>>[];
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: '${flight.origin.iata} → ${flight.destination.iata}',
      image: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: AspectRatio(
          aspectRatio: 2,
          child: CustomPaint(
            painter: RouteMapPainter(
              from: a,
              to: b,
              fromCode: flight.origin.iata,
              toCode: flight.destination.iata,
              land: land,
              progress: flight.progress(now),
              sea: scheme.surfaceContainerHighest,
              landColor: scheme.onSurface.withValues(alpha: 0.14),
              routeColor: AetherColors.phase(flight.phase),
              trackColor: scheme.outline,
              labelColor: scheme.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class RouteMapPainter extends CustomPainter {
  RouteMapPainter({
    required this.from,
    required this.to,
    required this.fromCode,
    required this.toCode,
    required this.land,
    required this.progress,
    required this.sea,
    required this.landColor,
    required this.routeColor,
    required this.trackColor,
    required this.labelColor,
  });

  final AirportGeo from;
  final AirportGeo to;
  final String fromCode;
  final String toCode;
  final List<List<double>> land;
  final double progress;
  final Color sea;
  final Color landColor;
  final Color routeColor;
  final Color trackColor;
  final Color labelColor;

  @override
  void paint(Canvas canvas, Size size) {
    final g = routeGeometry(from, to, aspect: size.width / size.height);
    final w = g.window;
    Offset pt(LonLat p) {
      final q = project(w, p, size.width, size.height);
      return Offset(q.x, q.y);
    }

    canvas.drawRect(Offset.zero & size, Paint()..color = sea);

    // Land: each ring at −360° / 0° / +360° so a window across the date line is filled on both sides.
    final landPaint = Paint()..color = landColor;
    for (final ring in land) {
      var minLon = 1e9, maxLon = -1e9;
      for (var i = 0; i < ring.length; i += 2) {
        minLon = math.min(minLon, ring[i]);
        maxLon = math.max(maxLon, ring[i]);
      }
      for (final shift in const [-360.0, 0.0, 360.0]) {
        if (maxLon + shift < w.lon0 || minLon + shift > w.lon1) continue;
        final path = Path();
        for (var i = 0; i < ring.length; i += 2) {
          final o = pt((lon: ring[i] + shift, lat: ring[i + 1]));
          i == 0 ? path.moveTo(o.dx, o.dy) : path.lineTo(o.dx, o.dy);
        }
        path.close();
        canvas.drawPath(path, landPaint);
      }
    }

    // Route: the whole great circle faint, the flown part strong.
    final all = Path();
    for (var i = 0; i < g.arc.length; i++) {
      final o = pt(g.arc[i]);
      i == 0 ? all.moveTo(o.dx, o.dy) : all.lineTo(o.dx, o.dy);
    }
    canvas.drawPath(
      all,
      Paint()
        ..color = trackColor.withValues(alpha: 0.55)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );
    final p = progress.clamp(0.0, 1.0);
    if (p > 0) {
      final flown = Path();
      final n = (p * (g.arc.length - 1)).floor();
      flown.moveTo(pt(g.arc.first).dx, pt(g.arc.first).dy);
      for (var i = 1; i <= n; i++) {
        final o = pt(g.arc[i]);
        flown.lineTo(o.dx, o.dy);
      }
      final tip = pt(g.at(p));
      flown.lineTo(tip.dx, tip.dy);
      canvas.drawPath(
        flown,
        Paint()
          ..color = routeColor
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..strokeCap = StrokeCap.round,
      );
    }

    // Airports.
    final dot = Paint()..color = routeColor;
    final ring = Paint()..color = sea;
    for (final (code, ll) in [(fromCode, g.arc.first), (toCode, g.arc.last)]) {
      final o = pt(ll);
      canvas.drawCircle(o, 6, ring);
      canvas.drawCircle(o, 4.5, dot);
      _label(canvas, size, code, o);
    }

    // Aircraft, nose along the direction of travel.
    final i = (p * (g.arc.length - 1)).floor().clamp(0, g.arc.length - 2);
    final a = pt(g.arc[i]);
    final b = pt(g.arc[i + 1]);
    final heading = math.atan2(b.dy - a.dy, b.dx - a.dx) + math.pi / 2;
    final at = pt(g.at(p));
    canvas.save();
    canvas.translate(at.dx, at.dy);
    canvas.rotate(heading);
    canvas.drawPath(_plane(11), Paint()..color = sea);
    canvas.drawPath(_plane(9), Paint()..color = routeColor);
    canvas.restore();
  }

  void _label(Canvas canvas, Size size, String text, Offset at) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(color: labelColor, fontSize: 12, fontWeight: FontWeight.w700, fontFeatures: const [FontFeature.tabularFigures()]),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    var dx = at.dx - tp.width / 2;
    var dy = at.dy + 8;
    if (dy + tp.height > size.height) dy = at.dy - 8 - tp.height; // near the bottom edge → above the dot
    dx = dx.clamp(4.0, math.max(4.0, size.width - tp.width - 4));
    tp.paint(canvas, Offset(dx, dy));
  }

  /// A small aircraft silhouette pointing up, [r] pixels from centre to nose.
  static Path _plane(double r) {
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

  @override
  bool shouldRepaint(RouteMapPainter old) =>
      old.from != from ||
      old.to != to ||
      old.progress != progress ||
      old.land != land ||
      old.routeColor != routeColor ||
      old.sea != sea ||
      old.landColor != landColor;
}
