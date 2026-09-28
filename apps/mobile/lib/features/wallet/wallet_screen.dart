import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/stores.dart';
import '../../domain/membership.dart';

class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  final _revealed = <String>{};

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final t = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final list = ref.watch(walletProvider);
    final today = DateTime.now();
    return Scaffold(
      appBar: AppBar(title: Text(s.wallet)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _edit(context),
        icon: const Icon(Icons.add_card),
        label: Text(s.addMembership),
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 96), children: [
        Text(s.walletHint, style: t.bodySmall?.copyWith(color: muted)),
        const SizedBox(height: 12),
        if (list.isEmpty) Padding(padding: const EdgeInsets.all(24), child: Center(child: Text(s.noMemberships))),
        for (final m in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Card(
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () => setState(() => _revealed.contains(m.id) ? _revealed.remove(m.id) : _revealed.add(m.id)),
                onLongPress: () async {
                  await Clipboard.setData(ClipboardData(text: m.number.replaceAll(RegExp(r'\s+'), '')));
                  if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.copied)));
                },
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text(m.displayName(chinese: s.lang == 'zh'), style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
                      if (m.tier != null) Chip(label: Text(m.tier!), visualDensity: VisualDensity.compact),
                      IconButton(icon: const Icon(Icons.delete_outline), tooltip: s.cancel, onPressed: () => ref.read(walletProvider.notifier).remove(m.id)),
                    ]),
                    Text(
                      _revealed.contains(m.id) ? m.number : m.masked,
                      style: t.headlineSmall?.merge(tabular).copyWith(fontFamily: 'monospace', letterSpacing: 1.5, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if (m.owner != null) m.owner!,
                        if (m.daysToExpiry(today) case final d? when d <= 90) s.expiresIn(d),
                      ].join(' · '),
                      style: t.bodySmall?.copyWith(color: (m.daysToExpiry(today) ?? 999) <= 90 ? AetherColors.bad : muted),
                    ),
                  ]),
                ),
              ),
            ),
          ),
      ]),
    );
  }

  Future<void> _edit(BuildContext context) async {
    final s = S.of(context);
    final number = TextEditingController();
    final owner = TextEditingController();
    final tier = TextEditingController();
    String program = programs.first.key;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text(s.addMembership),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              DropdownButtonFormField<String>(
                initialValue: program,
                isExpanded: true,
                decoration: InputDecoration(labelText: s.program),
                items: [for (final p in programs) DropdownMenuItem(value: p.key, child: Text(s.lang == 'zh' ? p.zh : p.name, overflow: TextOverflow.ellipsis))],
                onChanged: (v) => setLocal(() => program = v ?? program),
              ),
              TextField(controller: number, decoration: InputDecoration(labelText: s.memberNumber), textCapitalization: TextCapitalization.characters),
              TextField(controller: owner, decoration: InputDecoration(labelText: s.owner)),
              Autocomplete<String>(
                optionsBuilder: (v) => (programFor(program)?.tiers ?? const <String>[]).where((x) => x.toLowerCase().contains(v.text.toLowerCase())),
                onSelected: (v) => tier.text = v,
                fieldViewBuilder: (context, c, focus, submit) => TextField(
                  controller: c,
                  focusNode: focus,
                  decoration: InputDecoration(labelText: s.tier),
                  onChanged: (v) => tier.text = v,
                ),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(s.cancel)),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(s.save)),
          ],
        ),
      ),
    );
    final m = ok == true
        ? Membership.fromJson({
            'id': 'm${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}',
            'program': program,
            'number': number.text,
            if (owner.text.trim().isNotEmpty) 'owner': owner.text.trim(),
            if (tier.text.trim().isNotEmpty) 'tier': tier.text.trim(),
          })
        : null;
    if (m != null) ref.read(walletProvider.notifier).upsert(m);
    number.dispose();
    owner.dispose();
    tier.dispose();
  }
}
