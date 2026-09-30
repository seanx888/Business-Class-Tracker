// iCalendar (RFC 5545) export of one flight, so it can be dropped into Apple / Google / Outlook calendars.
// Times are written in UTC (no VTIMEZONE needed); the description spells out the airport-local times.
import 'dart:convert';

import 'flight.dart';

/// Escapes TEXT values: backslash, semicolon, comma and newlines (RFC 5545 §3.3.11).
String icsEscape(String v) =>
    v.replaceAll('\\', '\\\\').replaceAll(';', r'\;').replaceAll(',', '\\,').replaceAll('\r\n', '\\n').replaceAll('\n', '\\n');

/// Folds a content line to ≤ 75 octets per physical line (continuations start with one space),
/// never splitting a multi-byte character.
String icsFold(String line) {
  if (utf8.encode(line).length <= 75) return line;
  final out = <String>[];
  var current = StringBuffer();
  var bytes = 0;
  var limit = 75;
  for (final rune in line.runes) {
    final ch = String.fromCharCode(rune);
    final n = utf8.encode(ch).length;
    if (bytes + n > limit) {
      out.add(current.toString());
      current = StringBuffer();
      bytes = 0;
      limit = 74; // the leading space of a continuation line counts too
    }
    current.write(ch);
    bytes += n;
  }
  out.add(current.toString());
  return out.join('\r\n ');
}

String _utc(DateTime t) {
  final u = t.toUtc();
  String two(int v) => v.toString().padLeft(2, '0');
  return '${u.year.toString().padLeft(4, '0')}${two(u.month)}${two(u.day)}T${two(u.hour)}${two(u.minute)}${two(u.second)}Z';
}

/// The calendar event for [flight], or null when its departure time is unknown.
/// The UID is stable per flight, so importing an updated file replaces the earlier event
/// instead of creating a duplicate (SEQUENCE increases with [now]).
String? flightIcs(Flight flight, {required DateTime now, String? description, int alarmHoursBefore = 3}) {
  final start = flight.gateOut.best ?? flight.takeoff.best;
  if (start == null) return null;
  final end = flight.gateIn.best ?? flight.landing.best ?? start.add(const Duration(hours: 2));
  final f = flight;
  final where = [f.origin.name ?? f.origin.iata, if (f.origin.terminal != null) 'T${f.origin.terminal}'].join(' ');
  final day = start.toUtc().toIso8601String().substring(0, 10);
  final lines = <String>[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ÆtherSky//Flights//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:${f.ident}-$day@aethersky',
    'DTSTAMP:${_utc(now)}',
    'SEQUENCE:${now.toUtc().difference(DateTime.utc(2026)).inMinutes.clamp(0, 1 << 30)}',
    'DTSTART:${_utc(start)}',
    'DTEND:${_utc(end.isAfter(start) ? end : start.add(const Duration(hours: 2)))}',
    'SUMMARY:${icsEscape('✈ ${f.ident} ${f.origin.iata} → ${f.destination.iata}')}',
    'LOCATION:${icsEscape(where)}',
    if (description != null && description.isNotEmpty) 'DESCRIPTION:${icsEscape(description)}',
    'STATUS:${f.cancelled ? 'CANCELLED' : 'CONFIRMED'}',
    'TRANSP:OPAQUE',
    if (alarmHoursBefore > 0) ...[
      'BEGIN:VALARM',
      'TRIGGER:-PT${alarmHoursBefore}H',
      'ACTION:DISPLAY',
      'DESCRIPTION:${icsEscape('${f.ident} ${f.origin.iata} → ${f.destination.iata}')}',
      'END:VALARM',
    ],
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return '${lines.map(icsFold).join('\r\n')}\r\n';
}
