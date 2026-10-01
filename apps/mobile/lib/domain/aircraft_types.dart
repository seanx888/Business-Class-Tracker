// ICAO aircraft type designators as broadcast by ADS-B ("B78X") and as reported by flight data → a name people recognise.

const aircraftTypeNames = <String, String>{
  // Airbus narrow-body
  'A318': 'Airbus A318', 'A319': 'Airbus A319', 'A320': 'Airbus A320', 'A321': 'Airbus A321',
  'A19N': 'Airbus A319neo', 'A20N': 'Airbus A320neo', 'A21N': 'Airbus A321neo',
  // Airbus wide-body
  'A306': 'Airbus A300-600', 'A310': 'Airbus A310', 'A332': 'Airbus A330-200', 'A333': 'Airbus A330-300', 'A338': 'Airbus A330-800',
  'A339': 'Airbus A330-900', 'A342': 'Airbus A340-200', 'A343': 'Airbus A340-300', 'A345': 'Airbus A340-500', 'A346': 'Airbus A340-600',
  'A359': 'Airbus A350-900', 'A35K': 'Airbus A350-1000', 'A388': 'Airbus A380-800',
  // Boeing 737
  'B733': 'Boeing 737-300', 'B734': 'Boeing 737-400', 'B735': 'Boeing 737-500', 'B736': 'Boeing 737-600', 'B737': 'Boeing 737-700',
  'B738': 'Boeing 737-800', 'B739': 'Boeing 737-900', 'B37M': 'Boeing 737 MAX 7', 'B38M': 'Boeing 737 MAX 8', 'B39M': 'Boeing 737 MAX 9',
  // Boeing wide-body
  'B742': 'Boeing 747-200', 'B744': 'Boeing 747-400', 'B748': 'Boeing 747-8', 'B752': 'Boeing 757-200', 'B753': 'Boeing 757-300',
  'B762': 'Boeing 767-200', 'B763': 'Boeing 767-300', 'B764': 'Boeing 767-400', 'B772': 'Boeing 777-200', 'B77L': 'Boeing 777-200LR',
  'B773': 'Boeing 777-300', 'B77W': 'Boeing 777-300ER', 'B778': 'Boeing 777-8', 'B779': 'Boeing 777-9',
  'B788': 'Boeing 787-8', 'B789': 'Boeing 787-9', 'B78X': 'Boeing 787-10', 'MD11': 'McDonnell Douglas MD-11',
  // regional
  'E170': 'Embraer E170',
  'E175': 'Embraer E175',
  'E190': 'Embraer E190',
  'E195': 'Embraer E195',
  'E290': 'Embraer E190-E2',
  'E295': 'Embraer E195-E2',
  'AT72': 'ATR 72', 'AT76': 'ATR 72-600', 'DH8D': 'De Havilland Dash 8-400', 'CRJ9': 'Bombardier CRJ900', 'CRJ7': 'Bombardier CRJ700',
  'BCS1': 'Airbus A220-100', 'BCS3': 'Airbus A220-300',
};

/// "B78X" → "Boeing 787-10"; unknown designators are returned as they are (upper-cased), null/blank → null.
String? aircraftTypeName(String? code) {
  final c = code?.trim().toUpperCase();
  if (c == null || c.isEmpty) return null;
  return aircraftTypeNames[c] ?? c;
}

/// Designators to suggest while the traveller types a type into the logbook.
List<String> aircraftTypeSuggestions(String query, {int limit = 6}) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return const [];
  final out = <String>[];
  for (final e in aircraftTypeNames.entries) {
    if (e.key.toLowerCase().startsWith(q) || e.value.toLowerCase().contains(q)) out.add(e.key);
    if (out.length == limit) break;
  }
  return out;
}
