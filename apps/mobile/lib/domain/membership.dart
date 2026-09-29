// Member wallet — same programs and JSON shape as the PWA (web/core/programs.js), so a
// backup exported from the PWA can be imported here. Stored on-device; cloud sync (Pro)
// will encrypt numbers client-side before they leave the phone.

enum Alliance { skyteam, star, oneworld, none }

class Program {
  const Program(this.key, this.carrier, this.name, this.zh, this.alliance, [this.tiers = const []]);

  final String key;
  final String carrier;
  final String name;
  final String zh;
  final Alliance alliance;
  final List<String> tiers;
}

const programs = <Program>[
  Program('CI', 'CI', 'Dynasty Flyer', '華夏會員', Alliance.skyteam, ['Dynasty Flyer', 'Gold', 'Emerald', 'Paragon']),
  Program('KE', 'KE', 'SKYPASS', 'SKYPASS 會員', Alliance.skyteam, ['Morning Calm', 'Morning Calm Premium', 'Million Miler']),
  Program('AFKL', 'AF', 'Flying Blue', 'Flying Blue 藍天飛行', Alliance.skyteam, ['Explorer', 'Silver', 'Gold', 'Platinum', 'Ultimate']),
  Program('DL', 'DL', 'SkyMiles', 'SkyMiles 飛凡里程', Alliance.skyteam),
  Program('VN', 'VN', 'Lotusmiles', '金蓮花里程', Alliance.skyteam),
  Program('BR', 'BR', 'Infinity MileageLands', '無限萬哩遊', Alliance.star, ['Green', 'Silver', 'Gold', 'Diamond']),
  Program('NH', 'NH', 'ANA Mileage Club', 'ANA 哩程俱樂部', Alliance.star, ['Bronze', 'Platinum', 'Diamond']),
  Program('SQ', 'SQ', 'KrisFlyer', 'KrisFlyer 新航會員', Alliance.star, ['KrisFlyer', 'Elite Silver', 'Elite Gold', 'PPS Club', 'Solitaire PPS Club']),
  Program('UA', 'UA', 'MileagePlus', 'MileagePlus 前程萬里', Alliance.star),
  Program('JL', 'JL', 'JAL Mileage Bank', 'JAL 哩程銀行', Alliance.oneworld, ['Crystal', 'Sapphire', 'JGC Premier', 'Diamond']),
  Program('AA', 'AA', 'AAdvantage', 'AAdvantage', Alliance.oneworld),
  Program('QR', 'QR', 'Privilege Club', 'Privilege Club', Alliance.oneworld),
  Program('JX', 'JX', 'COSMILE', '星宇 COSMILE', Alliance.none),
  Program('EK', 'EK', 'Emirates Skywards', '阿聯酋 Skywards', Alliance.none),
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

  String displayName({bool chinese = false}) {
    final p = programFor(program);
    if (p == null) return programName ?? program;
    return chinese ? p.zh : p.name;
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
