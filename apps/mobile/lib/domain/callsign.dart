// ADS-B aircraft identify themselves with an ICAO callsign such as "EVA198" or "CAL923"; passengers know the IATA
// flight number ("BR198", "CI923"). This maps the airline part so the radar can name the airline and offer "track this flight".

/// ICAO airline designator (callsign prefix) → IATA code.
const icaoToIata = <String, String>{
  // SkyTeam
  'CAL': 'CI', 'KAL': 'KE', 'HVN': 'VN', 'GIA': 'GA', 'AFR': 'AF', 'KLM': 'KL', 'DAL': 'DL', 'VIR': 'VS', 'SAS': 'SK',
  'SVA': 'SV', 'AMX': 'AM', 'AEA': 'UX', 'ARG': 'AR', 'KQA': 'KQ', 'MEA': 'ME', 'ROT': 'RO', 'MDA': 'AE',
  // Star Alliance
  'EVA': 'BR', 'ANA': 'NH', 'AAR': 'OZ', 'SIA': 'SQ', 'THA': 'TG', 'UAL': 'UA', 'DLH': 'LH', 'SWR': 'LX', 'AUA': 'OS',
  'BEL': 'SN', 'THY': 'TK', 'ACA': 'AC', 'ANZ': 'NZ', 'AIC': 'AI', 'ETH': 'ET', 'MSR': 'MS', 'LOT': 'LO', 'TAP': 'TP',
  'AEE': 'A3', 'CTN': 'OU', 'AVA': 'AV', 'CMP': 'CM', 'SAA': 'SA', 'ITY': 'AZ',
  // oneworld
  'JAL': 'JL', 'QTR': 'QR', 'MAS': 'MH', 'QFA': 'QF', 'BAW': 'BA', 'AAL': 'AA', 'ASA': 'AS', 'FIN': 'AY', 'IBE': 'IB',
  'ALK': 'UL', 'RJA': 'RJ', 'RAM': 'AT', 'FJI': 'FJ', 'OMA': 'WY',
  // not in an alliance
  'SJX': 'JX', 'UIA': 'B7', 'TTW': 'IT', 'UAE': 'EK', 'ETD': 'EY', 'PAL': 'PR', 'VJC': 'VJ', 'BAV': 'QH', 'BKP': 'PG',
  'TWB': 'TW', 'TZP': 'ZG', 'XAX': 'D7', 'SCO': 'TR', 'JST': 'JQ', 'VOZ': 'VA', 'RBA': 'BI', 'GFA': 'GF', 'FDB': 'FZ',
  'KZR': 'KC', 'UZB': 'HY', 'IGO': '6E', 'ELY': 'LY', 'WJA': 'WS', 'JBU': 'B6', 'HAL': 'HA', 'JJA': '7C', 'APZ': 'YP',
  // mainland China / Hong Kong / Macau carriers that cross the sky over Taiwan (recognised, though the fare scanner excludes them)
  'CCA': 'CA', 'CES': 'MU', 'CSN': 'CZ', 'CHH': 'HU', 'CXA': 'MF', 'CSC': '3U', 'CSZ': 'ZH', 'CDG': 'SC', 'CSH': 'FM',
  'DKH': 'HO', 'CQH': '9C', 'CPA': 'CX', 'HKE': 'UO', 'CRK': 'HX', 'AMU': 'NX', 'CKK': 'CK',
  // freight
  'FDX': 'FX', 'UPS': '5X', 'GTI': '5Y', 'CKS': 'K4',
};

/// A callsign taken apart: the airline (ICAO, and IATA when known) and the flight number, when it looks like a scheduled flight.
class ParsedCallsign {
  const ParsedCallsign({required this.raw, this.icao, this.iata, this.number});

  final String raw;
  final String? icao;
  final String? iata;

  /// Digits after the airline code ("198" for "EVA198"). Null for callsigns like "B18663" or "N123AB".
  final String? number;

  /// The IATA flight number ("BR198") — only when both parts are known.
  String? get iataFlight => iata != null && number != null ? '$iata$number' : null;
}

/// "EVA198  " → (EVA, BR, 198). Registrations used as callsigns, military and unknown airlines keep only [raw].
ParsedCallsign parseCallsign(String? callsign) {
  final raw = (callsign ?? '').trim().toUpperCase();
  final m = RegExp(r'^([A-Z]{3})(\d{1,4})([A-Z]?)$').firstMatch(raw);
  if (m == null) return ParsedCallsign(raw: raw);
  final icao = m.group(1)!;
  final iata = icaoToIata[icao];
  // A trailing letter ("EVA198A") is a company suffix, not part of the public flight number: keep the digits only.
  return ParsedCallsign(raw: raw, icao: icao, iata: iata, number: m.group(2)!.replaceFirst(RegExp(r'^0+(?=\d)'), ''));
}
