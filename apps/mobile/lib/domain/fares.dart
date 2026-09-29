// Fare data published every day by the ÆtherSky scanner (same files the PWA reads):
//   trackers.json — Real Tracker results, deals.json — business-class deal feed.

class TrackerResult {
  const TrackerResult({
    required this.id,
    required this.origin,
    required this.destination,
    required this.depart,
    this.returnDate,
    this.flexDays = 0,
    this.cabin = 'business',
    this.status = 'waiting',
    this.bestPrice,
    this.bestDepart,
    this.bestReturn,
    this.bestCarrier,
    this.bestStops,
    this.lowPrice,
    this.firstPrice,
    this.target,
    this.history = const [],
  });

  final String id;
  final String origin;
  final String destination;
  final String depart;
  final String? returnDate;
  final int flexDays;
  final String cabin;
  final String status;
  final int? bestPrice;
  final String? bestDepart;
  final String? bestReturn;
  final String? bestCarrier;
  final int? bestStops;
  final int? lowPrice;
  final int? firstPrice;
  final int? target;

  /// Daily lowest price, oldest first: (scan date, TWD).
  final List<({String date, int price})> history;

  bool get targetHit => target != null && bestPrice != null && bestPrice! <= target!;

  /// Change vs the previous daily check (negative = cheaper).
  int? get changeSinceLast {
    if (history.length < 2 || bestPrice == null || history.last.price != bestPrice) return null;
    return bestPrice! - history[history.length - 2].price;
  }

  factory TrackerResult.fromJson(String id, Map<String, dynamic> j) {
    final def = (j['def'] as Map<String, dynamic>?) ?? const {};
    final best = j['best'] as Map<String, dynamic>?;
    final hist = (j['history'] as List? ?? const [])
        .whereType<List>()
        .where((e) => e.length >= 2 && e[0] is String && e[1] is num)
        .map((e) => (date: e[0] as String, price: (e[1] as num).round()))
        .toList();
    return TrackerResult(
      id: id,
      origin: def['o'] as String? ?? '???',
      destination: def['d'] as String? ?? '???',
      depart: def['depart'] as String? ?? '',
      returnDate: def['return'] as String?,
      flexDays: (def['flex'] as num?)?.toInt() ?? 0,
      cabin: def['cabin'] as String? ?? 'business',
      status: j['status'] as String? ?? 'waiting',
      bestPrice: (best?['p'] as num?)?.round(),
      bestDepart: best?['dep'] as String?,
      bestReturn: best?['ret'] as String?,
      bestCarrier: best?['c'] as String?,
      bestStops: (best?['s'] as num?)?.toInt(),
      lowPrice: ((j['low'] as Map<String, dynamic>?)?['p'] as num?)?.round(),
      firstPrice: ((j['first'] as Map<String, dynamic>?)?['p'] as num?)?.round(),
      target: (def['target'] as num?)?.round(),
      history: hist,
    );
  }

  /// Every tracker in trackers.json except ones deleted by their owner.
  static List<TrackerResult> listFrom(Map<String, dynamic> json) {
    final trackers = (json['trackers'] as Map<String, dynamic>?) ?? const {};
    return trackers.entries
        .where((e) => e.value is Map<String, dynamic> && (e.value as Map)['status'] != 'removed' && (e.value as Map)['def'] != null)
        .map((e) => TrackerResult.fromJson(e.key, e.value as Map<String, dynamic>))
        .toList()
      ..sort((a, b) => a.depart.compareTo(b.depart));
  }
}

class Deal {
  const Deal({
    required this.id,
    required this.origin,
    required this.destination,
    required this.priceTwd,
    required this.carrier,
    required this.departDate,
    this.returnDate,
    this.stops = 0,
    this.tier = 'fair',
    this.score = 0,
    this.alliance = 'NONE',
    this.lieFlat,
  });

  final String id;
  final String origin;
  final String destination;
  final int priceTwd;
  final String carrier;
  final String departDate;
  final String? returnDate;
  final int stops;
  final String tier; // hot · great · good · fair
  final int score;
  final String alliance;
  final bool? lieFlat;

  factory Deal.fromJson(Map<String, dynamic> j) => Deal(
        id: j['id'] as String,
        origin: j['origin'] as String,
        destination: j['destination'] as String,
        priceTwd: (j['priceTWD'] as num).round(),
        carrier: j['primaryCarrier'] as String? ?? '',
        departDate: j['departDate'] as String,
        returnDate: j['returnDate'] as String?,
        stops: (j['stops'] as num?)?.toInt() ?? 0,
        tier: j['tier'] as String? ?? 'fair',
        score: (j['score'] as num?)?.round() ?? 0,
        alliance: j['alliance'] as String? ?? 'NONE',
        lieFlat: j['lieFlat'] as bool?,
      );

  /// Full-service deals, best score first (the PWA's default "Deals" view).
  static List<Deal> topFrom(Map<String, dynamic> json, {int limit = 20}) {
    final list = (json['deals'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .where((d) => d['budget'] != true && d['priceTWD'] is num)
        .map(Deal.fromJson)
        .toList()
      ..sort((a, b) => b.score.compareTo(a.score));
    return list.take(limit).toList();
  }
}
