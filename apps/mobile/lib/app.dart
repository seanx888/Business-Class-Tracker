import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/strings.dart';
import 'core/theme.dart';
import 'data/stores.dart';
import 'features/fares/fares_screen.dart';
import 'features/flights/flight_detail_screen.dart';
import 'features/flights/flights_screen.dart';
import 'features/passport/passport_screen.dart';
import 'features/passport/wrapped_screen.dart';
import 'features/plans/plans_screen.dart';
import 'features/radar/radar_screen.dart';
import 'features/settings/settings_screen.dart';
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
                  GoRoute(
                    path: 'passport',
                    builder: (_, _) => const PassportScreen(),
                    routes: [GoRoute(path: 'wrapped', builder: (_, _) => const WrappedScreen())],
                  ), // before ':id'
                  GoRoute(path: 'settings', builder: (_, _) => const SettingsScreen()),
                  GoRoute(path: ':id', builder: (_, state) => FlightDetailScreen(id: state.pathParameters['id']!)),
                ],
              ),
            ]),
            StatefulShellBranch(routes: [GoRoute(path: '/radar', builder: (_, _) => const RadarScreen())]),
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
          NavigationDestination(icon: const Icon(Icons.radar_outlined), selectedIcon: const Icon(Icons.radar), label: s.tabRadar),
          NavigationDestination(icon: const Icon(Icons.trending_down_outlined), selectedIcon: const Icon(Icons.trending_down), label: s.tabFares),
          NavigationDestination(icon: const Icon(Icons.wallet_outlined), selectedIcon: const Icon(Icons.wallet), label: s.tabWallet),
          NavigationDestination(icon: const Icon(Icons.workspace_premium_outlined), selectedIcon: const Icon(Icons.workspace_premium), label: s.tabPlans),
        ],
      ),
    );
  }
}

class AetherApp extends ConsumerStatefulWidget {
  const AetherApp({super.key});

  @override
  ConsumerState<AetherApp> createState() => _AetherAppState();
}

/// Refreshes flights that matter (under way / leaving within 2 days) when the app opens and whenever
/// it returns to the foreground — at most every [_minGap], so opening the app never hammers the data API.
class _AetherAppState extends ConsumerState<AetherApp> with WidgetsBindingObserver {
  static const _minGap = Duration(minutes: 2);
  final _router = buildRouter();
  DateTime? _lastRefresh;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  void _refresh() {
    final now = ref.read(clockProvider)();
    final last = _lastRefresh;
    if (last != null && now.difference(last) < _minGap) return;
    _lastRefresh = now;
    ref.read(myFlightsProvider.notifier).refreshAll();
  }

  @override
  Widget build(BuildContext context) {
    final language = ref.watch(settingsProvider.select((x) => x.language));
    return MaterialApp.router(
      title: 'ÆtherSky',
      // null = follow the phone; otherwise the language chosen in Settings.
      locale: switch (language) {
        'zh' => const Locale('zh', 'TW'),
        'en' => const Locale('en'),
        'ko' => const Locale('ko'),
        _ => null,
      },
      debugShowCheckedModeBanner: false,
      theme: aetherTheme(Brightness.light),
      darkTheme: aetherTheme(Brightness.dark),
      routerConfig: _router,
      supportedLocales: const [Locale('zh', 'TW'), Locale('en'), Locale('ko')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
    );
  }
}
