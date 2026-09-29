// Finds flights in pasted booking-confirmation text (airline e-mails, OTA receipts, GDS itinerary lines,
// Chinese / Korean / English), so a whole trip can be added in one paste instead of typing every leg.
// Heuristic by nature: the UI always shows what was found and lets the traveller confirm each flight.
import 'airlines.dart';

class ParsedFlight {
  const ParsedFlight({required this.carrier, required this.number, this.date});

  final String carrier;
  final String number;

  /// Local calendar date of departure as written in the text; null when none could be associated.
  final DateTime? date;

  String get ident => '$carrier$number';

  @override
  String toString() => '$ident@${date?.toIso8601String().substring(0, 10)}';
}

const _months = {
  'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6, 'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12, //
};
const _monthAlt = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC';

class _Date {
  _Date(this.start, this.end, this.month, this.day, this.year);
  final int start;
  final int end;
  final int month;
  final int day;
  final int? year; // null → infer
}

int? _year(String? y) {
  if (y == null) return null;
  final n = int.parse(y);
  return y.length == 2 ? 2000 + n : n;
}

bool _valid(int m, int d) => m >= 1 && m <= 12 && d >= 1 && d <= 31;

/// Every date-looking span in [line], left to right (overlaps resolved in favour of the longer match).
List<_Date> _datesIn(String line) {
  final found = <_Date>[];
  void add(RegExpMatch m, int month, int day, String? year) {
    if (_valid(month, day)) found.add(_Date(m.start, m.end, month, day, _year(year)));
  }

  // 2026-12-20 · 2026/12/20 · 2026.12.20 · 2026年12月20日
  for (final m in RegExp(r'(?<!\d)(20\d{2})\s?[-/.年]\s?(\d{1,2})\s?[-/.月]\s?(\d{1,2})\s?日?(?!\d)').allMatches(line)) {
    add(m, int.parse(m[2]!), int.parse(m[3]!), m[1]);
  }
  // 2026년 12월 20일 · 12월 20일 · 12月20日
  for (final m in RegExp(r'(?:(20\d{2})\s?[년年]\s?)?(\d{1,2})\s?[월月]\s?(\d{1,2})\s?[일日]?').allMatches(line)) {
    add(m, int.parse(m[2]!), int.parse(m[3]!), m[1]);
  }
  // 20DEC · 20 Dec 2026 · 20-Dec-26 · 20th December
  for (final m in RegExp(
    '(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?[\\s.-]?($_monthAlt)[A-Za-z]*\\.?(?:[\\s,.-]*(20\\d{2}|\\d{2})(?![\\d:]))?',
    caseSensitive: false,
  ).allMatches(line)) {
    add(m, _months[m[2]!.toUpperCase()]!, int.parse(m[1]!), m[3]);
  }
  // Dec 20 · December 20, 2026 · Sat, Dec 20
  for (final m in RegExp(
    '(?<![A-Za-z])($_monthAlt)[A-Za-z]*\\.?\\s?(\\d{1,2})(?:st|nd|rd|th)?(?!\\d|:)(?:,?\\s?(20\\d{2}))?',
    caseSensitive: false,
  ).allMatches(line)) {
    add(m, _months[m[1]!.toUpperCase()]!, int.parse(m[2]!), m[3]);
  }
  // 12/20 · 12/20/2026 (month first, as in Taiwan / Korea / US); 20/12 when the first number cannot be a month
  for (final m in RegExp(r'(?<![\d/])(\d{1,2})/(\d{1,2})(?:/(20\d{2}|\d{2}))?(?![\d/])').allMatches(line)) {
    final a = int.parse(m[1]!);
    final b = int.parse(m[2]!);
    if (a > 12 && b <= 12) {
      add(m, b, a, m[3]);
    } else {
      add(m, a, b, m[3]);
    }
  }

  // Drop spans swallowed by a longer one, keep left-to-right order.
  found.sort((a, b) => a.start != b.start ? a.start.compareTo(b.start) : (b.end - b.start).compareTo(a.end - a.start));
  final out = <_Date>[];
  for (final d in found) {
    if (out.isNotEmpty && d.start < out.last.end) continue;
    out.add(d);
  }
  return out;
}

// Aircraft type designators that look like "<airline code><digits>" — A320/A350 → A3+20/50, B738/B787 → B7+38/87.
const _aircraftLike = {'A3', 'B7'};

final _flightRe = RegExp(r'(?<![A-Za-z0-9])([A-Z0-9]{2})(\s?)(\d{1,4})(?![A-Za-z0-9])(?![-/.]\d)');
final _timeBefore = RegExp(r'\d{1,2}:\d{2}\s?$');

/// Flights mentioned in [text], in reading order, each with the date written nearest to it.
/// [now] anchors year-less dates ("20DEC" → the next 20 December on or after a week ago).
///
/// Where the date sits relative to the flight depends on the layout of the mail: a date heading above the
/// legs ("Sat, Dec 20 / BR 198 …") or a table read cell by cell ("BR198 / 2026-12-20"). A date on the same
/// line always wins; otherwise the first date in the text decides which direction to look first.
List<ParsedFlight> parseItinerary(String text, {required DateTime now}) {
  final lines = text.split(RegExp(r'\r?\n'));
  final dates = [for (final l in lines) _datesIn(l)];

  final hits = <({int line, RegExpMatch m, String code, String number})>[];
  for (var i = 0; i < lines.length; i++) {
    final line = lines[i];
    for (final m in _flightRe.allMatches(line)) {
      final code = m[1]!;
      final number = m[3]!;
      if (!isKnownAirlineCode(code) || RegExp(r'^\d\d$').hasMatch(code)) continue;
      if (_aircraftLike.contains(code) && m[2]!.isEmpty && number.length <= 3) continue; // "A350", "B787"
      if ((code == 'AM' || code == 'PM') && _timeBefore.hasMatch(line.substring(0, m.start))) continue; // "10:35 AM 20 Dec"
      hits.add((line: i, m: m, code: code, number: number));
    }
  }
  if (hits.isEmpty) return const [];

  final firstDateLine = dates.indexWhere((d) => d.isNotEmpty);
  final headingStyle = firstDateLine != -1 && firstDateLine <= hits.first.line;
  final hitLines = {for (final h in hits) h.line};

  _Date? above(int i) {
    for (var j = i - 1; j >= 0 && i - j <= 6; j--) {
      if (dates[j].isNotEmpty) return dates[j].last;
    }
    return null;
  }

  _Date? below(int i, int reach) {
    for (var j = i + 1; j <= i + reach && j < lines.length; j++) {
      if (dates[j].isNotEmpty) return dates[j].first;
      if (hitLines.contains(j)) return null; // the next flight starts here — that date is not ours
    }
    return null;
  }

  DateTime? previous; // keeps year-less dates in order across a trip (return leg after New Year)
  DateTime resolve(_Date d) {
    var y = d.year;
    if (y == null) {
      y = now.year;
      if (DateTime.utc(y, d.month, d.day).isBefore(DateTime.utc(now.year, now.month, now.day).subtract(const Duration(days: 7)))) y += 1;
      if (previous != null && DateTime.utc(y, d.month, d.day).isBefore(previous)) y += 1;
    }
    return DateTime.utc(y, d.month, d.day);
  }

  final out = <ParsedFlight>[];
  final seen = <String>{};
  for (final h in hits) {
    _Date? d;
    var best = 1 << 30;
    for (final cand in dates[h.line]) {
      final dist = cand.start >= h.m.end ? cand.start - h.m.end : h.m.start - cand.end;
      if (dist < best) {
        best = dist;
        d = cand;
      }
    }
    d ??= headingStyle ? (above(h.line) ?? below(h.line, 2)) : (below(h.line, 3) ?? above(h.line));
    final date = d == null ? null : resolve(d);
    if (date != null) previous = date;
    final number = h.number.replaceFirst(RegExp(r'^0+(?=\d)'), '');
    if (seen.add('${h.code}$number@${date?.toIso8601String()}')) out.add(ParsedFlight(carrier: h.code, number: number, date: date));
  }
  return out;
}
