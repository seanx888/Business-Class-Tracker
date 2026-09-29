// "Can I get into the lounge?" — the alliance rules every premium traveller keeps in their head:
//   • Business / First on a carrier → that carrier's own lounge, and (when it is an alliance member) the alliance's lounges.
//   • Top alliance status (Star Alliance Gold · SkyTeam Elite Plus · oneworld Sapphire / Emerald) on a flight of a
//     member airline → the alliance's lounges in ANY cabin, usually with one guest.
// These are general alliance policies; individual lounges add their own limits (domestic-only itineraries, capacity,
// time windows) — the UI always says so. The tier table is data, reviewed 2026-09; add rows as programs change.
import 'airlines.dart';
import 'membership.dart';
import 'trip.dart';

/// How far up the alliance ladder a tier sits.
enum StatusLevel {
  /// SkyTeam Elite · Star Silver · oneworld Ruby — priority services, no lounge.
  basic,

  /// SkyTeam Elite Plus · Star Gold · oneworld Sapphire — alliance business-class lounges.
  lounge,

  /// oneworld Emerald — also the first-class lounges (the other two alliances top out at [lounge]).
  top,
}

class AllianceStatus {
  const AllianceStatus(this.alliance, this.level);
  final Alliance alliance;
  final StatusLevel level;

  bool get opensLounges => level != StatusLevel.basic;

  /// "SkyTeam Elite Plus" · "Star Alliance Gold" · "oneworld Sapphire"
  String get label => switch ((alliance, level)) {
    (Alliance.skyteam, StatusLevel.basic) => 'SkyTeam Elite',
    (Alliance.skyteam, _) => 'SkyTeam Elite Plus',
    (Alliance.star, StatusLevel.basic) => 'Star Alliance Silver',
    (Alliance.star, _) => 'Star Alliance Gold',
    (Alliance.oneworld, StatusLevel.basic) => 'oneworld Ruby',
    (Alliance.oneworld, StatusLevel.lounge) => 'oneworld Sapphire',
    (Alliance.oneworld, StatusLevel.top) => 'oneworld Emerald',
    (Alliance.none, _) => '—',
  };
}

/// program key → lower-case tier phrase → level. Every phrase found in the tier text counts and the highest level
/// wins ("Platinum Pro" → oneworld Emerald, "Gold Member" → Gold, not the base "member" tier).
/// Programs missing here (or tiers not listed) are reported as "tier unknown" instead of guessed.
const _tierTable = <String, Map<String, StatusLevel>>{
  // SkyTeam
  'CI': {'dynasty flyer': StatusLevel.basic, 'gold': StatusLevel.basic, 'emerald': StatusLevel.lounge, 'paragon': StatusLevel.lounge},
  'KE': {'morning calm premium': StatusLevel.lounge, 'million miler': StatusLevel.lounge, 'morning calm': StatusLevel.basic},
  'AFKL': {
    'explorer': StatusLevel.basic,
    'silver': StatusLevel.basic,
    'gold': StatusLevel.lounge,
    'platinum': StatusLevel.lounge,
    'ultimate': StatusLevel.lounge,
  },
  'DL': {'silver': StatusLevel.basic, 'gold': StatusLevel.lounge, 'platinum': StatusLevel.lounge, 'diamond': StatusLevel.lounge},
  // Star Alliance
  'BR': {'green': StatusLevel.basic, 'silver': StatusLevel.basic, 'gold': StatusLevel.lounge, 'diamond': StatusLevel.lounge},
  'NH': {'bronze': StatusLevel.basic, 'platinum': StatusLevel.lounge, 'diamond': StatusLevel.lounge},
  'SQ': {
    'elite silver': StatusLevel.basic,
    'elite gold': StatusLevel.lounge,
    'solitaire pps': StatusLevel.lounge,
    'pps club': StatusLevel.lounge,
  },
  'TG': {'member': StatusLevel.basic, 'silver': StatusLevel.basic, 'gold': StatusLevel.lounge, 'platinum': StatusLevel.lounge},
  'OZ': {
    'silver': StatusLevel.basic,
    'gold': StatusLevel.lounge,
    'diamond plus': StatusLevel.lounge,
    'diamond': StatusLevel.lounge,
    'platinum': StatusLevel.lounge,
  },
  'UA': {
    'premier silver': StatusLevel.basic,
    'premier gold': StatusLevel.lounge,
    'premier platinum': StatusLevel.lounge,
    'premier 1k': StatusLevel.lounge,
  },
  'LH': {
    'member': StatusLevel.basic,
    'frequent traveller': StatusLevel.basic,
    'senator': StatusLevel.lounge,
    'hon circle': StatusLevel.lounge,
  },
  'TK': {'classic': StatusLevel.basic, 'classic plus': StatusLevel.basic, 'elite plus': StatusLevel.lounge, 'elite': StatusLevel.lounge},
  'AC': {
    '25k': StatusLevel.basic,
    '35k': StatusLevel.basic,
    '50k': StatusLevel.lounge,
    '75k': StatusLevel.lounge,
    'super elite': StatusLevel.lounge,
  },
  // oneworld
  'JL': {'crystal': StatusLevel.basic, 'sapphire': StatusLevel.lounge, 'jgc premier': StatusLevel.top, 'diamond': StatusLevel.top},
  'AA': {'gold': StatusLevel.basic, 'platinum pro': StatusLevel.top, 'platinum': StatusLevel.lounge, 'executive platinum': StatusLevel.top},
  'BA': {'blue': StatusLevel.basic, 'bronze': StatusLevel.basic, 'silver': StatusLevel.lounge, 'gold': StatusLevel.top},
  'QF': {'silver': StatusLevel.basic, 'gold': StatusLevel.lounge, 'platinum one': StatusLevel.top, 'platinum': StatusLevel.top},
  'MH': {'blue': StatusLevel.basic, 'silver': StatusLevel.basic, 'gold': StatusLevel.lounge, 'platinum': StatusLevel.top},
};

/// The alliance status a membership carries, or null when its tier is not set or not in the table.
AllianceStatus? allianceStatusOf(Membership m) {
  final table = _tierTable[m.program];
  final text = m.tier?.trim().toLowerCase();
  final program = programFor(m.program);
  if (table == null || program == null || text == null || text.isEmpty) return null;
  StatusLevel? best;
  for (final e in table.entries) {
    final found = RegExp('(^|[^a-z0-9])${RegExp.escape(e.key)}(\$|[^a-z0-9])').hasMatch(text);
    if (found && (best == null || e.value.index > best.index)) best = e.value;
  }
  return best == null ? null : AllianceStatus(program.alliance, best);
}

enum AccessBasis {
  /// Business / First → the operating airline's own lounge.
  ownCabin,

  /// Business / First on an alliance member → the alliance's lounges.
  allianceCabin,

  /// Alliance status earned in any member program → the alliance's lounges, any cabin.
  allianceStatus,
}

class LoungeEntitlement {
  const LoungeEntitlement(this.basis, {this.alliance = Alliance.none, this.membership, this.status, this.guests = 0});

  final AccessBasis basis;
  final Alliance alliance;

  /// The membership that grants it ([AccessBasis.allianceStatus] only).
  final Membership? membership;
  final AllianceStatus? status;

  /// Guests typically allowed with this entitlement (alliance status: one).
  final int guests;
}

/// Why the answer may be incomplete.
enum LoungeHint {
  /// No cabin entered → business / first entitlements cannot be judged.
  needCabin,

  /// A membership of this flight's alliance has no recognised tier.
  needTier,

  /// The airline is in no alliance — only its own premium cabins and program apply.
  noAlliance,

  /// The airline is unknown to us.
  unknownCarrier,
}

class LoungeVerdict {
  const LoungeVerdict({required this.entitlements, required this.hints, required this.alliance, required this.tierUnknownFor});

  final List<LoungeEntitlement> entitlements;
  final Set<LoungeHint> hints;
  final Alliance alliance;

  /// Memberships (of this flight's alliance) whose tier we could not place.
  final List<Membership> tierUnknownFor;

  bool get eligible => entitlements.isNotEmpty;
}

/// What lounge access a flight on [carrier] in [cabin] gives, given the memberships in the wallet.
LoungeVerdict checkLoungeAccess({required String carrier, required Cabin? cabin, required List<Membership> memberships}) {
  final airline = airlineFor(carrier);
  final alliance = airline?.alliance ?? Alliance.none;
  final entitlements = <LoungeEntitlement>[];
  final hints = <LoungeHint>{};
  final unknownTier = <Membership>[];

  if (airline == null) hints.add(LoungeHint.unknownCarrier);
  if (airline != null && alliance == Alliance.none) hints.add(LoungeHint.noAlliance);

  if (cabin == null) {
    hints.add(LoungeHint.needCabin);
  } else if (cabin.isPremium && airline != null) {
    entitlements.add(const LoungeEntitlement(AccessBasis.ownCabin));
    if (alliance != Alliance.none) entitlements.add(LoungeEntitlement(AccessBasis.allianceCabin, alliance: alliance));
  }

  if (alliance != Alliance.none) {
    for (final m in memberships) {
      final program = programFor(m.program);
      if (program == null || program.alliance != alliance) continue;
      final status = allianceStatusOf(m);
      if (status == null) {
        if (_tierTable.containsKey(m.program)) unknownTier.add(m);
        continue;
      }
      if (status.opensLounges) {
        entitlements.add(LoungeEntitlement(AccessBasis.allianceStatus, alliance: alliance, membership: m, status: status, guests: 1));
      }
    }
    if (unknownTier.isNotEmpty) hints.add(LoungeHint.needTier);
  }

  return LoungeVerdict(entitlements: entitlements, hints: hints, alliance: alliance, tierUnknownFor: unknownTier);
}
