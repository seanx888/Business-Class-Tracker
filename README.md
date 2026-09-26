# 商務艙雷達 · Business Class Tracker ✈️

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
| 🟦 | 天合聯盟優先（價格仍為主，價格相近時天合排前面；可調強弱）| SkyTeam first — nudges ranking without overriding price |
| 🔁 | 外站票比價：外站票 + 定位機票 vs 台北出發，標示「經台北可停留」四段票 | Ex-station calculator incl. positioning cost & Taipei-stopover (4-coupon) candidates |
| 🛏 | 平躺座椅、直飛、混艙、過夜轉機、廉航商務、疑似錯誤票價 標記 | Lie-flat, nonstop, mixed-cabin, overnight layover, budget-biz and error-fare flags |
| 📈 | 航線價格歷史、30 天／歷史最低、目標價提醒 | Per-route price history, 30-day/all-time lows, target-price alerts |
| 🔗 | 一鍵開啟 Google Flights / Skyscanner / KAYAK / 航空公司官網（商務艙預設）| One-tap deep links, business cabin pre-selected |
| 🔔 | 每日推播：Telegram 或 ntfy（手機 App 未開也能收到）| Daily push via Telegram or ntfy |
| 🌏 | 繁體中文 / English / 한국어，深色／淺色，離線可用 | zh-TW / EN / KO, dark/light, works offline |

---

## 快速開始 Quick start（約 10 分鐘）

1. **開啟 GitHub Pages** — Repo → *Settings → Pages → Build and deployment → Source: **GitHub Actions***
2. **取得票價 API 金鑰（擇一）/ Pick a fare source**
   - **SerpApi (Google Flights)** — 建議。免費方案每月 250 次搜尋，含 Google「常見價格區間」可判斷是否便宜。
     註冊 <https://serpapi.com> → 複製 API key → Repo *Settings → Secrets and variables → Actions → New secret*：`SERPAPI_KEY`
   - **Duffel** — 航空公司直連報價，來回程完整驗證。建立 live access token → secret `DUFFEL_ACCESS_TOKEN`
   - 都不設定 → 使用**示範資料 (demo)**，App 會清楚標示「非真實票價」。
3. **（選用）每日推播 / Optional daily push**
   - Telegram：建立 bot（@BotFather）→ secrets `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`
   - ntfy：在手機安裝 ntfy App，訂閱一個不易猜到的主題 → secret `NTFY_TOPIC`
4. **合併到 `main` 分支**，然後 *Actions → Daily fare scan & deploy → Run workflow* 手動跑第一次。
   之後每天 **台北時間 05:40** 自動掃描、更新資料並發佈。
5. **安裝到手機** — 打開 `https://<帳號>.github.io/Business-Class-Tracker/`
   - iPhone：Safari → 分享 → 加入主畫面
   - Android：Chrome → 選單 → 安裝應用程式

> 💡 SerpApi 免費方案：每天 8 次搜尋，約 3 週輪完全部 64 條航線（優先級 1 的航線更頻繁）。
> 付費方案可把 Repository variable `SEARCHES_PER_RUN` 調高（例如 150）。

---

## 設定 Configuration

### `config/routes.json`

- `routes` — 追蹤的航線。`p` 優先級 1–3、`bm` 參考價分組、`stay` 停留天數。
  ```json
  { "o": "TPE", "d": "CDG", "p": 1, "bm": "EU", "stay": 12 }
  ```
  App 的「航線追蹤 → 加入每日掃描」會幫你產生這一行。
- `watchTrips` — 固定日期的行程，每次掃描都會優先搜尋 / fixed-date trips searched every run:
  ```json
  "watchTrips": [{ "o": "TPE", "d": "CDG", "depart": "2026-12-20", "return": "2027-01-05", "label": "巴黎跨年" }]
  ```
- `origins` — 外站與預設定位成本（來回經濟艙 TWD，可在 App 設定頁覆寫）。
- `benchmarks` — 各地區商務艙來回「常見價 / 好價」(TWD)，在沒有 Google 價格區間與足夠歷史資料時作為參考。

### Repository variables / secrets

| Name | Type | 說明 |
|---|---|---|
| `SERPAPI_KEY` | secret | SerpApi key (Google Flights) |
| `DUFFEL_ACCESS_TOKEN` | secret | Duffel live token |
| `FARE_PROVIDER` | variable | 強制 `serpapi` / `duffel` / `demo`（預設自動） |
| `SEARCHES_PER_RUN` | variable | 每天搜尋次數（serpapi 預設 8、duffel 30） |
| `SERPAPI_VERIFY_RETURN` | variable | 每條航線額外驗證幾個最便宜選項的**回程**（每個多花 1 次搜尋，建議付費方案設 `1`） |
| `NOTIFY_MIN_SCORE` | variable | 推播門檻分數（預設 72） |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NTFY_TOPIC` | secret | 推播 |
| `SITE_URL` | variable | 推播中的連結（預設 GitHub Pages 網址） |

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

等級：🔥 超值 ≥ 88 · ⭐ 很划算 ≥ 75 · 👍 不錯 ≥ 62。低於常見價 50% 標示「疑似錯誤票價」。

---

## 🔁 外站票 Ex-station tickets

外站票 = 從台北以外城市出發的機票。老手常用：買 **曼谷→台北→洛杉磯→台北→曼谷**，在台北停留，
等於用外站價格飛台北出發的長程段。App 會計算 **外站票 + 定位機票 vs 台北出發最低價**，
並用 ★ 標出「經台北」的四段票候選。注意：第一段必須依序搭乘；停留規則與票期依票價規則而定。

---

## 本機開發 Local development

```bash
npm test            # 47 unit tests (filter, scoring, providers, end-to-end scan)
npm run scan:demo   # regenerate demo data into web/data/
npm run serve       # http://localhost:8080
SERPAPI_KEY=... SEARCHES_PER_RUN=2 npm run scan   # real scan
npm run airports    # refresh config/airport-countries.json from OurAirports
npm run icons       # re-render PNG icons (needs Playwright)
```

No build step, no dependencies — vanilla ES modules. Node ≥ 20.

```
web/            PWA (index.html, app.js, i18n.js, sw.js, styles.css, data/*.json)
web/core/       shared logic used by BOTH the browser and the scanner
                airlines.js · airports.js · exclusion.js · scoring.js · links.js
scripts/        scan.mjs (daily job) · providers/{serpapi,duffel,demo}.mjs · notify.mjs
config/         routes.json · airport-countries.json
test/           node:test suites + fixtures
.github/        daily-scan.yml (cron 05:40 Taipei → commit data → GitHub Pages) · ci.yml
```

## 限制 Limitations

- 票價為搜尋當下的參考價；訂票前請在航空公司或 OTA 再確認。Fares are indicative snapshots.
- Amadeus Self-Service API 已於 2026-07-17 停止服務，因此不支援。
- 未包含里程兌換座位（award seats）。
- 聯盟成員資料更新至 2026-09：ITA 已轉星空聯盟；韓亞 (OZ) 將於 2026-12-17 併入大韓航空（天合）。
