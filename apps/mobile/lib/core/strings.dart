import 'package:flutter/widgets.dart';

import '../domain/flight.dart';

/// UI strings in 繁體中文 (default) · English · 한국어 — same three languages as the PWA.
/// A small table keeps the scaffold dependency-free; move to ARB files (flutter gen-l10n) when it grows.
class S {
  const S(this.lang);
  final String lang; // zh · en · ko

  static S of(BuildContext context) {
    final code = Localizations.maybeLocaleOf(context)?.languageCode ?? 'zh';
    return S(const {'en', 'ko'}.contains(code) ? code : 'zh');
  }

  String get locale => const {'zh': 'zh_TW', 'en': 'en_US', 'ko': 'ko_KR'}[lang]!;

  /// Language tag used by the metasearch deep links (same values as the PWA).
  String get linkLang => const {'zh': 'zh-TW', 'en': 'en', 'ko': 'ko'}[lang]!;

  String _t(String zh, String en, String ko) => lang == 'en' ? en : lang == 'ko' ? ko : zh;

  String get tabFlights => _t('航班', 'Flights', '항공편');
  String get tabFares => _t('票價', 'Fares', '운임');
  String get tabWallet => _t('會員卡', 'Wallet', '회원카드');
  String get tabPlans => _t('方案', 'Plans', '요금제');

  String get myFlights => _t('我的航班', 'My flights', '내 항공편');
  String get addFlight => _t('新增航班', 'Add flight', '항공편 추가');
  String get flightNumber => _t('航班號碼（例：BR198）', 'Flight number (e.g. BR198)', '편명 (예: BR198)');
  String get date => _t('日期', 'Date', '날짜');
  String get find => _t('查詢', 'Find', '조회');
  String get add => _t('加入追蹤', 'Track this flight', '추적하기');
  String get notFound => _t('找不到這個航班', 'Flight not found', '항공편을 찾을 수 없습니다');
  String get badNumber => _t('請輸入航空公司代碼＋數字，例如 BR198', 'Enter airline code + number, e.g. BR198', '항공사 코드+번호를 입력하세요 (예: BR198)');
  String get noFlights => _t('還沒有追蹤的航班', 'No flights yet', '추적 중인 항공편이 없습니다');
  String get noFlightsHint => _t('輸入航班號碼，起降、延誤、登機門變更都會即時通知。', 'Add a flight number to get live departure, delay and gate updates.', '편명을 추가하면 출발·지연·게이트 변경을 실시간으로 알려 드립니다.');
  String get tryDemo => _t('試試看：', 'Try: ', '예시: ');
  String get demoData => _t('示範資料 — 後端串接 FlightAware 後顯示真實動態', 'Demo data — live status once the FlightAware backend is connected', '데모 데이터 — FlightAware 백엔드 연결 후 실시간 표시');
  String get remove => _t('移除', 'Remove', '삭제');

  String get departure => _t('出發', 'Departure', '출발');
  String get arrival => _t('抵達', 'Arrival', '도착');
  String get scheduled => _t('表定', 'Scheduled', '예정');
  String get estimated => _t('預估', 'Estimated', '예상');
  String get actual => _t('實際', 'Actual', '실제');
  String get terminal => _t('航廈', 'Terminal', '터미널');
  String get gate => _t('登機門', 'Gate', '게이트');
  String get baggage => _t('行李轉盤', 'Baggage', '수하물');
  String get aircraft => _t('機型', 'Aircraft', '기종');
  String get registration => _t('機號', 'Registration', '등록번호');
  String get distance => _t('距離', 'Distance', '거리');
  String get blockTime => _t('總飛行時間', 'Block time', '총 소요 시간');
  String get dataSource => _t('資料來源', 'Source', '출처');
  String get takeoff => _t('起飛', 'Takeoff', '이륙');
  String get landing => _t('降落', 'Landing', '착륙');

  String phase(FlightPhase p) => switch (p) {
        FlightPhase.scheduled => _t('準時', 'On time', '정시'),
        FlightPhase.delayed => _t('延誤', 'Delayed', '지연'),
        FlightPhase.departed => _t('已離開登機門', 'Departed gate', '게이트 출발'),
        FlightPhase.enRoute => _t('飛行中', 'In the air', '비행 중'),
        FlightPhase.landed => _t('已降落', 'Landed', '착륙'),
        FlightPhase.arrived => _t('已抵達', 'Arrived', '도착'),
        FlightPhase.cancelled => _t('已取消', 'Cancelled', '결항'),
        FlightPhase.diverted => _t('改降', 'Diverted', '회항'),
      };

  String late(int minutes) => minutes >= 0
      ? _t('晚 $minutes 分', '$minutes min late', '$minutes분 지연')
      : _t('早 ${-minutes} 分', '${-minutes} min early', '${-minutes}분 일찍');

  String get fareTrackers => _t('即時追蹤（Real Tracker）', 'Real Tracker', '실시간 추적');
  String get fareTrackersHint => _t('在 ÆtherSky 網頁版建立的追蹤，每天 05:40 更新。', 'Trackers created in the ÆtherSky web app, updated daily at 05:40.', 'ÆtherSky 웹에서 만든 추적, 매일 05:40 업데이트.');
  String get topDeals => _t('今日商務艙好價', 'Today’s business-class deals', '오늘의 비즈니스석 특가');
  String get noTrackers => _t('還沒有追蹤資料', 'No tracker results yet', '추적 결과가 없습니다');
  String get loadFail => _t('無法載入', 'Could not load', '불러올 수 없습니다');
  String get retry => _t('重試', 'Retry', '다시 시도');
  String get targetHit => _t('已達目標價', 'Target reached', '목표가 도달');
  String get nonstop => _t('直飛', 'Nonstop', '직항');
  String stops(int n) => _t('$n 轉', '$n stop${n > 1 ? 's' : ''}', '$n회 경유');
  String flex(int n) => _t('±$n 天', '±$n days', '±$n일');
  String vsLast(String v) => _t('較前次 $v', '$v vs last', '지난번 대비 $v');

  String get wallet => _t('會員卡夾', 'Member wallet', '회원카드 지갑');
  String get walletHint => _t('只存在這支手機。號碼點一下顯示、長按複製。', 'Stored on this phone only. Tap to reveal, long-press to copy.', '이 휴대폰에만 저장됩니다. 탭하면 표시, 길게 누르면 복사.');
  String get addMembership => _t('新增會員卡', 'Add membership', '회원카드 추가');
  String get program => _t('會員計畫', 'Program', '프로그램');
  String get memberNumber => _t('會員號碼', 'Member number', '회원 번호');
  String get owner => _t('持卡人', 'Member', '회원');
  String get tier => _t('等級', 'Tier', '등급');
  String get save => _t('儲存', 'Save', '저장');
  String get cancel => _t('取消', 'Cancel', '취소');
  String get copied => _t('已複製', 'Copied', '복사됨');
  String get noMemberships => _t('還沒有會員卡', 'No memberships yet', '회원카드가 없습니다');
  String expiresIn(int d) => d < 0 ? _t('等級已到期', 'Status expired', '등급 만료') : _t('$d 天後到期', 'Expires in $d days', '$d일 후 만료');

  String get openSearch => _t('開啟搜尋', 'Open search', '검색 열기');
  String get airlineSite => _t('航空公司官網', 'Airline website', '항공사 웹사이트');
  String get openFail => _t('無法開啟連結', 'Could not open the link', '링크를 열 수 없습니다');
  String get fareHint => _t('票價為掃描當下的參考價，訂票前請再確認。', 'Fares are snapshots — confirm before booking.', '운임은 조회 시점 기준이므로 예약 전 확인하세요.');

  String get plans => _t('ÆtherSky 方案', 'ÆtherSky plans', 'ÆtherSky 요금제');
  String get plansHint => _t('競品免費的功能，我們一律免費。第一趟旅程送 Elite 全功能。', 'Everything competitors give away is free here too. Your first trip includes every Elite feature.', '경쟁 앱이 무료로 주는 기능은 모두 무료. 첫 여행은 Elite 전체 기능 제공.');
  String get perYear => _t('/ 年', '/ year', '/ 년');
  String get perMonth => _t('/ 月', '/ month', '/ 월');
  String get free => _t('免費', 'Free', '무료');
  String get comingSoon => _t('訂閱即將開放', 'Subscriptions coming soon', '구독 준비 중');
}
