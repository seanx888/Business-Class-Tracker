# 設定指南 · Setup guide（Sean & Blue）

> 本 App 只追蹤**機票**（商務艙），不含火車。 This app tracks **flight tickets only** (business class) — no trains.

App 網址 App URL：**https://business-class-tracker.vercel.app**

| # | 步驟 Step | 狀態 Status | 費用 Cost | 時間 Time |
|---|---|---|---|---|
| 1 | 合併 PR、預設分支 `main` · Merge PR, `main` as default | ✅ 已完成 Done | Free | — |
| 2 | 網站架在 Vercel · App hosted on Vercel | ✅ Claude 已完成 Done by Claude | Free (Hobby) | — |
| 3 | SerpApi 金鑰（真實票價）· SerpApi key (real fares) | ✋ 需手動 Manual | Free 250 searches/mo | 5 min |
| 4 | ntfy 推播（Sean & Blue 各一個主題）· ntfy push for both | ✋ 需手動 Manual（建議） | Free | 5 min |
| 5 | 個人目標價、固定行程 · Personal price targets & trips | 選用 Optional | Free | 3 min |
| 6 | 兩支手機安裝 App · Install on both phones | ✋ 需手動 Manual | — | 1 min |
| 7 | 第一次執行與檢查 · First run & check | ✋ 需手動 Manual | — | 3 min |

> 為什麼 SerpApi / ntfy 還是要設定在 GitHub？每天的票價掃描是在 **GitHub Actions** 執行（Vercel 只負責放網頁），
> 所以掃描需要的兩個金鑰要放在 GitHub Secrets。Vercel 端**不需要**任何 token。
> Why GitHub? The daily scan runs on GitHub Actions; Vercel only hosts the page. No Vercel token is needed.

所有 GitHub 設定都在 repo 的 **Settings** 分頁。Secrets / Variables 位置：
**Settings → Secrets and variables → Actions** → 分頁 **Secrets**（機密，設定後看不到內容）或 **Variables**（一般設定，可再編輯）。

---

## 1. 合併 PR、設定預設分支 · Merge the PR and make `main` the default — ✅ 已完成 Done

PR #1 已合併，預設分支已是 `main`。GitHub 的排程（每天 05:40 自動掃描）只會在預設分支上執行。

---

## 2. 網站：Vercel · The app on Vercel — ✅ Claude 已完成 Done by Claude

- 網址 URL：**https://business-class-tracker.vercel.app**（公開，Blue 不需要 Vercel 帳號）
- Claude 已在 Sean 的 Vercel 帳號建立專案 `business-class-tracker`，並關閉 Vercel 登入保護。
- **資料怎麼每天更新**：GitHub Actions 每天把票價寫進 repo 的 `web/data/`，App 直接從 GitHub 讀取最新資料
  （約 5 分鐘快取）→ **不需要**重新部署、**不需要** Vercel token。
  The app reads fare data straight from GitHub, so the Vercel site never needs a redeploy for new fares.
- **程式碼更新**（新功能）才需要重新部署：請 Claude「重新部署 Vercel」即可。
  Code changes need a redeploy — just ask Claude.

<details>
<summary>選用：讓 Vercel 在每次 push 時自動部署程式碼 · Optional: auto-deploy code on every push</summary>

目前 Vercel 帳號登入所連接的 GitHub 帳號不是 `seanx888`，所以 Vercel 沒有這個 repo 的寫入權限，無法自動連結。
若想要全自動：
1. GitHub → repo **Settings → Collaborators → Add people** → 加入 Vercel 所連接的 GitHub 帳號（Role：**Write**）→ 用該帳號接受邀請。
2. 確認 Vercel GitHub App 有這個 repo 的權限：<https://github.com/apps/vercel/installations/new>（用 `seanx888` 登入 → 選 *Only select repositories* → 勾選 `Business-Class-Tracker`）。
3. 告訴 Claude，Claude 會把專案連上 Git（之後每次 push 自動部署）。
</details>

<details>
<summary>替代方案：GitHub Pages · Alternative: GitHub Pages</summary>

**Settings → Pages → Source: GitHub Actions**（下方 *Visibility — start free for 30 days* 是企業版「私人網站」功能，**不需要**，忽略即可），
再新增 Variable `DEPLOY_TARGET` = `pages`。網址：`https://seanx888.github.io/Business-Class-Tracker/`
</details>

---

## 3. SerpApi 金鑰（Google Flights 真實票價）· SerpApi key

1. 註冊 Sign up：<https://serpapi.com/users/sign_up>（完成 email 驗證）
2. 複製金鑰 Copy key：<https://serpapi.com/manage-api-key> → **Your Private API Key**
3. GitHub **Secrets** → New secret：`SERPAPI_KEY` = 金鑰
4. 額度 Quota：免費方案 **250 次/月** → 預設每天 **8 次**（約 240 次/月），約 3 週輪完 64 條航線（優先級 1 的航線更常掃）。
   - 升級付費方案後，把 Variable `SEARCHES_PER_RUN` 設為「每月額度 ÷ 30」。
   - Variable `SERPAPI_VERIFY_RETURN` = `1`：逐段驗證最便宜選項的**回程**也不經中/港/澳（每條航線多用 1 次搜尋，免費方案不建議）。

> 用量查詢 Usage：<https://serpapi.com/dashboard>

---

## 4. ntfy 推播 — Sean & Blue 各自接收 · ntfy push for both of you

ntfy 免費、免註冊。每人一個**不易猜到的主題名稱**（ntfy.sh 上的主題是公開的，知道名稱的人就能看到訊息，所以名稱要像密碼一樣隨機）。

1. **兩人各自安裝 ntfy App** — iPhone：App Store 搜尋「ntfy」；Android：Google Play 或 F-Droid「ntfy」。允許通知。
2. **各自想一個主題名稱**（只能用英數、`-`、`_`，最多 64 字），例如：
   - Sean：`bct-sean-7Hq2xP9wK3`
   - Blue：`bct-blue-Lm4vR8kzT6`
   （請換成你們自己的隨機字串 · use your own random strings）
3. **在 App 內訂閱**：按 **＋** → *Subscribe to topic* → 輸入自己的主題 → Server 用預設 `ntfy.sh` → **Subscribe**。
4. **GitHub Secrets** → New secret：`NTFY_TOPICS`，格式 `名字=主題@語言`，用逗號分隔：
   ```
   sean=bct-sean-7Hq2xP9wK3@zh-TW,blue=bct-blue-Lm4vR8kzT6@en
   ```
   語言 Language：`zh-TW` 繁中 · `en` English · `ko` 한국어（Sean 想用韓文就改成 `@ko`）。
5. **測試 Test**：瀏覽器打開 <https://ntfy.sh/app> → 訂閱同一個主題 → 在下方輸入框送一則測試訊息，手機應該馬上收到。
   或在電腦終端機：`curl -d "測試 test" ntfy.sh/bct-sean-7Hq2xP9wK3`

**你們會收到什麼 · What you'll receive**
- 每天約 **05:40（台北）**：新出現、評分 ≥ 72 的好價摘要，各自用自己的語言（Variable `NOTIFY_MIN_SCORE` 可調門檻）。
- 個人目標價（第 5 步）達成時：只推給那個人的「🎯 目標價達成」通知（高優先）。
- 示範資料 (demo) 不會推播。

> 想共用一個主題？兩人訂閱同一個主題，Secret 設成 `family=<主題>@zh-TW` 即可。
> 用自架 ntfy 或保留主題（ntfy Pro）：Variable `NTFY_SERVER`、Secret `NTFY_TOKEN`（access token）。

---

## 5. 個人目標價與固定行程 · Personal price targets & watch trips（選用 Optional）

這兩項放在 **Variables**（不會出現在公開的程式碼裡）。 Kept in Variables so they're not in the public repo.

**`PRICE_ALERTS`** — 價格 ≤ 目標時推播給指定的人（名字要和 `NTFY_TOPICS` 裡的一樣，或用 `all`）：
```json
[
  { "who": "blue", "route": "TPE-CDG", "maxTWD": 110000 },
  { "who": "sean", "route": "TPE-NRT", "maxTWD": 26000 },
  { "who": ["sean", "blue"], "route": "BKK-LAX", "maxTWD": 80000 }
]
```
- `route` 必須是有在掃描的航線（`config/routes.json` 或下方的 `WATCH_TRIPS`）。
- 同一條目標價：只有「更便宜」或「7 天後仍符合」才會再推播，不會洗版。

**`WATCH_TRIPS`** — 已決定日期的行程，每天都會優先搜尋（每個行程每天用掉 1 次搜尋額度）：
```json
[
  { "o": "TPE", "d": "CDG", "depart": "2026-12-20", "return": "2027-01-05", "label": "Paris" }
]
```

> 🔒 公開 repo 提醒：Actions 執行紀錄與網站資料是公開的，搜尋的航線與日期看得到。`label` 請用不具識別性的名稱。
> Public repo: Actions logs and the site's data are public — use neutral labels.
>
> App 內「航線追蹤」的 🎯 目標價只存在各自的手機、只在打開 App 時提醒；`PRICE_ALERTS` 則是 App 沒開也會推播。

---

## 6. 兩支手機安裝 App · Install on both phones

打開 **https://business-class-tracker.vercel.app** → iPhone：Safari **分享 → 加入主畫面**；Android：Chrome **⋮ → 安裝應用程式**。

每支手機的設定是**各自獨立**的：語言（Sean 繁中／한국어、Blue English）、幣別、天合加權、外站定位成本、App 內目標價。
Each phone keeps its own language, currency, SkyTeam preference, positioning costs and in-app targets.

---

## 7. 第一次執行與檢查 · First run & check

1. **Actions → Daily fare scan & deploy → Run workflow**（provider 留空）→ **Run workflow**。
2. 約 2–5 分鐘後應為綠色 ✓。
3. 打開 https://business-class-tracker.vercel.app ：黃色「示範資料」橫幅消失；**設定 → 資料狀態** 顯示 `serpapi`。
4. 之後每天 **台北時間 05:40** 自動執行，不用再手動。

---

## 選用：Duffel · Optional: Duffel

航空公司直連報價，來回兩個方向都完整驗證。 Airline-direct offers; both directions fully verified.
1. <https://app.duffel.com> 註冊 → 啟用 live mode（需完成帳戶驗證）→ **Developers → Access tokens** → 建立 **live** token。
2. Secret `DUFFEL_ACCESS_TOKEN`；Variable `FARE_PROVIDER` = `duffel`（同時有 SerpApi 金鑰時預設用 SerpApi）。
3. Duffel 搜尋多、訂票少時可能收取超額搜尋費用，請先看其價格頁。

---

## 參考：全部 Secrets / Variables · Reference

| Name | 類型 Type | 說明 |
|---|---|---|
| `SERPAPI_KEY` | Secret | SerpApi 金鑰（Google Flights）|
| `NTFY_TOPICS` | Secret | `sean=主題@zh-TW,blue=主題@en` |
| `VERCEL_TOKEN` | Secret | 不需要（只有 `DEPLOY_TARGET=vercel` 的進階用法才需要）|
| `DUFFEL_ACCESS_TOKEN` | Secret | 選用 |
| `NTFY_TOKEN` | Secret | 選用：受保護主題 |
| `DEPLOY_TARGET` | Variable | `none`（預設，Vercel 讀 GitHub 資料）· `pages` · `vercel` · `pages,vercel` |
| `SITE_URL` | Variable | 推播連結網址（預設 `config/routes.json` 的 `siteUrl` = Vercel 網址）|
| `PRICE_ALERTS` | Variable | 個人目標價 JSON |
| `WATCH_TRIPS` | Variable | 固定行程 JSON |
| `SEARCHES_PER_RUN` | Variable | 每天搜尋次數（SerpApi 預設 8）|
| `NOTIFY_MIN_SCORE` | Variable | 推播門檻分數（預設 72）|
| `SERPAPI_VERIFY_RETURN` | Variable | `1` = 驗證回程（每條多 1 次搜尋）|
| `FARE_PROVIDER` | Variable | 強制 `serpapi` / `duffel` / `demo` |
| `VERCEL_PROJECT`, `VERCEL_SCOPE`, `NTFY_SERVER` | Variable | 進階 |

## 疑難排解 · Troubleshooting

| 症狀 Symptom | 解法 Fix |
|---|---|
| `configure-pages` 失敗 / *Get Pages site failed* | 只有 `DEPLOY_TARGET=pages` 才會用到 Pages；刪掉該 Variable 即可 |
| *Every search failed* | `SERPAPI_KEY` 錯誤或本月額度用完（看 SerpApi dashboard）|
| 沒收到推播 | 主題名稱是否一致？`NTFY_TOPICS` 格式？今天沒有 ≥ 72 分的新好價？示範資料不推播 |
| 每天沒有自動執行 | 預設分支必須是 `main`（第 1 步）|
| App 資料沒更新 | 看 Actions 當天是否綠色 ✓；App 右上 ↻ 重新整理（GitHub 快取約 5 分鐘）|
