import 'package:flutter/widgets.dart';

import '../domain/airlines.dart' show Alliance;
import '../domain/connections.dart';
import '../domain/documents.dart';
import '../domain/flight.dart';
import '../domain/jetlag.dart';
import '../domain/manual_flight.dart';
import '../domain/trip.dart';
import '../domain/weather.dart';

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

  String get upcoming => _t('即將出發', 'Upcoming', '예정된 항공편');
  String get past => _t('已完成', 'Past flights', '지난 항공편');
  String get nextFlight => _t('下一班', 'Next flight', '다음 항공편');
  String get noUpcoming => _t('沒有即將出發的航班', 'No upcoming flights', '예정된 항공편이 없습니다');

  /// "3 天 4 小時" · "3 小時 20 分" · "45 分" — the two largest units, like the countdown on a boarding pass.
  String span(Duration d) {
    final days = d.inDays;
    final hours = d.inHours % 24;
    final mins = d.inMinutes % 60;
    if (days >= 1) return _t('$days 天${hours > 0 ? ' $hours 小時' : ''}', '${days}d${hours > 0 ? ' ${hours}h' : ''}', '$days일${hours > 0 ? ' $hours시간' : ''}');
    if (d.inHours >= 1) return _t('${d.inHours} 小時${mins > 0 ? ' $mins 分' : ''}', '${d.inHours}h${mins > 0 ? ' ${mins}m' : ''}', '${d.inHours}시간${mins > 0 ? ' $mins분' : ''}');
    final m = d.inMinutes < 1 ? 1 : d.inMinutes;
    return _t('$m 分', '${m}m', '$m분');
  }

  String departsIn(Duration d) => _t('${span(d)}後起飛', 'Departs in ${span(d)}', '${span(d)} 후 출발');
  String arrivesIn(Duration d) => _t('約 ${span(d)}後抵達', 'Lands in ~${span(d)}', '약 ${span(d)} 후 도착');
  String get departingNow => _t('即將起飛', 'Departing now', '곧 출발');

  String get myTrip => _t('我的行程資訊', 'My trip details', '내 여정 정보');
  String get edit => _t('編輯', 'Edit', '편집');
  String get cabin => _t('艙等', 'Cabin', '좌석 등급');
  String get seat => _t('座位', 'Seat', '좌석');
  String get pnr => _t('訂位代號', 'Booking ref', '예약번호');
  String get notes => _t('備註', 'Notes', '메모');
  String get tripHint => _t('填寫艙等後，可判斷你能進哪些貴賓室。', 'Add your cabin to see which lounges you can enter.', '좌석 등급을 입력하면 이용 가능한 라운지를 알려 드립니다.');
  String cabinName(Cabin c) => switch (c) {
        Cabin.economy => _t('經濟艙', 'Economy', '이코노미'),
        Cabin.premium => _t('豪華經濟艙', 'Premium Economy', '프리미엄 이코노미'),
        Cabin.business => _t('商務艙', 'Business', '비즈니스'),
        Cabin.first => _t('頭等艙', 'First', '퍼스트'),
      };

  String get shareFlight => _t('分享航班', 'Share flight', '항공편 공유');
  String get addToCalendar => _t('加入行事曆', 'Add to calendar', '캘린더에 추가');

  String get importItinerary => _t('貼上訂位確認信', 'Paste booking e-mail', '예약 확인 메일 붙여넣기');
  String get importHint => _t('把航空公司或旅行社的確認信／行程內容貼上，自動找出所有航班。', 'Paste an airline or travel-agent confirmation — every flight in it is picked up.', '항공사·여행사 확인 메일을 붙여넣으면 모든 항공편을 찾아 드립니다.');
  String get pasteClipboard => _t('從剪貼簿貼上', 'Paste', '붙여넣기');
  String get analyze => _t('找出航班', 'Find flights', '항공편 찾기');
  String get noneFound => _t('沒有找到航班號碼（需要航空公司代碼＋數字，例如 BR198）', 'No flight numbers found (airline code + number, e.g. BR198)', '편명을 찾지 못했습니다 (항공사 코드+번호, 예: BR198)');
  String get pickDate => _t('選擇日期', 'Pick date', '날짜 선택');
  String get alreadyTracked => _t('已在追蹤', 'Already tracked', '이미 추적 중');
  String get searching => _t('查詢中…', 'Looking up…', '조회 중…');
  String addCount(int n) => _t('加入 $n 個航班', 'Add $n flight${n == 1 ? '' : 's'}', '항공편 $n개 추가');
  String get orPaste => _t('或貼上訂位確認信', 'or paste a booking e-mail', '또는 예약 확인 메일 붙여넣기');

  String get loungeTitle => _t('貴賓室資格', 'Lounge access', '라운지 이용 자격');
  String loungeAt(String iata) => _t('在 $iata 出發時', 'When departing $iata', '$iata 출발 시');
  String allianceName(Alliance a) => switch (a) {
        Alliance.skyteam => _t('天合聯盟', 'SkyTeam', '스카이팀'),
        Alliance.star => _t('星空聯盟', 'Star Alliance', '스타얼라이언스'),
        Alliance.oneworld => _t('寰宇一家', 'oneworld', '원월드'),
        Alliance.none => _t('無聯盟', 'No alliance', '얼라이언스 없음'),
      };
  String loungeOwnCabin(Cabin c, String airline) => _t('${cabinName(c)} · $airline 自家貴賓室', '${cabinName(c)} · $airline lounge', '${cabinName(c)} · $airline 라운지');
  String loungeAllianceCabin(Cabin c, Alliance a) => _t('${cabinName(c)} · ${allianceName(a)}貴賓室', '${cabinName(c)} · ${allianceName(a)} lounges', '${cabinName(c)} · ${allianceName(a)} 라운지');
  String loungeStatus(String program, String? tier, String status, Alliance a, int guests) => _t(
        '$program${tier == null ? '' : ' $tier'}（$status）· ${allianceName(a)}貴賓室${guests > 0 ? '，可攜 $guests 位同行者' : ''}',
        '$program${tier == null ? '' : ' $tier'} ($status) · ${allianceName(a)} lounges${guests > 0 ? ', +$guests guest' : ''}',
        '$program${tier == null ? '' : ' $tier'} ($status) · ${allianceName(a)} 라운지${guests > 0 ? ', 동반 $guests명' : ''}',
      );
  String get loungeNone => _t('依目前的艙等與會員等級，這班沒有自動的貴賓室資格。', 'With your cabin and status, this flight carries no automatic lounge access.', '현재 좌석 등급과 회원 등급으로는 자동 라운지 이용 자격이 없습니다.');
  String loungeNeedTier(String programs) => _t('$programs 尚未填寫等級 — 到「會員卡」補上等級才能判斷。', 'Add your tier for $programs in Wallet to check status access.', '$programs 등급을 지갑에서 입력하면 확인할 수 있습니다.');
  String loungeUnmapped(String programs) => _t('$programs 的聯盟等級對照尚未收錄，請向航空公司確認貴賓室資格。', 'We do not map $programs tiers to alliance status yet — check lounge access with the airline.', '$programs 등급의 얼라이언스 등급 매핑이 아직 없어 항공사에 확인이 필요합니다.');
  String get loungeNoAlliance => _t('這家航空公司不屬於任何聯盟：只有它自己的商務／頭等艙貴賓室。', 'This airline is in no alliance — only its own premium-cabin lounge applies.', '이 항공사는 얼라이언스에 속하지 않아 자사 프리미엄 라운지만 해당됩니다.');
  String get loungeUnknownCarrier => _t('尚未收錄這家航空公司的貴賓室規則。', 'No lounge rules for this airline yet.', '이 항공사의 라운지 규정이 아직 없습니다.');
  String get loungeDisclaimer => _t('依聯盟通則判斷；各貴賓室另有限制（國內線、人數、時段），請以航空公司／機場公告為準。', 'Based on general alliance rules; individual lounges add limits (domestic itineraries, capacity, hours) — confirm with the airline or airport.', '얼라이언스 일반 규정 기준이며 라운지별 제한(국내선, 인원, 시간)이 있을 수 있으니 항공사·공항에 확인하세요.');
  String findLounges(String iata) => _t('查詢 $iata 貴賓室', 'Find lounges at $iata', '$iata 라운지 찾기');

  String get passport => _t('飛行紀錄', 'Passport', '패스포트');
  String get passportEmpty => _t('完成第一趟追蹤的航班後，飛行紀錄會自動累積在這裡。', 'Once a tracked flight is over, your flying stats build up here.', '추적한 항공편이 끝나면 비행 기록이 여기에 쌓입니다.');
  String get statFlights => _t('航班', 'Flights', '항공편');
  String get statDistance => _t('總里程', 'Distance', '총 거리');
  String get statAirtime => _t('飛行時間', 'Time flown', '비행 시간');
  String get statAirports => _t('機場', 'Airports', '공항');
  String get statCountries => _t('國家／地區', 'Countries', '국가/지역');
  String get statAirlines => _t('航空公司', 'Airlines', '항공사');
  String get statTopRoute => _t('最常飛的航線', 'Most flown route', '가장 많이 탄 노선');
  String get statLongest => _t('最長航班', 'Longest flight', '최장 비행');
  String get statByYear => _t('每年航班數', 'Flights per year', '연도별 항공편');
  String earthLaps(double laps) => _t('繞地球 ${laps.toStringAsFixed(2)} 圈', '${laps.toStringAsFixed(2)}× around the Earth', '지구 ${laps.toStringAsFixed(2)}바퀴');
  String get distanceLowerBound => _t('部分航班沒有距離資料，實際更多', 'Some flights have no distance data — the real total is higher', '일부 항공편은 거리 정보가 없어 실제로는 더 많습니다');
  String flightCount(int n) => _t('$n 班', '$n', '$n편');

  String connectionTitle(String airport, Duration layover) =>
      _t('在 $airport 轉機 · ${layover.isNegative ? '—' : span(layover)}', 'Connection at $airport · ${layover.isNegative ? '—' : span(layover)}', '$airport 환승 · ${layover.isNegative ? '—' : span(layover)}');
  String connectionRisk(ConnectionRisk r) => switch (r) {
        ConnectionRisk.ok => _t('時間充裕', 'Plenty of time', '여유 있음'),
        ConnectionRisk.tight => _t('時間偏緊', 'Tight', '촉박'),
        ConnectionRisk.critical => _t('非常趕', 'Very tight', '매우 촉박'),
        ConnectionRisk.missed => _t('已來不及', 'Missed', '놓침'),
      };
  String terminalChangeText(String from, String to) => _t('需換航廈 T$from → T$to', 'Change terminals T$from → T$to', '터미널 이동 T$from → T$to');
  String delayShrunk(Duration d) => _t('延誤已讓轉機縮短 ${span(d)}', 'Delay has cut the connection by ${span(d)}', '지연으로 환승 시간이 ${span(d)} 줄었습니다');
  String get connectionMissedAdvice => _t('後一班會在你降落前起飛，請儘快聯絡航空公司改訂。', 'The next flight leaves before you land — contact the airline about rebooking now.', '다음 항공편이 도착 전에 출발합니다. 항공사에 재예약을 문의하세요.');
  String get connectionCriticalAdvice => _t('下機後直奔登機門；不確定就先向地勤確認。', 'Head straight to the gate on landing; ask ground staff if unsure.', '착륙 후 바로 게이트로 이동하고, 불확실하면 지상직원에게 확인하세요.');

  String get manualTitle => _t('補登過去航班', 'Add a past flight', '지난 항공편 추가');
  String get manualHint => _t('沒有即時資料的舊航班也能算進飛行紀錄；里程以大圓距離估算，只記日期。', 'Old flights without live data still count toward your Passport; distance is the great-circle estimate and only the day is stored.', '실시간 데이터가 없는 지난 항공편도 기록에 포함됩니다. 거리는 대권 거리로 추정하며 날짜만 저장합니다.');
  String get manualAdd => _t('或補登過去的航班', 'or add a past flight', '또는 지난 항공편 추가');
  String get fromAirport => _t('出發機場代碼', 'From (airport code)', '출발 공항 코드');
  String get toAirport => _t('抵達機場代碼', 'To (airport code)', '도착 공항 코드');
  String get saveAndAnother => _t('儲存並再補一班', 'Save & add another', '저장 후 계속 추가');
  String manualSaved(String ident) => _t('已補登 $ident', 'Added $ident', '$ident 추가됨');
  String get manualBadge => _t('手動補登', 'Added by hand', '직접 추가');
  String get estimatedTime => _t('估算', 'estimated', '추정');
  String manualError(ManualFlightError e) => switch (e) {
        ManualFlightError.badNumber => badNumber,
        ManualFlightError.unknownOrigin => _t('找不到出發機場代碼', 'Unknown departure airport code', '출발 공항 코드를 찾을 수 없습니다'),
        ManualFlightError.unknownDestination => _t('找不到抵達機場代碼', 'Unknown arrival airport code', '도착 공항 코드를 찾을 수 없습니다'),
        ManualFlightError.sameAirport => _t('出發與抵達機場不能相同', 'Departure and arrival must differ', '출발과 도착 공항이 같을 수 없습니다'),
        ManualFlightError.notPast => _t('請選擇昨天以前的日期（今天與未來的航班請用查詢）', 'Pick a date before today (today and future flights use the normal lookup)', '어제 이전 날짜를 선택하세요 (오늘·미래 항공편은 조회를 사용)'),
      };

  String get docsTitle => _t('證件', 'Travel documents', '여행 서류');
  String get docsHint => _t('只存類型、持有人與到期日，不存證件號碼。', 'Only type, holder and expiry date — never a document number.', '종류·소지자·만료일만 저장하며 서류 번호는 저장하지 않습니다.');
  String get addDoc => _t('新增證件', 'Add document', '서류 추가');
  String get holder => _t('持有人', 'Holder', '소지자');
  String get countryCode => _t('國家代碼（2 碼，例 TW）', 'Country code (2 letters, e.g. TW)', '국가 코드 (2자, 예: TW)');
  String get docCountryHint => _t('護照／身分證：發證國；簽證：可入境的國家', 'Passport / ID: issuing country · Visa: country it admits you to', '여권/신분증: 발급국 · 비자: 입국 가능 국가');
  String get expiryDate => _t('到期日', 'Expiry date', '만료일');
  String get noDocs => _t('還沒有證件', 'No documents yet', '서류가 없습니다');
  String docKindName(DocKind k) => switch (k) {
        DocKind.passport => _t('護照', 'Passport', '여권'),
        DocKind.visa => _t('簽證', 'Visa', '비자'),
        DocKind.idCard => _t('身分證／居留證', 'ID / residence card', '신분증/거소증'),
        DocKind.other => _t('其他', 'Other', '기타'),
      };
  String docLeft(int days) => days < 0
      ? _t('已過期 ${-days} 天', 'Expired ${-days} days ago', '${-days}일 전 만료')
      : (days == 0 ? _t('今天到期', 'Expires today', '오늘 만료') : _t('$days 天後到期', 'Expires in $days days', '$days일 후 만료'));
  String docIssueText(DocIssue i, String Function(String) place) {
    final who = '${docKindName(i.doc.kind)} ${i.doc.holder}'.trim();
    final on = i.doc.expiry.toIso8601String().substring(0, 10);
    final where = i.country == null ? '' : place(i.country!);
    final ident = i.flight?.ident ?? '';
    return switch (i.kind) {
      DocIssueKind.expired => _t('$who 已過期（$on）', '$who has expired ($on)', '$who 만료됨 ($on)'),
      DocIssueKind.expiringSoon => _t('$who 將於 $on 到期', '$who expires on $on', '$who $on 만료 예정'),
      DocIssueKind.passportExpiredByTrip => _t('$who 在抵達 $where（$ident）前就會到期（$on）', '$who expires ($on) before you reach $where ($ident)', '$who 이(가) $where 도착($ident) 전에 만료됩니다 ($on)'),
      DocIssueKind.passportUnderSixMonths => _t('$who 於 $on 到期，前往 $where（$ident）時效期不足 6 個月，許多國家會拒絕入境', '$who expires $on — under 6 months left on arrival in $where ($ident); many countries refuse entry', '$who $on 만료 — $where($ident) 도착 시 6개월 미만, 입국이 거부될 수 있습니다'),
      DocIssueKind.visaExpiredByTrip => _t('$where 簽證（$who）在 $ident 抵達前就會到期（$on）', '$where visa ($who) expires ($on) before $ident lands', '$where 비자($who)가 $ident 도착 전에 만료됩니다 ($on)'),
    };
  }

  String get jetLagTitle => _t('時差調整', 'Jet lag plan', '시차 적응');
  String jetLagSummary(JetLagPlan p) {
    final dir = p.direction == JetLagDirection.east ? _t('往東', 'Eastbound', '동쪽으로') : _t('往西', 'Westbound', '서쪽으로');
    return _t('$dir ${p.hours} 小時時差 · 約需 ${p.recoveryDays} 天適應', '$dir · ${p.hours} h shift · about ${p.recoveryDays} days to adjust', '$dir ${p.hours}시간 · 적응 약 ${p.recoveryDays}일');
  }

  String jetLagTip(JetLagTip tip, JetLagPlan p) {
    final east = p.direction == JetLagDirection.east;
    return switch (tip) {
      JetLagTip.shiftBedtimeBefore => _t(
          '出發前 ${p.preDays} 天起，每天把就寢與起床時間${east ? '提早' : '延後'} 1 小時。',
          'From ${p.preDays} days before, move bedtime and wake-up ${east ? 'earlier' : 'later'} by 1 h each day.',
          '출발 ${p.preDays}일 전부터 취침·기상 시간을 매일 1시간씩 ${east ? '앞당기' : '늦추'}세요.'),
      JetLagTip.destinationTimeOnBoard => _t('上機就把手錶與手機調成目的地時間，照當地時間吃飯與睡覺。', 'Set your watch to destination time on boarding and eat and sleep by it.', '탑승하면 시계를 도착지 시간으로 맞추고 그 시간에 맞춰 식사·수면하세요.'),
      JetLagTip.stayAwakeUntilBedtime => _t('抵達後撐到當地就寢時間；要小睡的話不超過 30 分鐘、下午 3 點前。', 'Stay up until local bedtime; if you nap, keep it under 30 min and before 3 pm.', '현지 취침 시간까지 깨어 있고, 낮잠은 오후 3시 전 30분 이내로 하세요.'),
      JetLagTip.sleepOnLocalTime => _t('抵達時已近當地夜晚：直接依當地時間就寢，即使不太睏。', 'You land close to local night — go to bed on local time even if you do not feel tired.', '현지 밤에 가까운 시각에 도착합니다. 졸리지 않아도 현지 시간에 잠자리에 드세요.'),
      JetLagTip.seekMorningLight => _t('到達後幾天，早上多曬太陽（戶外自然光），幫助生理時鐘提前。', 'For the first days get bright light in the local morning to pull your body clock earlier.', '도착 후 며칠간 아침에 밝은 빛을 쬐어 생체시계를 앞당기세요.'),
      JetLagTip.seekEveningLight => _t('傍晚到入夜前多接觸明亮光線，幫助生理時鐘延後。', 'Get bright light in the late afternoon and evening to push your body clock later.', '늦은 오후~저녁에 밝은 빛을 쬐어 생체시계를 늦추세요.'),
      JetLagTip.avoidEarlyLightFirstDays => _t('時差很大的東行：前兩天早上 10 點前避免強光（可戴墨鏡），改在下午曬太陽。', 'Big eastward shift: for two days avoid bright light before 10 am (sunglasses help) and take it in the afternoon instead.', '큰 동향 시차: 처음 이틀은 오전 10시 전 강한 빛을 피하고(선글라스) 오후에 빛을 쬐세요.'),
      JetLagTip.limitCaffeine => _t('當地就寢前 6 小時內不要咖啡因。', 'No caffeine in the 6 hours before local bedtime.', '현지 취침 6시간 전부터는 카페인을 피하세요.'),
    };
  }

  String get jetLagDisclaimer => _t('一般性睡眠建議，非醫療意見；有睡眠或健康問題請諮詢醫師。', 'General sleep guidance, not medical advice — ask a clinician if you have sleep or health concerns.', '일반적인 수면 조언이며 의료 조언이 아닙니다. 건강 문제가 있으면 의사와 상담하세요.');

  String get departureTitle => _t('出發時間表', 'When to leave', '출발 준비');
  String leaveHomeAt(String time) => _t('$time 出門', 'Leave at $time', '$time 출발');
  String arriveAirportAt(String time) => _t('$time 到機場', 'At the airport by $time', '$time까지 공항 도착');
  String departsAtTime(String time) => _t('$time 起飛', 'Departs $time', '$time 이륙');
  String bufferNote(Duration buffer, Duration travel, bool intl) => _t(
      '${intl ? '國際線' : '國內線'}提前 ${span(buffer)} · 路程 ${span(travel)}（可在設定或行程資訊調整）',
      '${intl ? 'International' : 'Domestic'}: ${span(buffer)} before departure · ${span(travel)} journey (change in Settings or trip details)',
      '${intl ? '국제선' : '국내선'} ${span(buffer)} 전 도착 · 이동 ${span(travel)} (설정 또는 여정 정보에서 변경)');
  String get travelToAirport => _t('到機場所需時間（分鐘）', 'Journey to the airport (min)', '공항까지 소요 시간(분)');
  String travelOverrideHint(int defaultMinutes) => _t('留空 = 使用設定的 $defaultMinutes 分鐘', 'Blank = the default of $defaultMinutes min from Settings', '비워 두면 설정의 $defaultMinutes분 사용');
  String get checkInTitle => _t('線上報到', 'Online check-in', '온라인 체크인');
  String get checkInHint => _t('多數航空公司在起飛前 24–48 小時開放線上報到（依航空公司而異）。', 'Most airlines open online check-in 24–48 h before departure (it varies by airline).', '대부분의 항공사는 출발 24–48시간 전에 온라인 체크인을 엽니다(항공사별 상이).');
  String checkInAt(String airline) => _t('前往 $airline 官網報到', 'Check in on the $airline website', '$airline 웹사이트에서 체크인');

  String get settings => _t('設定', 'Settings', '설정');
  String get languageSetting => _t('語言', 'Language', '언어');
  String get languageSystem => _t('跟隨手機', 'System', '시스템');
  String get airportTimeSettings => _t('到機場的時間', 'Getting to the airport', '공항 이동');
  String get bufferInternationalSetting => _t('國際線：提前到機場', 'International: be at the airport before departure', '국제선: 출발 전 공항 도착');
  String get bufferDomesticSetting => _t('國內線：提前到機場', 'Domestic: be at the airport before departure', '국내선: 출발 전 공항 도착');
  String minutes(int n) => _t('$n 分鐘', '$n min', '$n분');

  String weatherTitle(String city) => _t('抵達地天氣 · $city', 'Weather on arrival · $city', '도착지 날씨 · $city');
  String weatherKind(WeatherKind k) => switch (k) {
        WeatherKind.clear => _t('晴', 'Clear', '맑음'),
        WeatherKind.partlyCloudy => _t('多雲時晴', 'Partly cloudy', '구름 조금'),
        WeatherKind.cloudy => _t('陰', 'Overcast', '흐림'),
        WeatherKind.fog => _t('霧', 'Fog', '안개'),
        WeatherKind.drizzle => _t('毛毛雨', 'Drizzle', '이슬비'),
        WeatherKind.rain => _t('雨', 'Rain', '비'),
        WeatherKind.showers => _t('陣雨', 'Showers', '소나기'),
        WeatherKind.snow => _t('雪', 'Snow', '눈'),
        WeatherKind.thunder => _t('雷雨', 'Thunderstorm', '뇌우'),
      };
  String precipChance(int pct) => _t('降雨機率 $pct%', '$pct% chance of rain', '강수확률 $pct%');
  String get bringUmbrella => _t('記得帶傘', 'Pack an umbrella', '우산을 챙기세요');
  String get weatherCredit => _t('天氣資料：Open-Meteo.com', 'Weather data by Open-Meteo.com', '날씨 데이터: Open-Meteo.com');

  String get wrappedEntry => _t('年度飛行回顧', 'Year in review', '올해의 비행 회고');
  String wrappedYear(int y) => _t('$y 年', '$y', '$y년');
  String wrappedFlightsLabel(int n) => _t('趟飛行', n == 1 ? 'flight' : 'flights', '번 비행');
  String wrappedHours(int h) => _t('$h 小時在空中', '$h hours in the air', '하늘에서 $h시간');
  String wrappedAroundEarth(double laps) => laps >= 0.1 ? earthLaps(laps) : '';
  String wrappedBusiest(String month, int n) => _t('最忙的月份　$month（$n 趟）', 'Busiest month  $month ($n)', '가장 바쁜 달  $month ($n)');
  String get wrappedTopRoute => _t('最常飛', 'Most flown', '가장 많이 탄 노선');
  String get wrappedTopAirline => _t('最常搭乘', 'Most flown airline', '가장 많이 탄 항공사');
  String wrappedCountries(int n) => _t('$n 個國家／地區', n == 1 ? '1 country' : '$n countries', '$n개 국가/지역');
  String get shareImage => _t('分享圖片', 'Share image', '이미지 공유');
  String wrappedShareText(int year, int flights, String km) => _t('我的 $year 飛行回顧：$flights 趟、$km km — ÆtherSky', 'My $year in the air: $flights flights, $km km — ÆtherSky', '나의 $year 비행 회고: $flights번, $km km — ÆtherSky');
  String get wrappedEmpty => _t('這一年還沒有完成的航班。', 'No completed flights in this year yet.', '이 해에는 완료된 항공편이 없습니다.');

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
