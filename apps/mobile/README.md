# ÆtherSky — mobile app (Flutter · iOS + Android)

航班追蹤 App 的第一版骨架（P0/P1）。計畫與路線圖：[docs/aethersky/PLAN.md](../../docs/aethersky/PLAN.md)。
First scaffold of the flight-tracking app. Plan & roadmap: see the link above.

| 分頁 Tab | 內容 What it does | 資料 Data |
|---|---|---|
| 航班 Flights | **下一班倒數**、即將出發／已完成、新增航班（航班號＋日期，或**貼上訂位確認信批次加入**）、狀態、延誤、登機門、行李轉盤、進度、各機場當地時間；航班頁：艙等／座位／訂位代號、**出門時間與線上報到入口**、**貴賓室資格**、**時差調整計畫**、**抵達地天氣**、**航線地圖**、**分享**、**加入行事曆 (.ics)**；班與班之間顯示**轉機提醒**；右上角 **Passport** 飛行統計（可**補登過去航班**、產生**年度飛行回顧**分享圖、**飛行日誌**：機型／航空公司／艙等統計、評分、心得、機上餐照片、CSV 匯出）與**設定**（語言、路程、提早到機場時間） | 後端 `flight-lookup`（FlightAware）；未設定時用示範航班 |
| 雷達 Radar | **附近航班（Lite）**：以我的位置或機場為中心、半徑 25／50／100 km；清單與天空平面圖、頭頂航班、機型／高度／速度、一鍵追蹤或在 Flightradar24 查看；15 秒更新 | 社群 ADS-B（adsb.lol、adsb.fi，ODbL）；座標四捨五入到約 1 公里，不上傳、不儲存 |
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

## 網頁版預覽 Web preview（Vercel）

Flutter 網頁版部署在**獨立的** Vercel 專案 `aethersky-app`（與放 PWA 的 `aethersky` 專案分開，兩者互不影響）。
The Flutter web build lives in its own Vercel project `aethersky-app`, separate from the PWA project `aethersky`.

| 設定 Setting | 值 Value |
|---|---|
| Git | `seanx888/aethersky`，Production Branch = `main`（merge 後自動部署；其他 branch 為 Preview，需登入 Vercel 才能看） |
| Root Directory | `apps/mobile` |
| Install Command | `git clone --depth 1 -b 3.47.5 https://github.com/flutter/flutter.git /tmp/flutter && /tmp/flutter/bin/flutter config --no-analytics && /tmp/flutter/bin/flutter pub get` |
| Build Command | `/tmp/flutter/bin/flutter build web --release` |
| Output Directory | `build/web` |
| Ignored Build Step | `git diff --quiet HEAD^ HEAD -- .`（只有 `apps/mobile` 有變動才建置；每天的票價資料 commit 不會觸發） |

- Vercel 的建置環境沒有 Flutter，所以每次建置都會先下載 SDK（約 1–2 分鐘）。**升級 Flutter 版本時，要同步改 Install Command 的 `3.47.5`、`.github/workflows/mobile.yml`。**
- 網頁版是示範資料（沒有設 `AETHER_API_BASE`）。網址使用 hash 路由（`/#/flights`），不需要 rewrite 規則。
- 網頁版限制：瀏覽器擋下 ADS-B 資料來源（CORS），雷達顯示「請改用手機 App」；沒有檔案儲存，日誌照片功能自動隱藏。
- 手動重新部署：Vercel → `aethersky-app` → Deployments → 該筆 → ⋯ → Redeploy。

## 結構 Structure

```
lib/
  main.dart / app.dart         ProviderScope, GoRouter (5-tab StatefulShellRoute), theme
  core/                        config (--dart-define), format (airport-local times), strings (zh/en/ko), theme
  domain/                      pure Dart, unit-tested:
                               flight (status from out/off/on/in times) · schedule (upcoming/past, refresh policy) · trip (cabin/seat/PNR)
                               itinerary_parser (paste a booking e-mail) · ics (calendar export) · lounge_access (alliance rules)
                               passport (stats) · links (fare deep links) · fares · membership · plans
                               connections (layover risk) · manual_flight · documents (expiry / 6-month rule) · jetlag · geo + route_map
                               departure_plan (when to leave, check-in window) · settings · weather · wrapped (year in review)
                               nearby + callsign + aircraft_types (Radar Lite: ADS-B parsing, distance/bearing, EVA198 → BR198) · logbook (stats, CSV)
                               airlines.g.dart / programs.g.dart — GENERATED from web/core/*.js (npm run gen:dart)
  data/                        flight_repository (API + demo sources), stores (Riverpod notifiers, shared_preferences),
                               external (browser / share sheet seam), aircraft_source (ADS-B), location_service, photo_service
  features/                    flights (+ import, trip info, lounge card) · radar (Radar Lite) · logbook · fares (+ links sheet) · passport · wallet · plans
assets/                        airport-countries.json, airport-geo.json (copies of config/, kept in sync by npm test)
                               world-land.json (route-map outline, scripts/build-land-outline.mjs)
test/                          domain + widget tests; support.dart (pumpApp, fake external actions, injectable clock)
```

## 下一步 Next (P1)

✅ 已完成（P1a／P1b／P1c／P1d，免帳號）：下一班倒數、自動刷新、行程資訊、分享／行事曆、貼上訂位信匯入、貴賓室資格、票價一鍵開搜尋、Passport＋補登、轉機助理、證件提醒、時差調整、航線地圖、出門時間、設定、天氣、年度回顧、附近航班雷達、飛行日誌 — 詳見 [PLAN.md §13](../../docs/aethersky/PLAN.md)。

需要帳號／裝置才能完成：
1. Supabase 登入（Apple / Google / Email magic link）→ 航班與追蹤存雲端（`backend/supabase`）
2. 推播：`firebase_messaging`（FCM + APNs）；航班事件由 `aeroapi-webhook` 觸發
3. iOS Live Activity / Dynamic Island（`live_activities` + Swift widget extension）；Android 16 Live Updates
4. 地圖與航跡（AeroAPI track）、inbound 飛機、延誤預測
5. RevenueCat（`purchases_flutter`）接上 Plans；首趟 Elite 試用
6. 在地化改用 ARB（`flutter gen-l10n`）

原生外掛注意：本次新增 `share_plus`、`url_launcher`。已通過 `flutter analyze`、208 個測試、`flutter build web`，以及 Android SDK 36 上的 `flutter build apk --debug`；iOS 建置與兩個平台的實機行為（分享面板、開啟連結）尚未驗證。
