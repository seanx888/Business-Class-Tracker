import 'package:flutter/material.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../domain/documents.dart';
import 'documents_section.dart';

/// Top-of-list warning about passports / visas that will not cover a booked trip (or are running out).
class DocumentAlert extends StatelessWidget {
  const DocumentAlert({super.key, required this.issues, this.onTap, this.maxLines = 3});
  final List<DocIssue> issues;
  final VoidCallback? onTap;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    if (issues.isEmpty) return const SizedBox.shrink();
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final worst = issues.first.isError ? AetherColors.bad : AetherColors.delayed;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: worst.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(issues.first.isError ? Icons.error_outline : Icons.warning_amber_rounded, size: 20, color: worst),
                    const SizedBox(width: 8),
                    Text(s.docsTitle, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  ],
                ),
                const SizedBox(height: 4),
                for (final i in issues.take(maxLines))
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(s.docIssueText(i, countryLabel), style: t.bodySmall),
                  ),
                if (issues.length > maxLines) Text('+${issues.length - maxLines}', style: t.bodySmall),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
