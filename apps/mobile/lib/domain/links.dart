// Deep links into metasearch sites. Port of web/core/links.js — both are tested against the
// same fixture (test/fixtures/links-cases.json at the repo root) so they cannot drift apart.
import 'airlines.dart';

class FareQuery {
  const FareQuery({
    required this.origin,
    required this.destination,
    required this.departDate,
    this.returnDate,
    this.currency = 'TWD',
    this.lang = 'zh-TW',
    this.gl,
    this.cabin = 'business',
  });

  final String origin;
  final String destination;
  final String departDate; // yyyy-mm-dd
  final String? returnDate;
  final String currency;
  final String lang; // zh-TW · en · ko
  final String? gl; // ISO country → open Google Flights as that market
  final String cabin; // economy · premium · business · first
}

const _cabinWords = {'business': 'business class', 'first': 'first class', 'premium': 'premium economy', 'economy': 'economy'};

String _yymmdd(String iso) => iso.substring(2, 4) + iso.substring(5, 7) + iso.substring(8, 10);

String googleFlightsUrl(FareQuery q) {
  final ret = q.returnDate;
  final text =
      'Flights from ${q.origin} to ${q.destination} on ${q.departDate}'
      '${ret != null ? ' through $ret' : ' one way'} ${_cabinWords[q.cabin] ?? _cabinWords['business']}';
  final hl = q.lang.startsWith('zh') ? 'zh-TW' : (q.lang.startsWith('ko') ? 'ko' : 'en');
  // encodeQueryComponent writes spaces as "+", JS encodeURIComponent as "%20" — normalise to the JS form.
  final encoded = Uri.encodeComponent(text);
  return 'https://www.google.com/travel/flights?q=$encoded&curr=${q.currency}&hl=$hl${q.gl != null ? '&gl=${q.gl!.toUpperCase()}' : ''}';
}

String skyscannerUrl(FareQuery q) {
  final host = q.lang.startsWith('zh')
      ? 'www.skyscanner.com.tw'
      : (q.lang.startsWith('ko') ? 'www.skyscanner.co.kr' : 'www.skyscanner.net');
  final ret = q.returnDate;
  final path = '${q.origin.toLowerCase()}/${q.destination.toLowerCase()}/${_yymmdd(q.departDate)}/${ret != null ? '${_yymmdd(ret)}/' : ''}';
  return 'https://$host/transport/flights/$path?adultsv2=1&cabinclass=business&rtn=${ret != null ? 1 : 0}&currency=${q.currency}';
}

String kayakUrl(FareQuery q) {
  final host = q.lang.startsWith('ko') ? 'www.kayak.co.kr' : 'www.kayak.com';
  final ret = q.returnDate;
  return 'https://$host/flights/${q.origin}-${q.destination}/${q.departDate}${ret != null ? '/$ret' : ''}/business?sort=price_a';
}

typedef FareLink = ({String key, String label, String url});

/// Google Flights · Skyscanner · KAYAK, in that order (same as the PWA's deal sheet).
List<FareLink> searchLinks(FareQuery q) => [
  (key: 'google', label: 'Google Flights', url: googleFlightsUrl(q)),
  (key: 'skyscanner', label: 'Skyscanner', url: skyscannerUrl(q)),
  (key: 'kayak', label: 'KAYAK', url: kayakUrl(q)),
];

/// The carrier's own site, when we know it.
String? airlineUrl(String code) => airlineWebsite(code);
