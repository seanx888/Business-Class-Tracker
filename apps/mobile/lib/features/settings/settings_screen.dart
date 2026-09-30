import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../data/stores.dart';
import '../../domain/settings.dart';

/// Language and the numbers behind "when do I leave for the airport".
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final settings = ref.watch(settingsProvider);
    final notifier = ref.read(settingsProvider.notifier);
    String languageLabel(String code) => switch (code) {
      'zh' => '繁體中文',
      'en' => 'English',
      'ko' => '한국어',
      _ => s.languageSystem,
    };
    return Scaffold(
      appBar: AppBar(title: Text(s.settings)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
        children: [
          Text(s.languageSetting, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            showSelectedIcon: false,
            segments: [
              for (final code in AppSettings.languages)
                ButtonSegment(
                  value: code,
                  label: Text(languageLabel(code), maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
            ],
            selected: {settings.language},
            onSelectionChanged: (v) => notifier.update((x) => x.copyWith(language: v.first)),
          ),
          const SizedBox(height: 24),
          Text(s.airportTimeSettings, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          _StepperTile(
            label: s.travelToAirport,
            value: settings.travelMinutes,
            min: 15,
            max: 240,
            step: 5,
            onChanged: (v) => notifier.update((x) => x.copyWith(travelMinutes: v)),
          ),
          _StepperTile(
            label: s.bufferInternationalSetting,
            value: settings.bufferInternationalMinutes,
            min: 60,
            max: 300,
            step: 15,
            onChanged: (v) => notifier.update((x) => x.copyWith(bufferInternationalMinutes: v)),
          ),
          _StepperTile(
            label: s.bufferDomesticSetting,
            value: settings.bufferDomesticMinutes,
            min: 30,
            max: 240,
            step: 15,
            onChanged: (v) => notifier.update((x) => x.copyWith(bufferDomesticMinutes: v)),
          ),
        ],
      ),
    );
  }
}

class _StepperTile extends StatelessWidget {
  const _StepperTile({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.step,
    required this.onChanged,
  });
  final String label;
  final int value;
  final int min;
  final int max;
  final int step;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(label),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            tooltip: '−',
            icon: const Icon(Icons.remove_circle_outline),
            onPressed: value - step < min ? null : () => onChanged(value - step),
          ),
          SizedBox(
            width: 72,
            child: Text(
              s.minutes(value),
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          IconButton(
            tooltip: '+',
            icon: const Icon(Icons.add_circle_outline),
            onPressed: value + step > max ? null : () => onChanged(value + step),
          ),
        ],
      ),
    );
  }
}
