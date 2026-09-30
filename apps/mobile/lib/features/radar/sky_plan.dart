import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../domain/nearby.dart';
import '../common/plane_shape.dart';

/// Where an aircraft is drawn inside a square of side [side], centred on the search point, north up.
Offset skyPosition(NearbyAircraft a, double radiusKm, double side) {
  final r = (side / 2 - 28) * (a.distanceKm / radiusKm).clamp(0.0, 1.0);
  final b = a.bearingDeg * math.pi / 180;
  return Offset(side / 2 + r * math.sin(b), side / 2 - r * math.cos(b));
}

/// The aircraft under a tap (within [slop] px), nearest first; null when the tap missed.
NearbyAircraft? aircraftAt(Offset tap, List<NearbyAircraft> list, double radiusKm, double side, {double slop = 28}) {
  NearbyAircraft? best;
  var bestD = slop;
  for (final a in list) {
    final d = (skyPosition(a, radiusKm, side) - tap).distance;
    if (d <= bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

/// Plan view: three range rings, N/E/S/W, the search centre, and every aircraft as a plane pointing along its track.
class SkyPlanPainter extends CustomPainter {
  SkyPlanPainter({
    required this.aircraft,
    required this.radiusKm,
    required this.selectedHex,
    required this.centerIsAirport,
    required this.ringColor,
    required this.textColor,
    required this.mutedColor,
    required this.accent,
    required this.alert,
    required this.surface,
  });

  final List<NearbyAircraft> aircraft;
  final int radiusKm;
  final String? selectedHex;
  final bool centerIsAirport;
  final Color ringColor;
  final Color textColor;
  final Color mutedColor;
  final Color accent;
  final Color alert;
  final Color surface;

  static const labelled = 8; // only the nearest few callsigns are written on the map; the rest are in the list

  TextPainter _text(String t, double size, Color c, {FontWeight w = FontWeight.w500}) => TextPainter(
    text: TextSpan(
      text: t,
      style: TextStyle(color: c, fontSize: size, fontWeight: w, fontFeatures: const [FontFeature.tabularFigures()]),
    ),
    textDirection: TextDirection.ltr,
  )..layout();

  @override
  void paint(Canvas canvas, Size size) {
    final side = math.min(size.width, size.height);
    final c = Offset(side / 2, side / 2);
    final radius = side / 2 - 28;

    final ring = Paint()
      ..color = ringColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (var i = 1; i <= 3; i++) {
      canvas.drawCircle(c, radius * i / 3, ring);
      final label = _text('${(radiusKm * i / 3).round()} km', 10, mutedColor);
      label.paint(canvas, Offset(c.dx + 4, c.dy - radius * i / 3 - label.height - 1));
    }
    canvas.drawLine(Offset(c.dx, c.dy - radius), Offset(c.dx, c.dy + radius), ring);
    canvas.drawLine(Offset(c.dx - radius, c.dy), Offset(c.dx + radius, c.dy), ring);
    for (final (t, o) in [
      ('N', Offset(c.dx, c.dy - radius - 14)),
      ('E', Offset(c.dx + radius + 14, c.dy)),
      ('S', Offset(c.dx, c.dy + radius + 14)),
      ('W', Offset(c.dx - radius - 14, c.dy)),
    ]) {
      final tp = _text(t, 12, t == 'N' ? textColor : mutedColor, w: t == 'N' ? FontWeight.w800 : FontWeight.w600);
      tp.paint(canvas, o - Offset(tp.width / 2, tp.height / 2));
    }

    // The centre: a square for an airport, a ring for "you".
    if (centerIsAirport) {
      canvas.drawRect(Rect.fromCenter(center: c, width: 9, height: 9), Paint()..color = textColor);
    } else {
      canvas.drawCircle(c, 6, Paint()..color = surface);
      canvas.drawCircle(c, 4, Paint()..color = accent);
    }

    var drawnLabels = 0;
    for (final a in aircraft) {
      final p = skyPosition(a, radiusKm.toDouble(), side);
      final selected = a.hex == selectedHex;
      final color = a.emergencySquawk ? alert : (a.onGround ? mutedColor : accent);
      if (selected) canvas.drawCircle(p, 15, Paint()..color = color.withValues(alpha: 0.18));
      if (selected) {
        canvas.drawCircle(
          p,
          15,
          Paint()
            ..color = color
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.5,
        );
      }
      if (a.onGround || a.trackDeg == null) {
        canvas.drawCircle(p, 4, Paint()..color = color);
      } else {
        canvas.save();
        canvas.translate(p.dx, p.dy);
        canvas.rotate(a.trackDeg! * math.pi / 180);
        canvas.drawPath(planePath(9.5), Paint()..color = surface);
        canvas.drawPath(planePath(8), Paint()..color = color);
        canvas.restore();
      }
      if ((drawnLabels < labelled && !a.onGround) || selected) {
        drawnLabels++;
        final tp = _text(a.label, 10, textColor, w: selected ? FontWeight.w800 : FontWeight.w600);
        var x = p.dx + 11;
        if (x + tp.width > size.width - 2) x = p.dx - 11 - tp.width;
        tp.paint(canvas, Offset(x, p.dy - tp.height / 2));
      }
    }
  }

  @override
  bool shouldRepaint(SkyPlanPainter old) =>
      old.aircraft != aircraft ||
      old.radiusKm != radiusKm ||
      old.selectedHex != selectedHex ||
      old.centerIsAirport != centerIsAirport ||
      old.accent != accent ||
      old.ringColor != ringColor;
}

/// The sky view as a widget: square, tappable, with the same aircraft the list shows.
class SkyPlan extends StatelessWidget {
  const SkyPlan({
    super.key,
    required this.aircraft,
    required this.radiusKm,
    required this.centerIsAirport,
    required this.semanticsLabel,
    this.selectedHex,
    this.onSelect,
  });

  final List<NearbyAircraft> aircraft;
  final int radiusKm;
  final bool centerIsAirport;
  final String semanticsLabel;
  final String? selectedHex;
  final ValueChanged<NearbyAircraft>? onSelect;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: semanticsLabel,
      image: true,
      child: AspectRatio(
        aspectRatio: 1,
        child: LayoutBuilder(
          builder: (context, c) {
            final side = math.min(c.maxWidth, c.maxHeight);
            return GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapUp: (d) {
                final hit = aircraftAt(d.localPosition, aircraft, radiusKm.toDouble(), side);
                if (hit != null) onSelect?.call(hit);
              },
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: scheme.outlineVariant),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: CustomPaint(
                    size: Size(side, side),
                    painter: SkyPlanPainter(
                      aircraft: aircraft,
                      radiusKm: radiusKm,
                      selectedHex: selectedHex,
                      centerIsAirport: centerIsAirport,
                      ringColor: scheme.outlineVariant,
                      textColor: scheme.onSurface,
                      mutedColor: scheme.onSurfaceVariant,
                      accent: AetherColors.air,
                      alert: AetherColors.bad,
                      surface: scheme.surfaceContainerLow,
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
