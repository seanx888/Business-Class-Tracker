# ÆtherSky — mobile app (Flutter · iOS + Android)

航班追蹤 App 的第一版骨架（P0/P1）。計畫與路線圖：[docs/aethersky/PLAN.md](../../docs/aethersky/PLAN.md)。
First scaffold of the flight-tracking app. Plan & roadmap: see the link above.

| 分頁 Tab | 內容 What it does | 資料 Data |
|---|---|---|
| 航班 Flights | **下一班倒數**、即將出發／已完成、新增航班（航班號＋日期，或**貼上訂位確認信批次加入**）、狀態、延誤、登機門、行李轉盤、進度、各機場當地時間；航班頁：艙等／座位／訂位代號、**出門時間與線上報到入口**、**貴賓室資格**、**時差調整計畫**、**抵達地天氣**、**航線地圖**、**分享**、**加入行事曆 (.ics)**；班與班之間顯示**轉機提醒**；右上角 **Passport** 飛行統計（可**補登過去航班**、產生**年度飛行回顧**分享圖）與**設定**（語言、路程、提早到機場時間） | 後端 `flight-lookup`（FlightAware）；未設定時用示範航班 |
| 票價 Fares | Real Tracker 結果、今日商務艙好價；**點一下開 Google Flights / Skyscanner / KAYAK / 航空公司官網** | 與 PWA 相同的 `web/data/trackers.json`、`deals.json` |
| 會員卡 Wallet | 28 個常客計畫（與 PWA 相同）、號碼（遮蔽/顯示/長按複製）、等級、到期；**證件**（護照／簽證到期與行程效期檢查，不存證件號碼） | 手機本機；格式與 PWA 備份相同 |
| 方案 Plans | Free / Pro / Elite 比較（付費牆預覽） | `lib/domain/plans.dart` |

## 執行 Run

```bash
cd apps/mobile
flutter pub get
flutter run                      # 示範資料 demo flights
flutter run \
  --dart-define=AETHER_API_BASE=https://<project>.supabase.co/functions/v1 \
  --dart-define=AETHER_API_KEY=<supabase anon key>   # 真實航班 real flights
flutter analyze && flutter test  # CI: .github/workflows/mobile.yml
```

需要 Flutter 3.47（stable）。No secrets in the app: FlightAware / OAG keys live only in the backend.

## 結構 Structure

```
lib/
  main.dart / app.dart         ProviderScope, GoRouter (4-tab StatefulShellRoute), theme
  core/                        config (--dart-define), format (airport-local times), strings (zh/en/ko), theme
  domain/                      pure Dart, unit-tested:
                               flight (status from out/off/on/in times) · schedule (upcoming/past, refresh policy) · trip (cabin/seat/PNR)
                               itinerary_parser (paste a booking e-mail) · ics (calendar export) · lounge_access (alliance rules)
                               passport (stats) · links (fare deep links) · fares · membership · plans
                               connections (layover risk) · manual_flight · documents (expiry / 6-month rule) · jetlag · geo + route_map
                               departure_plan (when to leave, check-in window) · settings · weather · wrapped (year in review)
                               airlines.g.dart / programs.g.dart — GENERATED from web/core/*.js (npm run gen:dart)
  data/                        flight_repository (API + demo sources), stores (Riverpod notifiers, shared_preferences),
                               external (browser / share sheet seam)
  features/                    flights (+ import, trip info, lounge card) · fares (+ links sheet) · passport · wallet · plans
assets/                        airport-countries.json, airport-geo.json (copies of config/, kept in sync by npm test)
                               world-land.json (route-map outline, scripts/build-land-outline.mjs)
test/                          domain + widget tests; support.dart (pumpApp, fake external actions, injectable clock)
```

## 下一步 Next (P1)

✅ 已完成（P1a／P1b／P1c，免帳號）：下一班倒數、自動刷新、行程資訊、分享／行事曆、貼上訂位信匯入、貴賓室資格、票價一鍵開搜尋、Passport＋補登、轉機助理、證件提醒、時差調整、航線地圖、出門時間、設定、天氣、年度回顧 — 詳見 [PLAN.md §13](../../docs/aethersky/PLAN.md)。

需要帳號／裝置才能完成：
1. Supabase 登入（Apple / Google / Email magic link）→ 航班與追蹤存雲端（`backend/supabase`）
2. 推播：`firebase_messaging`（FCM + APNs）；航班事件由 `aeroapi-webhook` 觸發
3. iOS Live Activity / Dynamic Island（`live_activities` + Swift widget extension）；Android 16 Live Updates
4. 地圖與航跡（AeroAPI track）、inbound 飛機、延誤預測
5. RevenueCat（`purchases_flutter`）接上 Plans；首趟 Elite 試用
6. 在地化改用 ARB（`flutter gen-l10n`）

原生外掛注意：本次新增 `share_plus`、`url_launcher`。已通過 `flutter analyze`、208 個測試、`flutter build web`，以及 Android SDK 36 上的 `flutter build apk --debug`；iOS 建置與兩個平台的實機行為（分享面板、開啟連結）尚未驗證。
