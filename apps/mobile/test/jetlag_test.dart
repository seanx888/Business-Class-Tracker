import 'package:aethersky/domain/jetlag.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  JetLagPlan? plan(int hours, {int arrival = 9, int extraMinutes = 0}) =>
      planJetLag(shiftMinutes: hours * 60 + extraMinutes, arrivalLocalHour: arrival);

  test('shifts under 3 hours need no plan (TPE→NRT is +1 h, TPE→BKK −1 h)', () {
    expect(plan(1), isNull);
    expect(plan(-1), isNull);
    expect(plan(2), isNull);
    expect(plan(0), isNull);
  });

  test('eastward: 1 h/day recovery, morning light; westward: 1.5 h/day, evening light', () {
    final east = plan(6)!;
    expect(east.direction, JetLagDirection.east);
    expect(east.hours, 6);
    expect(east.recoveryDays, 6);
    expect(east.tips, contains(JetLagTip.seekMorningLight));
    final west = plan(-9)!;
    expect(west.direction, JetLagDirection.west);
    expect(west.hours, 9);
    expect(west.recoveryDays, 6, reason: '9 h ÷ 1.5 h/day');
    expect(west.tips, contains(JetLagTip.seekEveningLight));
    expect(west.tips, isNot(contains(JetLagTip.seekMorningLight)));
  });

  test('the body takes the shorter way round: +14 h east is 10 h west; −13 h is 11 h east', () {
    final p = plan(14)!;
    expect(p.direction, JetLagDirection.west);
    expect(p.hours, 10);
    final q = plan(-13)!;
    expect(q.direction, JetLagDirection.east);
    expect(q.hours, 11);
    expect(plan(12)!.direction, JetLagDirection.east, reason: 'exactly 12 h stays as flown');
  });

  test('very long eastward hops avoid early light at first instead of seeking it', () {
    final p = plan(8)!;
    expect(p.tips, contains(JetLagTip.avoidEarlyLightFirstDays));
    expect(p.tips, isNot(contains(JetLagTip.seekMorningLight)));
    expect(plan(7)!.tips, contains(JetLagTip.seekMorningLight));
  });

  test('pre-trip bedtime shift: 3 days from 5 h, 2 days for 3–4 h', () {
    expect(plan(3)!.preDays, 2);
    expect(plan(4)!.preDays, 2);
    expect(plan(5)!.preDays, 3);
    expect(plan(-9)!.preDays, 3);
    expect(plan(3)!.tips, contains(JetLagTip.shiftBedtimeBefore));
  });

  test('arrival time decides between "stay up" and "sleep on local time"', () {
    expect(plan(6, arrival: 8)!.tips, contains(JetLagTip.stayAwakeUntilBedtime));
    expect(plan(6, arrival: 17)!.tips, contains(JetLagTip.stayAwakeUntilBedtime));
    expect(plan(6, arrival: 18)!.tips, contains(JetLagTip.sleepOnLocalTime));
    expect(plan(6, arrival: 2)!.tips, contains(JetLagTip.sleepOnLocalTime));
    expect(plan(6, arrival: 4)!.tips, contains(JetLagTip.stayAwakeUntilBedtime));
    for (final h in [0, 3, 9, 15, 21]) {
      final t = plan(6, arrival: h)!.tips;
      expect(
        t.contains(JetLagTip.stayAwakeUntilBedtime) != t.contains(JetLagTip.sleepOnLocalTime),
        isTrue,
        reason: 'exactly one of the two at $h:00',
      );
    }
  });

  test('half-hour zones round sensibly (Taipei → Delhi is 2.5 h west → 3 h)', () {
    expect(planJetLag(shiftMinutes: -150, arrivalLocalHour: 12)!.hours, 3, reason: '2.5 h rounds to 3');
    expect(planJetLag(shiftMinutes: 149, arrivalLocalHour: 12), isNull);
  });

  test('always: watch to destination time and no late caffeine', () {
    final t = plan(-8)!.tips;
    expect(t, containsAll([JetLagTip.destinationTimeOnBoard, JetLagTip.limitCaffeine]));
  });
}
