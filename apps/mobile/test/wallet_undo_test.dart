import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

Map<String, Object> seed() => {
  'aether.members.v1': jsonEncode([
    {'id': 'm1', 'program': 'OTHER', 'programName': 'Sky Club', 'number': 'SC12345678', 'owner': 'Sean'},
  ]),
};

void main() {
  testWidgets('removing a membership card says what was removed and Undo puts it back', (tester) async {
    await pumpApp(tester, source: InertFlightSource(), prefs: seed());
    await tester.tap(find.text('會員卡'));
    await tester.pumpAndSettle();
    expect(find.text('Sky Club'), findsOneWidget);

    await tester.tap(find.byTooltip('移除').first);
    await tester.pumpAndSettle();
    expect(find.text('已移除 Sky Club'), findsOneWidget);
    expect(find.text('•••• 5678'), findsNothing);

    await tester.tap(find.text('復原'));
    await tester.pumpAndSettle();
    expect(find.text('•••• 5678'), findsOneWidget);
  });
}
