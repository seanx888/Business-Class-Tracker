import 'departure_plan.dart';

/// Preferences kept on the device.
class AppSettings {
  const AppSettings({
    this.language = 'system',
    this.travelMinutes = 60,
    this.bufferInternationalMinutes = 180,
    this.bufferDomesticMinutes = 120,
    this.radarUseLocation = true,
    this.radarAirport = '',
    this.radarRadiusKm = 50,
  });

  /// 'system' (follow the phone) · 'zh' · 'en' · 'ko'
  final String language;

  /// Door to airport.
  final int travelMinutes;

  /// Minutes before departure to be at the airport.
  final int bufferInternationalMinutes;
  final int bufferDomesticMinutes;

  /// Radar Lite: centre on the phone's location (true) or on [radarAirport] (false).
  final bool radarUseLocation;

  /// IATA code of the airport the radar is centred on when not using the location; '' = none chosen yet.
  final String radarAirport;

  /// Search radius in km: one of [radarRadii].
  final int radarRadiusKm;

  static const radarRadii = [25, 50, 100];

  static const languages = ['system', 'zh', 'en', 'ko'];

  DepartureSettings get departure => DepartureSettings(
    travel: Duration(minutes: travelMinutes),
    bufferInternational: Duration(minutes: bufferInternationalMinutes),
    bufferDomestic: Duration(minutes: bufferDomesticMinutes),
  );

  AppSettings copyWith({
    String? language,
    int? travelMinutes,
    int? bufferInternationalMinutes,
    int? bufferDomesticMinutes,
    bool? radarUseLocation,
    String? radarAirport,
    int? radarRadiusKm,
  }) => AppSettings(
    language: language ?? this.language,
    travelMinutes: travelMinutes ?? this.travelMinutes,
    bufferInternationalMinutes: bufferInternationalMinutes ?? this.bufferInternationalMinutes,
    bufferDomesticMinutes: bufferDomesticMinutes ?? this.bufferDomesticMinutes,
    radarUseLocation: radarUseLocation ?? this.radarUseLocation,
    radarAirport: radarAirport ?? this.radarAirport,
    radarRadiusKm: radarRadiusKm ?? this.radarRadiusKm,
  );

  static int _clamp(Object? v, int fallback, int lo, int hi) => v is num ? v.round().clamp(lo, hi) : fallback;

  /// Tolerant of missing / out-of-range values (a settings file must never stop the app from starting).
  factory AppSettings.fromJson(Map<String, dynamic> j) {
    const d = AppSettings();
    final lang = j['language'];
    return AppSettings(
      language: lang is String && languages.contains(lang) ? lang : d.language,
      travelMinutes: _clamp(j['travelMinutes'], d.travelMinutes, 5, 300),
      bufferInternationalMinutes: _clamp(j['bufferInternationalMinutes'], d.bufferInternationalMinutes, 30, 360),
      bufferDomesticMinutes: _clamp(j['bufferDomesticMinutes'], d.bufferDomesticMinutes, 30, 300),
      radarUseLocation: j['radarUseLocation'] is bool ? j['radarUseLocation'] as bool : d.radarUseLocation,
      radarAirport: j['radarAirport'] is String && RegExp(r'^[A-Za-z]{3}$').hasMatch(j['radarAirport'] as String) ? (j['radarAirport'] as String).toUpperCase() : '',
      radarRadiusKm: radarRadii.contains(j['radarRadiusKm']) ? j['radarRadiusKm'] as int : d.radarRadiusKm,
    );
  }

  Map<String, dynamic> toJson() => {
    'language': language,
    'travelMinutes': travelMinutes,
    'bufferInternationalMinutes': bufferInternationalMinutes,
    'bufferDomesticMinutes': bufferDomesticMinutes,
    'radarUseLocation': radarUseLocation,
    'radarAirport': radarAirport,
    'radarRadiusKm': radarRadiusKm,
  };
}
