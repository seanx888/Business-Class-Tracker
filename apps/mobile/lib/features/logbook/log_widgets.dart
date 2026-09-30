import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/photo_service.dart';

/// Five stars. Read-only when [onChanged] is null. Tapping the current value clears it (null).
class StarRating extends StatelessWidget {
  const StarRating({super.key, required this.label, required this.value, this.onChanged});

  /// The aspect being rated ("Seat"), used to label every star for screen readers.
  final String label;
  final int? value;
  final ValueChanged<int?>? onChanged;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Semantics(
      container: true,
      label: '$label, ${value == null ? s.ratingUnrated : s.ratingStar(label, value!)}',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 1; i <= 5; i++)
            IconButton(
              tooltip: s.ratingStar(label, i),
              isSelected: (value ?? 0) >= i,
              icon: const Icon(Icons.star_border),
              selectedIcon: const Icon(Icons.star, color: AetherColors.air),
              onPressed: onChanged == null ? null : () => onChanged!(value == i ? null : i),
            ),
        ],
      ),
    );
  }
}

/// "Seat 4": a compact read-only rating, star icon plus number (never colour alone).
class RatingBadge extends StatelessWidget {
  const RatingBadge({super.key, required this.label, required this.value, this.showLabel = true});
  final String label;
  final num value;
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final text = value == value.roundToDouble() ? '${value.round()}' : value.toStringAsFixed(1);
    return Semantics(
      label: '$label $text / 5',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.star, size: 14, color: AetherColors.air),
          const SizedBox(width: 2),
          Text(showLabel ? '$label $text' : text, style: t.bodySmall?.merge(tabular).copyWith(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

/// A stored photo as a rounded square; tap opens it full size.
class PhotoThumb extends ConsumerWidget {
  const PhotoThumb({super.key, required this.name, this.size = 88, this.onRemove});
  final String name;
  final double size;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final scheme = Theme.of(context).colorScheme;
    final service = ref.watch(photoServiceProvider);
    final thumb = service.imageFor(name, cacheWidth: (size * MediaQuery.devicePixelRatioOf(context)).round());
    final full = service.imageFor(name);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        children: [
          Positioned.fill(
            child: Semantics(
              button: thumb != null,
              label: s.logViewPhoto,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: thumb == null
                    ? ColoredBox(
                        color: scheme.surfaceContainerHighest,
                        child: Icon(Icons.broken_image_outlined, color: scheme.onSurfaceVariant),
                      )
                    : InkWell(
                        onTap: full == null ? null : () => showPhotoViewer(context, full),
                        child: Image(
                          image: thumb,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => ColoredBox(color: scheme.surfaceContainerHighest),
                        ),
                      ),
              ),
            ),
          ),
          if (onRemove != null)
            Positioned(
              top: 0,
              right: 0,
              child: IconButton.filledTonal(
                tooltip: s.logRemovePhoto,
                iconSize: 16,
                visualDensity: VisualDensity.compact,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                icon: const Icon(Icons.close),
                onPressed: onRemove,
              ),
            ),
        ],
      ),
    );
  }
}

Future<void> showPhotoViewer(BuildContext context, ImageProvider image) {
  final s = S.of(context);
  return showDialog<void>(
    context: context,
    builder: (ctx) => Dialog(
      insetPadding: const EdgeInsets.all(12),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          InteractiveViewer(
            child: Image(image: image, fit: BoxFit.contain),
          ),
          Positioned(
            top: 4,
            right: 4,
            child: IconButton.filledTonal(tooltip: s.close, icon: const Icon(Icons.close), onPressed: () => Navigator.of(ctx).pop()),
          ),
        ],
      ),
    ),
  );
}
