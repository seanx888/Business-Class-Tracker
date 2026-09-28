// Build-time configuration (flutter run --dart-define=KEY=value). No secrets live in the app:
// FlightAware / OAG keys stay in the backend; the app only knows the public endpoints.
class AppConfig {
  /// Supabase Edge Functions base, e.g. `https://<project>.supabase.co/functions/v1`.
  /// Empty → the app runs on built-in demo flights.
  static const apiBase = String.fromEnvironment('AETHER_API_BASE');

  /// Supabase anon (public) key, sent as `apikey` / Bearer for Edge Functions.
  static const apiKey = String.fromEnvironment('AETHER_API_KEY');

  /// Daily fare data published by the scanner (same files the PWA reads).
  static const dataBase = String.fromEnvironment(
    'AETHER_DATA_BASE',
    defaultValue: 'https://raw.githubusercontent.com/seanx888/Business-Class-Tracker/main/web/data/',
  );

  static bool get hasApi => apiBase.isNotEmpty;
}
