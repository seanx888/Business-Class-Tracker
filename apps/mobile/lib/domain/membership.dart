// Member wallet — same programs and JSON shape as the PWA (web/core/programs.js), so a
// backup exported from the PWA can be imported here. Stored on-device; cloud sync (Pro)
// will encrypt numbers client-side before they leave the phone.

import 'airlines.dart';
import 'programs.g.dart';

export 'airlines.dart' show Alliance;

class Program {
  const Program(this.key, this.carrier, this.name, this.zh, this.ko, [this.tiers = const []]);

  final String key;
  final String carrier;
  final String name;
  final String zh;
  final String ko;
  final List<String> tiers;

  Alliance get alliance => allianceOfCarrier(carrier);

  /// Name in the app language (zh · en · ko).
  String label(String lang) => lang == 'zh' ? zh : (lang == 'ko' ? ko : name);
}

/// Every program of the PWA wallet (generated from web/core/programs.js), so a backup exported there imports in full.
final programs = <Program>[
  for (final e in programTable.entries) Program(e.key, e.value.carrier, e.value.en, e.value.zh, e.value.ko, e.value.tiers),
];

const otherProgram = 'OTHER';

Program? programFor(String key) {
  for (final p in programs) {
    if (p.key == key) return p;
  }
  return null;
}

class Membership {
  const Membership({required this.id, required this.program, required this.number, this.programName, this.owner, this.tier, this.expiry, this.miles});

  final String id;
  final String program; // key in [programs] or [otherProgram]
  final String number;
  final String? programName; // for OTHER
  final String? owner;
  final String? tier;
  final String? expiry; // yyyy-mm-dd
  final int? miles;

  String displayName({bool chinese = false, String? lang}) {
    final p = programFor(program);
    if (p == null) return programName ?? program;
    return p.label(lang ?? (chinese ? 'zh' : 'en'));
  }

  /// "•••• 1234" — numbers stay hidden until the user taps to reveal.
  String get masked {
    final s = number.replaceAll(RegExp(r'\s+'), '');
    return s.length <= 4 ? s : '•••• ${s.substring(s.length - 4)}';
  }

  /// Days until the status expires (negative = already expired), null when unknown.
  int? daysToExpiry(DateTime today) {
    final e = expiry == null ? null : DateTime.tryParse(expiry!);
    if (e == null) return null;
    final t = DateTime.utc(today.year, today.month, today.day);
    return DateTime.utc(e.year, e.month, e.day).difference(t).inDays;
  }

  static Membership? fromJson(Map<String, dynamic> j) {
    final program = j['program'];
    final number = j['number'];
    if (program is! String || number is! String || number.trim().isEmpty) return null;
    if (programFor(program) == null && program != otherProgram) return null;
    return Membership(
      id: j['id'] as String? ?? 'm${number.hashCode.toUnsigned(32).toRadixString(36)}',
      program: program,
      number: number.trim(),
      programName: j['programName'] as String?,
      owner: j['owner'] as String?,
      tier: j['tier'] as String?,
      expiry: j['expiry'] as String?,
      miles: (j['miles'] as num?)?.round(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'program': program,
        'number': number,
        if (programName != null) 'programName': programName,
        if (owner != null) 'owner': owner,
        if (tier != null) 'tier': tier,
        if (expiry != null) 'expiry': expiry,
        if (miles != null) 'miles': miles,
      };
}
