// Airline reference data. The table itself is generated from web/core/airlines.js
// (node scripts/gen-dart-airlines.mjs), so the PWA, the scanner and this app never disagree.
import 'airlines.g.dart';
import 'membership.dart' show Alliance;

class Airline {
  const Airline({required this.code, required this.en, required this.zh, required this.alliance, required this.country, required this.url});

  final String code;
  final String en;
  final String zh;
  final Alliance alliance;
  final String country;
  final String url;

  String name({bool chinese = false}) => chinese ? zh : en;
}

Alliance _alliance(String key) => switch (key) {
  'SKYTEAM' => Alliance.skyteam,
  'STAR' => Alliance.star,
  'ONEWORLD' => Alliance.oneworld,
  _ => Alliance.none,
};

Airline? airlineFor(String code) {
  final a = airlineTable[code.toUpperCase()];
  if (a == null) return null;
  return Airline(code: code.toUpperCase(), en: a.en, zh: a.zh, alliance: _alliance(a.alliance), country: a.country, url: a.url);
}

/// Alliance of a marketing carrier; [Alliance.none] for unknown / non-alliance carriers.
Alliance allianceOfCarrier(String code) => airlineFor(code)?.alliance ?? Alliance.none;

/// True for any airline code we know about — including the China/HK/Macau carriers the fare
/// scanner excludes (a flight you actually booked is still yours to track).
bool isKnownAirlineCode(String code) {
  final c = code.toUpperCase();
  return airlineTable.containsKey(c) || blockedCarrierNames.containsKey(c);
}

bool isLccCarrier(String code) => lccCarriers.contains(code.toUpperCase());

/// "EVA Air" / "長榮航空"; falls back to the bare code for unknown carriers.
String airlineDisplayName(String code, {bool chinese = false}) {
  final a = airlineFor(code);
  if (a != null) return a.name(chinese: chinese);
  return blockedCarrierNames[code.toUpperCase()] ?? code.toUpperCase();
}

String? airlineWebsite(String code) {
  final u = airlineTable[code.toUpperCase()]?.url;
  return u == null || u.isEmpty ? null : u;
}
