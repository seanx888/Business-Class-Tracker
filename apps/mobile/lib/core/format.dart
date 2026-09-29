import 'package:intl/intl.dart';
import 'package:timezone/data/latest_10y.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

bool _tzReady = false;

/// Load the IANA time-zone table once (flight times are shown in each airport's local time).
void initTimeZones() {
  if (_tzReady) return;
  tzdata.initializeTimeZones();
  _tzReady = true;
}

/// The instant [utc] as wall-clock time at an airport, falling back to device local time.
DateTime atAirport(DateTime utc, String? timeZone) {
  if (timeZone != null) {
    try {
      initTimeZones();
      return tz.TZDateTime.from(utc, tz.getLocation(timeZone));
    } catch (_) {
      // unknown zone → device time
    }
  }
  return utc.toLocal();
}

String hhmm(DateTime? utc, String? timeZone) => utc == null ? '--:--' : DateFormat.Hm().format(atAirport(utc, timeZone));

/// "12/20 週六" style short date at the airport.
String shortDay(DateTime? utc, String? timeZone, String locale) =>
    utc == null ? '' : DateFormat.MMMEd(locale).format(atAirport(utc, timeZone));

/// "+1" when arrival is on a later calendar day than departure (each in its own zone).
String dayOffset(DateTime? depUtc, String? depTz, DateTime? arrUtc, String? arrTz) {
  if (depUtc == null || arrUtc == null) return '';
  final a = atAirport(depUtc, depTz);
  final b = atAirport(arrUtc, arrTz);
  final days = DateTime.utc(b.year, b.month, b.day).difference(DateTime.utc(a.year, a.month, a.day)).inDays;
  return days == 0 ? '' : (days > 0 ? '+$days' : '$days');
}

String duration(Duration? d) {
  if (d == null) return '—';
  final h = d.inHours;
  final m = d.inMinutes % 60;
  return h > 0 ? '${h}h ${m.toString().padLeft(2, '0')}m' : '${m}m';
}

String twd(int? v) => v == null ? '—' : 'NT\$${NumberFormat.decimalPattern('en_US').format(v)}';

/// "2026-12-20" → "12/20"
String isoToMd(String? iso) {
  if (iso == null || iso.length < 10) return '';
  return '${int.parse(iso.substring(5, 7))}/${int.parse(iso.substring(8, 10))}';
}
