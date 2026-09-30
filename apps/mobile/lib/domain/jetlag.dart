// Jet-lag plan from the time-zone shift of a flight. General, widely published sleep-and-light guidance — not medical advice:
//   • the body clock adjusts roughly 1 h/day flying east (harder) and 1.5 h/day flying west;
//   • start shifting bedtime 1 h/day for up to 3 days before departure;
//   • on arrival, light is the strongest cue — morning light pulls the clock earlier (east), evening light later (west);
//     after a very long eastward hop, morning light can push it the wrong way, so it is avoided for the first days.

enum JetLagDirection { east, west }

/// One line of advice; the UI turns it into words.
enum JetLagTip {
  /// Shift bedtime [JetLagPlan.preDays] day(s) before departure, 1 h per day, toward the destination.
  shiftBedtimeBefore,

  /// Set your watch to destination time as you board and eat/sleep by it.
  destinationTimeOnBoard,

  /// Arrive in the morning/midday: stay up until local bedtime; a nap ≤ 30 min before 15:00 at most.
  stayAwakeUntilBedtime,

  /// Arrive in the evening/night: go to bed on local time, however tired or wide awake you feel.
  sleepOnLocalTime,

  /// Seek bright light in the local morning (flying east).
  seekMorningLight,

  /// Seek bright light in the local late afternoon/evening (flying west).
  seekEveningLight,

  /// Very long eastward shift: avoid bright light before ~10:00 for the first two days, take it in the afternoon instead.
  avoidEarlyLightFirstDays,

  /// No caffeine in the 6 hours before local bedtime.
  limitCaffeine,
}

class JetLagPlan {
  const JetLagPlan({required this.direction, required this.hours, required this.recoveryDays, required this.preDays, required this.tips});

  final JetLagDirection direction;

  /// Effective shift the body must make, 3…12 h (a +14 h shift east is a −10 h shift west).
  final int hours;

  /// Days the body typically needs to settle in.
  final int recoveryDays;

  /// Days before departure to start moving bedtime (0 = not worth it for this shift).
  final int preDays;
  final List<JetLagTip> tips;
}

/// Shifts below this are not worth a plan.
const minJetLagHours = 3;

/// [shiftMinutes] = destination UTC offset − origin UTC offset (positive = east). [arrivalLocalHour] is the destination
/// wall-clock hour (0–23) of landing. Null when the shift is too small to matter.
JetLagPlan? planJetLag({required int shiftMinutes, required int arrivalLocalHour}) {
  var hours = (shiftMinutes / 60).round();
  // The body takes the shorter way round: +14 h east is 10 h west.
  if (hours > 12) hours -= 24;
  if (hours < -12) hours += 24;
  if (hours.abs() < minJetLagHours) return null;

  final east = hours > 0;
  final abs = hours.abs();
  final perDay = east ? 1.0 : 1.5;
  final recovery = (abs / perDay).ceil();
  final pre = abs >= 5 ? 3 : (abs >= 3 ? 2 : 0);

  final tips = <JetLagTip>[
    if (pre > 0) JetLagTip.shiftBedtimeBefore,
    JetLagTip.destinationTimeOnBoard,
    // Landing between 04:00 and 17:59 → the day is still ahead; otherwise it is (nearly) the local night.
    if (arrivalLocalHour >= 4 && arrivalLocalHour < 18) JetLagTip.stayAwakeUntilBedtime else JetLagTip.sleepOnLocalTime,
    if (east && abs >= 8) JetLagTip.avoidEarlyLightFirstDays else if (east) JetLagTip.seekMorningLight else JetLagTip.seekEveningLight,
    JetLagTip.limitCaffeine,
  ];
  return JetLagPlan(
    direction: east ? JetLagDirection.east : JetLagDirection.west,
    hours: abs,
    recoveryDays: recovery,
    preDays: pre,
    tips: tips,
  );
}
