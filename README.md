# ÆtherSky · 商務艙雷達 ✈️

> **ÆtherSky** 是這個專案的新名字：票價雷達（本 PWA）＋ Real Tracker 價格追蹤 ＋ 會員卡夾，
> 並規劃成 iOS + Android 的航班追蹤 App（對標 Flighty）→ 計畫書 **[docs/aethersky/PLAN.md](docs/aethersky/PLAN.md)**。
> ÆtherSky is the new name: fare radar PWA + real-time price trackers + member wallet, growing into a cross-platform flight-tracking app.

每天自動掃描**台北 (TPE) 與鄰近外站 (ICN / BKK / SGN / HAN / MNL / KUL / SIN / NRT / CGK)** 出發的便宜商務艙，
**完全排除中國大陸／香港／澳門的航空公司與轉機點**，天合聯盟 (SkyTeam) 優先。可安裝在手機主畫面的 PWA。

A PWA that scans cheap **business-class** fares every day from Taipei and nearby "ex-stations", **completely excluding
carriers based in, and connections through, mainland China / Hong Kong / Macau**. SkyTeam is ranked first.
China Airlines (CI, 中華航空) is Taiwanese and fully supported.

---

## 功能 Features

| | 功能 | Feature |
|---|---|---|
| 🔥 | 今日好價：依「綜合評分」排序，標示 超值／很划算／不錯 | Daily deal feed ranked by a frequent-flyer score |
| 🛡 | 中/港/澳 零容忍過濾（航空公司＋機場＋技術停留＋代碼共享實際營運者）| Zero-tolerance China/HK/Macau filter (carrier, operator, airport, tech stop) |
| 💺 | 傳統航空與 LCC 廉航分開顯示，預設只看傳統航空（一鍵切換 LCC／全部）| Full-service vs LCC kept apart; full-service by default |
| 🟦 | 天合聯盟優先（價格仍為主，價格相近時天合排前面；可調強弱）| SkyTeam first — nudges ranking without overriding price |
| 🔁 | 外站票比價：外站票 + 定位機票 vs 台北出發，標示「經台北可停留」四段票 | Ex-station calculator incl. positioning cost & Taipei-stopover (4-coupon) candidates |
| 🌏 | 外國站結帳：把當日最佳票價拿到其他國家網站（當地幣別）比價，換算台幣標出更便宜的國家 | Foreign-site checkout: best fares re-priced in other countries' markets, converted to TWD |
| 🛏 | 平躺座椅、直飛、混艙、過夜轉機、廉航商務、疑似錯誤票價 標記 | Lie-flat, nonstop, mixed-cabin, overnight layover, budget-biz and error-fare flags |
| 🎯 | **Real Tracker**：自訂航點＋指定日期或彈性日期（±1–7 天）、艙等、轉機；每天查價，降價／更便宜日期／達標價時寄 **Email**＋推播（像 Google Flights）| Real Tracker: exact or ±N-day flexible dates, cabin, stops; daily checks with Google-Flights-style e-mail + push alerts |
| 🔎 | **航線追蹤 → 搜尋**：像 Google Flights 的查詢（來回／單程／**多段票最多 5 段**、艙等預設商務、轉機、聯盟、指定航空公司、乘客、行李）；**搜尋時直接設定追蹤**（目標價、彈性日期、通知、每天比價各國結帳）；結果可補齊多段行程、**比較哪個國家結帳最便宜** | Search like Google Flights — round trip, one way, multi-city (≤5 legs), cabin (business default), stops, alliance, airlines, passengers, bags — and set up a tracker in the same form; complete multi-city trips and compare which country is cheapest to pay in |
| 🧭 | **今日好價 → 社群情報**：自動整理 Fly4free / Travel-Dealz / The Flight Deal / PTT… 的低票價、外站票、多段票、聯運、停留點、錯誤票價，標出玩法；Facebook 貼文用「**貼上貼文**」解析 | Social-source deals (error fares, ex-station, multi-city, interline, stopovers) auto-collected and tagged with the trick; “paste a post” reads Facebook / LINE / PTT text |
| 📣 | **今日好價 → 活動**：航空與**飯店集團**（也含郵輪、租車）的票價折扣、指定航線促銷、**會籍 Match**、里程加碼、兌換優惠；有你會員的排最前、顯示期限；新活動推播／Email | Airline **and hotel-group** promotions — fare sales, route promos, **status matches**, bonus miles — with deadlines, your programs first, and push / e-mail alerts |
| 🧪 | **特殊票價 → 玩法庫**：外站票、聯運多段票（阿提哈德範例）、停留點、錯誤票價、外國站結帳、隱藏城市的邏輯／步驟／風險＋**成本試算** | Playbooks for each special ticketing trick: logic, steps, risks, worked example and a total-cost calculator |
| 💳 | **會員卡夾**：航空、**飯店、租車**會員的號碼、等級、到期、里程；只存本機，可匯出備份；好價詳情顯示「可累積到你的會員」，並列出與你會員相關的活動 | Member wallet for airline, **hotel and car** programs (on-device), “earn with your memberships” on each deal and promotions for programs you hold |
| 📈 | 航線價格歷史、30 天／歷史最低、目標價提醒 | Per-route price history, 30-day/all-time lows, target-price alerts |
| 🔗 | 一鍵開啟 Google Flights / Skyscanner / KAYAK / 航空公司官網（商務艙預設）| One-tap deep links, business cabin pre-selected |
| ☁️ | Vercel 託管，資料每天由 GitHub Actions 更新、App 直接讀取 | Hosted on Vercel; data refreshed daily from the repo |
| 🔔 | （目前暫停）ntfy 每日推播：USERA、USERB 各自的語言；個人目標價只推給本人 | ntfy daily push per person, in each person's language; personal price targets |
| 🌏 | 預設繁體中文（可切換 English / 한국어），深色／淺色，離線可用 | Defaults to zh-TW (EN / KO selectable), dark/light, offline |

---

## 快速開始 Quick start

👉 **全部金鑰／Secrets 一覽與重設步驟：[docs/SECRETS.md](docs/SECRETS.md)**；各功能詳細說明：**[docs/SETUP.md](docs/SETUP.md)**（繁中 + English，給 USERA & USERB）。 Full step-by-step guide.

**App：https://aethersky.bluechiou.com**（Vercel 託管；每日資料直接從本 repo 讀取，不需重新部署）

1. ✅ PR 已合併、預設分支 `main`；✅ Vercel 專案已建立
2. GitHub Secret `SERPAPI_KEY`（<https://serpapi.com>，免費 250 次/月）— 不設定則顯示示範資料 demo
3. GitHub Secret `NTFY_TOPICS` = `family=<共用主題>@zh-TW`（兩人在 ntfy App 訂閱同一個主題；目前暫停，Variable `NOTIFICATIONS=on` 開啟）
4. **Actions → Daily fare scan & deploy → Run workflow**，之後每天台北時間 05:40 自動執行
5. 手機打開網址 → 加入主畫面

> 💡 SerpApi 免費方案：每天 8 次搜尋，約 3 週輪完 64 條航線（優先級 1 的航線更頻繁）。

---

## 設定 Configuration

### `config/routes.json`

- `routes` — 追蹤的航線。`p` 優先級 1–3、`bm` 參考價分組、`stay` 停留天數。
  ```json
  { "o": "TPE", "d": "CDG", "p": 1, "bm": "EU", "stay": 12 }
  ```
  App 的「航線追蹤 → 加入每日掃描」會幫你產生這一行。
- 固定行程與個人目標價請放在 Repository **Variables** `WATCH_TRIPS`、`PRICE_ALERTS`（repo 是公開的）— 見 [docs/SETUP.md](docs/SETUP.md)。
- `origins` — 外站與預設定位成本（來回經濟艙 TWD，可在 App 設定頁覆寫）。
- `benchmarks` — 各地區商務艙來回「常見價 / 好價」(TWD)，在沒有 Google 價格區間與足夠歷史資料時作為參考。

### Repository variables / secrets

完整清單見 [docs/SETUP.md](docs/SETUP.md)。主要項目：
`SERPAPI_KEY` · `SERPAPI_KEY_2` · `NTFY_TOPICS` · `NOTIFICATIONS` · `DEPLOY_TARGET` · `VERCEL_TOKEN` · `PRICE_ALERTS` · `WATCH_TRIPS` · `SEARCHES_PER_RUN` · `NOTIFY_MIN_SCORE`
· Real Tracker：`TRACKERS` · `ALERT_EMAILS` · `SMTP_URL` / `RESEND_API_KEY` · `TRACKER_NOTIFICATIONS`（Vercel：`PASSWORD_USERA` · `PASSWORD_USERB` · `SESSION_SECRET` · `TRACKERS_GITHUB_TOKEN`）
· 即時搜尋（Vercel：`SERPAPI_KEY` · `SERPAPI_KEY_2` · `SEARCH_RESERVE`）· 社群情報與活動：`PROMO_ALERTS` · `COMMUNITY_NOTIFICATIONS`（來源在 `config/sources.json`）

---

## 🛡 排除政策 Exclusion policy

一個行程只要符合任一條件就**整個丟棄** — any match drops the whole itinerary:

1. 行銷**或實際營運**航空公司總部在中國大陸／香港／澳門（CA MU CZ HU MF 3U ZH HO 9C … CX UO HX HB NX，共 50+ 家）
2. 任何航段在中國大陸／香港／澳門**起飛、降落、轉機或技術停留**
3. 機場國家無法驗證 → 一律排除（fail-closed；使用 OurAirports 9,000+ 機場資料庫比對）
4. 航空公司名稱比對（例如 Google 顯示 "Operated by China Eastern"）

多重防護：搜尋時先請 Google 排除這些航空公司與轉機點 → 掃描器逐段嚴格檢查 → App 在瀏覽器端再檢查一次。
**中華航空 (CI) / 華信 (AE) 為台灣航空公司，不受影響。**

> ⚠️ SerpApi 來回票：Google 只回傳去程明細，回程由搜尋條件排除中/港/澳；若要逐段驗證回程請設定 `SERPAPI_VERIFY_RETURN=1`。
> App 會分別標示「無中國/港澳航段 ✓」與「去程已驗證 · 回程已過濾」。Duffel 則兩個方向都完整驗證。

---

## 評分方式 How deals are scored (0–99)

| 因素 | 影響 |
|---|---|
| 價格 vs 常見價（Google 常見價下緣 → 歷史中位數 → 參考價）| 主要因素 |
| 直飛 +6 · 兩轉以上 −10 | |
| 5 小時以上航段平躺 +4 / 非平躺 −8 · 混艙 −12 | |
| 天合聯盟 +6（標準）/ +12（強烈）· 星空、寰宇一家 +2 | 次要 |
| Google 判定「價格偏低」+4 · 廉航商務 −8 · 長轉機/過夜 −2~−6 · 外站經台北 +3 | |

等級：超值 ≥ 88 · 很划算 ≥ 75 · 不錯 ≥ 62。低於常見價 50% 標示「疑似錯誤票價」。

---

## 🔁 外站票 Ex-station tickets

外站票 = 從台北以外城市出發的機票。老手常用：買 **曼谷→台北→洛杉磯→台北→曼谷**，在台北停留，
等於用外站價格飛台北出發的長程段。App 會計算 **外站票 + 定位機票 vs 台北出發最低價**，
並用 ★ 標出「經台北」的四段票候選。注意：第一段必須依序搭乘；停留規則與票期依票價規則而定。

---

## 本機開發 Local development

```bash
npm test            # unit tests (filter, scoring, providers, notifications, end-to-end scan)
npm run scan:demo   # regenerate demo data into web/data/
npm run serve       # http://localhost:8080
SERPAPI_KEY=... SEARCHES_PER_RUN=2 npm run scan   # real scan
npm run airports    # refresh config/airport-countries.json (+ web/data copy) from OurAirports
node scripts/community.mjs   # read the social / promotion feeds into web/data/community.json (COMMUNITY_OFFLINE=1 = test fixtures)
npm run icons       # re-render PNG icons (needs Playwright)
```

No build step, no dependencies — vanilla ES modules. Node ≥ 20.

```
web/            PWA (index.html, app.js, i18n.js + i18n-more.js, icons.js, sw.js, styles.css, data/*.json)
web/ui/         screens: search.js (+ search-model.js) · community.js (+ community-model.js) · playbooks.js · deal.js · fmt.js · kit.js
web/api/        trackers.mjs — Vercel Function: tracker sync → private GitHub variable TRACKERS
                search.mjs — live search (SerpApi Google Flights; multi-city, filters, country price check) behind the same sign-in
web/core/       shared logic used by BOTH the browser and the scanner
                airlines.js · airports.js · exclusion.js · scoring.js · links.js · trackers.js · programs.js
                search.js · places.js · markets.js (search model, place names, point-of-sale markets)
                community.js · promos.js · playbooks.js (deal / promotion classifiers, pasted-post parser, playbook library)
scripts/        scan.mjs (daily job) · providers/{serpapi,duffel,demo}.mjs · lib/pos.mjs (foreign-site checks) · notify.mjs (ntfy)
                community.mjs + lib/community.mjs + lib/rss.mjs (social / promotion feeds) · community-notify.mjs (digest)
                lib/trackers.mjs (Real Tracker plan / results / alerts) · tracker-notify.mjs · lib/mail.mjs (SMTP / Resend)
apps/mobile/    ÆtherSky Flutter app (iOS + Android) — see apps/mobile/README.md
backend/        Supabase schema + Edge Functions for the mobile app
config/         routes.json · airport-countries.json · sources.json (community / promotion feeds)
test/           node:test suites + fixtures
.github/        daily-scan.yml (cron 05:40 Taipei → scan → commit web/data) · ci.yml
docs/SETUP.md   step-by-step setup for USERA & USERB
design-system/  UI rules (Minimal Swiss, tokens, a11y) from the ui-ux-pro-max skill in .claude/skills/
```

## 限制 Limitations

- 票價為搜尋當下的參考價；訂票前請在航空公司或 OTA 再確認。Fares are indicative snapshots.
- Amadeus Self-Service API 已於 2026-07-17 停止服務，因此不支援。
- 只追蹤機票（每日好價為商務艙；Real Tracker 可選其他艙等），不含火車；未包含里程兌換座位（award seats）。 Flights only — no trains, no award seats.
- **Facebook 社團無法被程式讀取**（平台禁止且要登入）— 用「貼上貼文」；Secret Flying、FlyerTalk 會擋雲端機房，標示為「被擋住／未啟用」。 Facebook can't be read by a program (use “paste a post”); Secret Flying / FlyerTalk block datacenter IPs.
- App 內即時搜尋需要 Vercel 的 `SERPAPI_KEY` 並先登入；多段票查詢的參數已對照 SerpApi 文件核對（`type=3` + `multi_city_json` + `departure_token`），但**尚未用真實金鑰實測**；多段票的 Google Flights 連結格式未經實測。 Live multi-city search follows SerpApi's documented parameters (checked against the docs) but has not been exercised with a real key.
- 玩法庫是社群做法與一般常識（隱藏城市等可能違反運送條款），不是航空公司認可的方案；請以官網與條款為準。 Playbooks are community know-how, not airline-approved.
- 會員卡夾只存在各自手機的瀏覽器；換手機前請匯出備份。 The member wallet lives only in each phone's browser.
- 聯盟成員資料更新至 2026-09：ITA 已轉星空聯盟；韓亞 (OZ) 將於 2026-12-17 併入大韓航空（天合）。
