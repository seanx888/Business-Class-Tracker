import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';

import 'core/strings.dart';
import 'core/theme.dart';
import 'features/fares/fares_screen.dart';
import 'features/flights/flight_detail_screen.dart';
import 'features/flights/flights_screen.dart';
import 'features/plans/plans_screen.dart';
import 'features/wallet/wallet_screen.dart';

GoRouter buildRouter() => GoRouter(
      initialLocation: '/flights',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, shell) => _Shell(shell: shell),
          branches: [
            StatefulShellBranch(routes: [
              GoRoute(
                path: '/flights',
                builder: (_, _) => const FlightsScreen(),
                routes: [
                  GoRoute(path: ':id', builder: (_, state) => FlightDetailScreen(id: state.pathParameters['id']!)),
                ],
              ),
            ]),
            StatefulShellBranch(routes: [GoRoute(path: '/fares', builder: (_, _) => const FaresScreen())]),
            StatefulShellBranch(routes: [GoRoute(path: '/wallet', builder: (_, _) => const WalletScreen())]),
            StatefulShellBranch(routes: [GoRoute(path: '/plans', builder: (_, _) => const PlansScreen())]),
          ],
        ),
      ],
    );

class _Shell extends StatelessWidget {
  const _Shell({required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.flight_outlined), selectedIcon: const Icon(Icons.flight), label: s.tabFlights),
          NavigationDestination(icon: const Icon(Icons.trending_down_outlined), selectedIcon: const Icon(Icons.trending_down), label: s.tabFares),
          NavigationDestination(icon: const Icon(Icons.wallet_outlined), selectedIcon: const Icon(Icons.wallet), label: s.tabWallet),
          NavigationDestination(icon: const Icon(Icons.workspace_premium_outlined), selectedIcon: const Icon(Icons.workspace_premium), label: s.tabPlans),
        ],
      ),
    );
  }
}

class AetherApp extends StatefulWidget {
  const AetherApp({super.key});

  @override
  State<AetherApp> createState() => _AetherAppState();
}

class _AetherAppState extends State<AetherApp> {
  final _router = buildRouter();

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'ÆtherSky',
      debugShowCheckedModeBanner: false,
      theme: aetherTheme(Brightness.light),
      darkTheme: aetherTheme(Brightness.dark),
      routerConfig: _router,
      supportedLocales: const [Locale('zh', 'TW'), Locale('en'), Locale('ko')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
    );
  }
}
