import 'package:aethersky/domain/lounge_access.dart';
import 'package:aethersky/domain/membership.dart';
import 'package:aethersky/domain/trip.dart';
import 'package:flutter_test/flutter_test.dart';

Membership m(String program, String? tier) => Membership(id: '$program-$tier', program: program, number: '1234567', tier: tier);

List<AccessBasis> bases(LoungeVerdict v) => v.entitlements.map((e) => e.basis).toList();

void main() {
  group('tier → alliance status', () {
    AllianceStatus? st(String program, String? tier) => allianceStatusOf(m(program, tier));

    test('SkyTeam: Elite Plus opens lounges, Elite does not', () {
      expect(st('CI', 'Emerald')!.label, 'SkyTeam Elite Plus');
      expect(st('CI', 'Paragon')!.opensLounges, isTrue);
      expect(st('CI', 'Gold')!.opensLounges, isFalse, reason: 'Dynasty Flyer Gold is SkyTeam Elite, not Elite Plus');
      expect(st('KE', 'Morning Calm Premium')!.opensLounges, isTrue);
      expect(st('KE', 'Morning Calm')!.opensLounges, isFalse, reason: 'the longer phrase must not be shadowed by its prefix');
      expect(st('AFKL', 'Silver')!.opensLounges, isFalse);
      expect(st('AFKL', 'Flying Blue Platinum')!.opensLounges, isTrue);
      expect(st('DL', 'Gold Medallion')!.opensLounges, isTrue);
    });

    test('Star Alliance: Gold and up', () {
      expect(st('BR', 'Gold')!.label, 'Star Alliance Gold');
      expect(st('BR', 'Diamond')!.opensLounges, isTrue);
      expect(st('BR', 'Silver')!.label, 'Star Alliance Silver');
      expect(st('BR', 'Silver')!.opensLounges, isFalse);
      expect(st('SQ', 'PPS Club')!.opensLounges, isTrue);
      expect(st('SQ', 'KrisFlyer Elite Gold')!.opensLounges, isTrue);
      expect(st('UA', 'Premier Silver')!.opensLounges, isFalse);
      expect(st('UA', 'Premier 1K')!.opensLounges, isTrue);
      expect(st('AC', '50K')!.opensLounges, isTrue);
      expect(st('AC', '35K')!.opensLounges, isFalse);
      expect(st('TG', 'Gold Member')!.opensLounges, isTrue, reason: 'a higher tier beats the base "member" word');
    });

    test('oneworld: Sapphire → business lounges, Emerald → first-class lounges too', () {
      expect(st('BA', 'Silver')!.label, 'oneworld Sapphire');
      expect(st('BA', 'Gold')!.label, 'oneworld Emerald');
      expect(st('AA', 'Platinum')!.label, 'oneworld Sapphire');
      expect(st('AA', 'Platinum Pro')!.label, 'oneworld Emerald');
      expect(st('JL', 'JGC Premier')!.level, StatusLevel.top);
      expect(st('QF', 'Platinum One')!.level, StatusLevel.top);
      expect(st('MH', 'Silver')!.label, 'oneworld Ruby');
    });

    test('unset, unknown or unlisted tiers → null (never guessed)', () {
      expect(st('BR', null), isNull);
      expect(st('BR', '  '), isNull);
      expect(st('BR', 'Purple'), isNull);
      expect(st('EK', 'Gold'), isNull, reason: 'program not in the table');
      expect(st('JX', 'Gold'), isNull);
    });

    test('every tier phrase in the table belongs to a program the wallet knows', () {
      for (final key in ['CI', 'KE', 'AFKL', 'DL', 'BR', 'NH', 'SQ', 'TG', 'OZ', 'UA', 'LH', 'TK', 'AC', 'JL', 'AA', 'BA', 'QF', 'MH']) {
        expect(programFor(key), isNotNull, reason: key);
      }
    });
  });

  group('lounge access for a flight', () {
    test('Business on a Star Alliance airline → its own lounge + Star Alliance lounges', () {
      final v = checkLoungeAccess(carrier: 'BR', cabin: Cabin.business, memberships: const []);
      expect(bases(v), [AccessBasis.ownCabin, AccessBasis.allianceCabin]);
      expect(v.entitlements.last.alliance, Alliance.star);
      expect(v.eligible, isTrue);
      expect(v.hints, isEmpty);
    });

    test('Economy with Star Gold on a Star flight → alliance lounges + 1 guest, attributed to the membership', () {
      final gold = m('BR', 'Gold');
      final v = checkLoungeAccess(carrier: 'UA', cabin: Cabin.economy, memberships: [gold]);
      expect(bases(v), [AccessBasis.allianceStatus]);
      expect(v.entitlements.single.membership, gold);
      expect(v.entitlements.single.status!.label, 'Star Alliance Gold');
      expect(v.entitlements.single.guests, 1);
    });

    test('status of another alliance does not help; SkyTeam Elite Plus works on SkyTeam metal only', () {
      final elitePlus = m('CI', 'Emerald');
      expect(checkLoungeAccess(carrier: 'BR', cabin: Cabin.economy, memberships: [elitePlus]).eligible, isFalse);
      expect(checkLoungeAccess(carrier: 'KE', cabin: Cabin.economy, memberships: [elitePlus]).eligible, isTrue);
    });

    test('basic status (SkyTeam Elite / Star Silver) gives no lounge', () {
      expect(checkLoungeAccess(carrier: 'CI', cabin: Cabin.economy, memberships: [m('AFKL', 'Silver')]).eligible, isFalse);
    });

    test('cabin + status stack; premium economy is not a lounge cabin', () {
      final v = checkLoungeAccess(carrier: 'KE', cabin: Cabin.first, memberships: [m('CI', 'Paragon')]);
      expect(bases(v), [AccessBasis.ownCabin, AccessBasis.allianceCabin, AccessBasis.allianceStatus]);
      expect(checkLoungeAccess(carrier: 'KE', cabin: Cabin.premium, memberships: const []).eligible, isFalse);
    });

    test('no cabin entered → asks for it, but status entitlements are still reported', () {
      final v = checkLoungeAccess(carrier: 'BR', cabin: null, memberships: [m('BR', 'Gold')]);
      expect(v.hints, contains(LoungeHint.needCabin));
      expect(bases(v), [AccessBasis.allianceStatus]);
    });

    test('a membership of this alliance without a recognised tier → asks for the tier', () {
      final v = checkLoungeAccess(carrier: 'BR', cabin: Cabin.economy, memberships: [m('BR', null), m('CI', 'Emerald')]);
      expect(v.hints, contains(LoungeHint.needTier));
      expect(v.tierUnknownFor.map((x) => x.program), ['BR'], reason: 'the SkyTeam card is irrelevant to a Star flight');
      expect(v.eligible, isFalse);
    });

    test('non-alliance airlines: own premium cabin only', () {
      final v = checkLoungeAccess(carrier: 'JX', cabin: Cabin.business, memberships: [m('BR', 'Gold')]);
      expect(bases(v), [AccessBasis.ownCabin]);
      expect(v.hints, contains(LoungeHint.noAlliance));
      expect(checkLoungeAccess(carrier: 'JX', cabin: Cabin.economy, memberships: [m('BR', 'Gold')]).eligible, isFalse);
    });

    test('unknown airline → no verdict, says so', () {
      final v = checkLoungeAccess(carrier: 'ZZ', cabin: Cabin.business, memberships: const []);
      expect(v.eligible, isFalse);
      expect(v.hints, contains(LoungeHint.unknownCarrier));
    });
  });

  test('a PWA wallet backup with programs the app did not have before imports in full (TG, OZ, LH, AC…)', () {
    for (final key in ['TG', 'OZ', 'LH', 'TK', 'AC', 'BA', 'QF', 'AS', 'MH', 'SK', 'VS', 'GA', 'EY', 'PR']) {
      final mem = Membership.fromJson({'program': key, 'number': '99001122'});
      expect(mem, isNotNull, reason: key);
    }
    expect(programs.length, greaterThanOrEqualTo(28));
    expect(programFor('TG')!.alliance, Alliance.star);
    expect(programFor('AFKL')!.alliance, Alliance.skyteam);
    expect(programFor('JX')!.alliance, Alliance.none);
    expect(programFor('BR')!.label('ko'), '인피니티 마일리지랜드');
  });
}
