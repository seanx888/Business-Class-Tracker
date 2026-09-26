# 設定指南 · Setup guide（Sean & Blue）

> 本 App 只追蹤**機票**（商務艙），不含火車。 This app tracks **flight tickets only** (business class) — no trains.

| # | 步驟 Step | 必要？ Required | 費用 Cost | 時間 Time |
|---|---|---|---|---|
| 1 | 合併 PR、預設分支改為 `main` · Merge PR, make `main` default | ✅ | Free | 2 min |
| 2 | 發佈網站：GitHub Pages（或 Vercel）· Publish the app | ✅ | Free | 2 min |
| 3 | SerpApi 金鑰（真實票價）· SerpApi key (real fares) | ✅ | Free 250 searches/mo | 5 min |
| 4 | ntfy 推播（Sean & Blue 各一個主題）· ntfy push for both | 建議 Recommended | Free | 5 min |
| 5 | 個人目標價、固定行程 · Personal price targets & trips | 選用 Optional | Free | 3 min |
| 6 | 兩支手機安裝 App · Install on both phones | ✅ | — | 1 min |
| 7 | 第一次執行與檢查 · First run & check | ✅ | — | 5 min |

所有 GitHub 設定都在 repo 的 **Settings** 分頁。Secrets / Variables 位置：
**Settings → Secrets and variables → Actions** → 分頁 **Secrets**（機密，設定後看不到內容）或 **Variables**（一般設定，可再編輯）。

---

## 1. 合併 PR、設定預設分支 · Merge the PR and make `main` the default branch

1. 打開 Pull Request → **Merge pull request** → **Confirm merge**。
2. **Settings → General → Default branch** → 按 ⇄ 圖示 → 選 **`main`** → **Update** → *I understand*。
3. （可選）刪除 `claude/…` 分支。

> 為什麼：GitHub 的排程（每天 05:40 自動掃描）只會在**預設分支**上執行。
> Why: scheduled workflows only run on the default branch.

---

## 2. 發佈網站 · Publish the app

### 2A. GitHub Pages（預設，最簡單 · default, simplest）

1. **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
2. 完成。網址 URL：**https://seanx888.github.io/Business-Class-Tracker/**

### 2B. Vercel（選用，可取代或同時使用 · optional, instead of or in addition to Pages）

1. <https://vercel.com> 登入 → 右上頭像 → **Account Settings → Tokens** → **Create Token**
   - Name：`bct-github-actions` · Scope：你的個人 (Hobby) team · Expiration：1 year（到期前記得更新）
2. GitHub **Secrets** → New secret：`VERCEL_TOKEN` = 剛才的 token
3. GitHub **Variables** → New variable：`DEPLOY_TARGET` = `vercel`（只用 Vercel）或 `pages,vercel`（兩個都發佈）
4. 第一次執行後，網址通常是 **https://business-class-tracker.vercel.app**（名稱被占用時 Vercel 會加後綴，請看 Actions 執行摘要或 Vercel 後台）。
   把網址設成 Variable `SITE_URL`，推播裡的連結就會開 Vercel 版本。
5. 選用 Variables：`VERCEL_PROJECT`（專案名稱，預設 `business-class-tracker`）、`VERCEL_SCOPE`（team slug，若不是個人 team）。

> ⚠️ **不要**在 Vercel 用「Import Git Repository」連接這個 repo：Hobby 方案會擋下 GitHub Actions 機器人的每日資料 commit。
> 本專案的 workflow 會直接上傳 `web/` 資料夾，不需要 Git 連接。
> Don't use Vercel's Git import — the Hobby plan blocks bot commits. The workflow uploads `web/` directly.

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

打開第 2 步的網址 → iPhone：Safari **分享 → 加入主畫面**；Android：Chrome **⋮ → 安裝應用程式**。

每支手機的設定是**各自獨立**的：語言（Sean 繁中／한국어、Blue English）、幣別、天合加權、外站定位成本、App 內目標價。
Each phone keeps its own language, currency, SkyTeam preference, positioning costs and in-app targets.

---

## 7. 第一次執行與檢查 · First run & check

1. **Actions → Daily fare scan & deploy → Run workflow**（provider 留空）→ **Run workflow**。
2. 約 2–5 分鐘後應為綠色 ✓。
3. 打開 App：黃色「示範資料」橫幅消失；**設定 → 資料狀態** 顯示 `serpapi`。
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
| `VERCEL_TOKEN` | Secret | 只有用 Vercel 時需要 |
| `DUFFEL_ACCESS_TOKEN` | Secret | 選用 |
| `NTFY_TOKEN` | Secret | 選用：受保護主題 |
| `DEPLOY_TARGET` | Variable | `pages`（預設）· `vercel` · `pages,vercel` · `none` |
| `SITE_URL` | Variable | 推播連結網址（用 Vercel 時設定）|
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
| `configure-pages` 失敗 / *Get Pages site failed* | 第 2A 步沒開 Pages；或設 `DEPLOY_TARGET=vercel` |
| *Every search failed* | `SERPAPI_KEY` 錯誤或本月額度用完（看 SerpApi dashboard）|
| 沒收到推播 | 主題名稱是否一致？`NTFY_TOPICS` 格式？今天沒有 ≥ 72 分的新好價？示範資料不推播 |
| 每天沒有自動執行 | 預設分支必須是 `main`（第 1 步）|
| Vercel 部署失敗 | `VERCEL_TOKEN` 是否過期、scope 是否正確 |
