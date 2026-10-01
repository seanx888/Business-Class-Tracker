// Connection assistant: two of your tracked flights where the first lands at the airport the second leaves from,
// within a day. Looks at the layover as it stands NOW (estimated times), how much a delay has eaten, and whether
// you must change terminals — the three things that decide whether a connection is made.
import 'flight.dart';
import 'schedule.dart';

enum ConnectionRisk {
  /// Comfortable.
  ok,

  /// Makeable, but little slack for a delay or a terminal change.
  tight,

  /// Only just possible — expect to run, and to be on the wrong side of any further delay.
  critical,

  /// The next flight leaves before this one arrives.
  missed,
}

class Connection {
  const Connection({
    required this.from,
    required this.to,
    required this.layover,
    required this.scheduledLayover,
    required this.terminalChange,
    required this.international,
    required this.risk,
  });

  final Flight from;
  final Flight to;

  /// Time between landing (gate in) and the next departure (gate out), from the best-known times. Negative = missed.
  final Duration layover;

  /// The same, from the original schedule.
  final Duration scheduledLayover;

  /// Both terminals are known and differ.
  final bool terminalChange;

  /// Either flight crosses a border (or a country is unknown, which is treated as international).
  final bool international;
  final ConnectionRisk risk;

  String get airport => from.destination.iata;

  /// How much delay has already shortened the connection (zero when it grew or is unchanged).
  Duration get shrunkBy => scheduledLayover > layover ? scheduledLayover - layover : Duration.zero;
}

/// Minutes needed for a connection to be "critical" / "tight" (before the +30 for a terminal change).
({int critical, int tight}) _thresholds(bool international) => international ? (critical: 45, tight: 90) : (critical: 30, tight: 60);

ConnectionRisk assessLayover(Duration layover, {required bool international, required bool terminalChange}) {
  if (layover.isNegative) return ConnectionRisk.missed;
  final t = _thresholds(international);
  final buffer = terminalChange ? 30 : 0;
  if (layover.inMinutes < t.critical + buffer) return ConnectionRisk.critical;
  if (layover.inMinutes < t.tight + buffer) return ConnectionRisk.tight;
  return ConnectionRisk.ok;
}

/// Longest layover still called a connection; beyond it the wait is a stopover.
const maxConnection = Duration(hours: 24);

/// A flight that lands more than this after the next one leaves is treated as unrelated, not "missed".
const _maxMissedBy = Duration(hours: 6);

/// Connections among [flights], in departure order of the first leg. [countryOf] maps IATA → ISO country.
List<Connection> findConnections(Iterable<Flight> flights, DateTime now, {String? Function(String iata)? countryOf}) {
  final live = flights.where((f) => !isFinished(f, now) && !f.cancelled).toList()
    ..sort((a, b) => (a.gateOut.best ?? DateTime.utc(9999)).compareTo(b.gateOut.best ?? DateTime.utc(9999)));
  final out = <Connection>[];
  for (var i = 0; i < live.length; i++) {
    final a = live[i];
    final aIn = a.gateIn.best;
    if (aIn == null) continue;
    final aInScheduled = a.gateIn.scheduled ?? aIn;
    // The first later flight that leaves from where `a` lands is its connection.
    for (var j = i + 1; j < live.length; j++) {
      final b = live[j];
      if (b.origin.iata != a.destination.iata) continue;
      final bOut = b.gateOut.best;
      if (bOut == null) continue;
      final layover = bOut.difference(aIn);
      if (layover > maxConnection || layover < -_maxMissedBy) continue;
      final bOutScheduled = b.gateOut.scheduled ?? bOut;
      final terminalChange = a.destination.terminal != null && b.origin.terminal != null && a.destination.terminal != b.origin.terminal;
      bool crosses(Flight f) {
        final c1 = countryOf?.call(f.origin.iata);
        final c2 = countryOf?.call(f.destination.iata);
        return c1 == null || c2 == null || c1 != c2;
      }

      final international = crosses(a) || crosses(b);
      out.add(Connection(
        from: a,
        to: b,
        layover: layover,
        scheduledLayover: bOutScheduled.difference(aInScheduled),
        terminalChange: terminalChange,
        international: international,
        risk: assessLayover(layover, international: international, terminalChange: terminalChange),
      ));
      break;
    }
  }
  return out;
}

/// The worst risk first, for the alert at the top of the list.
List<Connection> atRisk(Iterable<Connection> connections) =>
    connections.where((c) => c.risk != ConnectionRisk.ok).toList()..sort((a, b) => b.risk.index.compareTo(a.risk.index));
