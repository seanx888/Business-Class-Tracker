# 設定指南 · Setup guide（Sean & Blue）

> 本 App 只追蹤**機票**（商務艙），不含火車。 This app tracks **flight tickets only** (business class) — no trains.

App 網址 App URL：**https://jcd-class.bluechiou.com**

| # | 步驟 Step | 狀態 Status | 費用 Cost | 時間 Time |
|---|---|---|---|---|
| 1 | 合併 PR、預設分支 `main` · Merge PR, `main` as default | ✅ 已完成 Done | Free | — |
| 2 | 網站架在 Vercel（seanx888 帳號，已連 GitHub）· App on Vercel, Git-linked | ✅ Claude 已完成 Done by Claude | Free (Hobby) | — |
| 3 | SerpApi 金鑰（真實票價）· SerpApi key (real fares) | ✋ 需手動 Manual | Free 250 searches/mo | 5 min |
| 4 | ntfy 推播（兩人共用一個主題）· ntfy push, one shared topic | ✋ 需手動 Manual（目前暫停） | Free | 5 min |
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

- 網址 URL：**https://jcd-class.bluechiou.com**（公開，Blue 不需要 Vercel 帳號）
- Vercel 帳號：**seanx888**（與 GitHub 同一個），專案 `business-class-tracker`，已**連結 GitHub repo**：
  - `main` 有程式碼更新 → **自動部署**正式網站；其他分支 / PR → 自動產生預覽網址。
  - 只有 `web/data/` 變動（每天的票價資料）時**略過部署**（Ignored Build Step），不浪費額度。
- **資料怎麼每天更新**：GitHub Actions 每天把票價寫進 repo 的 `web/data/`，App 直接從 GitHub 讀取最新資料
  （約 5 分鐘快取）→ **不需要**重新部署、**不需要** Vercel token。
  The app reads fare data straight from GitHub, so the site never needs a redeploy for new fares.

> 自訂網域 `jcd-class.bluechiou.com` 由 Cloudflare DNS 指向 Vercel（CNAME `jcd-class` → `cname.vercel-dns-0.com`，**DNS only 灰色雲**；
> TXT `_vercel` 為網域驗證用，與 aeonracle 的那筆並存，兩筆都不要刪）。備用網址 https://business-class-tracker-lime.vercel.app 也一直可用。
> Custom domain via Cloudflare DNS (CNAME, DNS only). The vercel.app address keeps working as a backup.

<details>
<summary>替代方案：GitHub Pages · Alternative: GitHub Pages</summary>

**Settings → Pages → Source: GitHub Actions**（下方 *Visibility — start free for 30 days* 是企業版「私人網站」功能，**不需要**，忽略即可），
再新增 Variable `DEPLOY_TARGET` = `pages`。網址：`https://seanx888.github.io/Business-Class-Tracker/`
</details>

---

## 3. SerpApi 金鑰（Google Flights 真實票價）· SerpApi key

**金鑰只放一個地方：GitHub → Secrets → 名稱 `SERPAPI_KEY`。** 不是 Variables、不是 Environments、也不是 Vercel。
**The key goes in exactly one place: a GitHub repository *secret* named `SERPAPI_KEY`.** Not a Variable, not an Environment, not Vercel.

1. 註冊 Sign up：<https://serpapi.com/users/sign_up>（完成 email 驗證）
2. 複製金鑰 Copy key：<https://serpapi.com/manage-api-key> → **Your Private API Key**（64 個英數字）
3. 打開 <https://github.com/seanx888/Business-Class-Tracker/settings/secrets/actions>
   （= repo **Settings → Secrets and variables → Actions**）
4. 確認上方停在 **Secrets** 分頁（不是 *Variables*）→ 在 **Repository secrets** 區塊按 **New repository secret**
   - **Name**：`SERPAPI_KEY`（全大寫、底線，前後不要有空格）
   - **Secret**：貼上金鑰（不要加引號或空白）→ **Add secret**
   - ⚠️ 不要按 *Manage environment secrets*（Environment secrets 這個工作流程讀不到）。
5. 驗證 Verify：**Actions → Daily fare scan & deploy → Run workflow** → 跑完點進去看最下面的 **Summary**：
   - `Provider: serpapi ✅` + `SerpApi quota left: …` → 成功 🎉
   - `Provider: demo ⚠️` 或黃色警告 *No SERPAPI_KEY secret* → 金鑰沒放對位置（紅色 *saved as a Variable* = 放到 Variables 了，刪掉改放 Secrets）
   - 紅色 *Every search failed* → 金鑰貼錯或額度用完
   - App：**設定 → 資料** 顯示 `serpapi` 與「SerpApi 本月剩餘」，示範資料橫幅消失。

**額度 Quota**：免費方案是 **250 次/月**（不是 200）。掃描會自動查詢剩餘次數（查詢本身不扣額度），
每天用「剩餘次數 ÷ 本月剩餘天數」→ 約 **8 次/天**，其中 2 次用來做「外國站結帳」比價；月底前不會用光。
- 付費方案不用改任何設定，會自動用更多次數（單日上限 20，可用 Variable `SEARCHES_PER_RUN` 調整）。
- Variable `SERPAPI_VERIFY_RETURN` = `1`：逐段驗證最便宜選項的**回程**也不經中/港/澳（每條航線多用 1 次搜尋，免費方案不建議）。
- 用量查詢 Usage：<https://serpapi.com/dashboard>

**兩個帳號合併成 500 次/月？ · Two free accounts combined?**
技術上可以：第二個金鑰放 Secret **`SERPAPI_KEY_2`**，第一個用完會自動切換，每日配額會把兩個帳號的剩餘次數加總。
但 SerpApi 免費方案原意是「一人一個帳號」，一人開多個免費帳號可能被視為規避額度、帳號被停用。
Blue 用自己的 email 註冊自己的帳號、把金鑰給這個共用專案，屬灰色地帶——**最保險**是升級付費方案，或先寫信問 <support@serpapi.com>。
Technically supported (`SERPAPI_KEY_2`, automatic failover), but stacking free accounts may breach the spirit of the free tier — safest is a paid plan or asking SerpApi first.

---

## 4. ntfy 推播 — Sean & Blue 共用一個主題 · One shared ntfy topic

> ⏸ **目前暫停中 Currently paused**（`config/routes.json` → `"notifications": "paused"`）。
> 主題可以先設好；要開始推播時，在 GitHub **Variables** 新增 `NOTIFICATIONS` = `on`（刪除或設 `paused` 即再暫停）。
> Set up the topic now; add the variable `NOTIFICATIONS=on` when you want pushes to start.

ntfy 免費、免註冊。ntfy.sh 上的主題是公開的，**知道主題名稱的人就能看到訊息**，所以名稱要像密碼一樣保密，
**不要寫進 repo 的任何檔案**（這個 repo 是公開的）— 只放在 GitHub Secret。

1. **兩人都安裝 ntfy App** — iPhone：App Store「ntfy」；Android：Google Play / F-Droid「ntfy」。允許通知。
2. **兩人都訂閱同一個主題**：App 內 **＋** → *Subscribe to topic* → 輸入你們的共用主題 → Server 用預設 `ntfy.sh` → **Subscribe**。
3. **GitHub Secret**：<https://github.com/seanx888/Business-Class-Tracker/settings/secrets/actions> → **Secrets** 分頁 → **New repository secret**
   - **Name**：`NTFY_TOPICS`
   - **Secret**：`family=<你們的主題>@zh-TW`（`family` 是名字，`@zh-TW` = 繁體中文；只填主題本身也可以，預設就是繁中）
4. **測試 Test**：瀏覽器打開 `https://ntfy.sh/<你們的主題>` → 在下方輸入框送一則測試訊息，兩支手機應該同時收到。

**你們會收到什麼 · What you'll receive**（開啟後）
- 每天約 **05:40（台北）**：新出現、評分 ≥ 72 的好價摘要，**繁體中文、新台幣 NT$**（Variable `NOTIFY_MIN_SCORE` 可調門檻）。
- `PRICE_ALERTS` 目標價達成時（第 5 步，`who` 用 `family` 或 `all`）：高優先通知。
- 示範資料 (demo) 不會推播。

> 之後想各自分開？改成 `sean=<主題A>@zh-TW,blue=<主題B>@en`，各自訂閱自己的主題。
> 用自架 ntfy 或保留主題（ntfy Pro）：Variable `NTFY_SERVER`、Secret `NTFY_TOKEN`（access token）。

---

## 5. 個人目標價與固定行程 · Personal price targets & watch trips（選用 Optional）

這兩項放在 **Variables**（不會出現在公開的程式碼裡）。 Kept in Variables so they're not in the public repo.

**`PRICE_ALERTS`** — 價格 ≤ 目標時推播（`who` 要和 `NTFY_TOPICS` 裡的名字一樣，共用主題就用 `family` 或 `all`）：
```json
[
  { "who": "all", "route": "TPE-CDG", "maxTWD": 110000 },
  { "who": "all", "route": "TPE-NRT", "maxTWD": 26000 }
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

打開 **https://jcd-class.bluechiou.com** → iPhone：Safari **分享 → 加入主畫面**；Android：Chrome **⋮ → 安裝應用程式**。

App 一律以**繁體中文、新台幣**開啟（可在設定改語言／幣別，只影響那支手機）。票價預設只顯示**傳統航空**，
頂端「傳統航空｜LCC｜全部」一鍵切換。「特殊票價」分頁有 **外站出發** 與 **外國站結帳** 兩種省錢方式。
The app always opens in Traditional Chinese with NT$; full-service airlines by default; the *Special fares* tab covers ex-station and foreign-site checkout.

每支手機的設定是**各自獨立**的：語言（Sean 繁中／한국어、Blue English）、幣別、天合加權、外站定位成本、App 內目標價。
Each phone keeps its own language, currency, SkyTeam preference, positioning costs and in-app targets.

---

## 7. 第一次執行與檢查 · First run & check

1. **Actions → Daily fare scan & deploy → Run workflow**（provider 留空）→ **Run workflow**。
2. 約 2–5 分鐘後應為綠色 ✓。
3. 打開 https://jcd-class.bluechiou.com ：「示範資料」提示消失；**設定 → 資料** 顯示 `serpapi` 與本月剩餘次數。
4. 之後每天 **台北時間 05:40** 自動執行，不用再手動。

---

## 外國站結帳（他國網站／VPN 比較便宜）· Foreign-site checkout

同一張機票在不同國家的網站、用當地貨幣結帳，價格可能差 3–20%。每天掃描完，系統會把**當天最佳票價**
拿到其他國家的 Google Flights 市場（越南、泰國、印尼、菲律賓、馬來西亞、新加坡、韓國、日本、印度、美國）重新報價，
換算台幣後，便宜 ≥ 3% 的會在票價卡上標「越南站省 5%」，並列在 **特殊票價 → 外國站結帳**。

- 優先比較：出發地國家的網站（外站票常在當地最便宜）→ 航空公司母國網站 → 每天輪替其他國家。
- 每天用 2 次 SerpApi 搜尋（`config/routes.json` → `pos.checksPerRun` 可調；設 `"enabled": false` 關閉）。
- 點國家那一列 → 直接開啟該國市場的 Google Flights（當地幣別），再從航空公司官網切換國家／語言購買。
- 注意：匯率以卡片當天匯率估算；海外刷卡手續費約 1.5%；部分票價限當地居民或當地信用卡；
  通常**不需要 VPN**（航空公司官網切換國家即可），少數訂票網站依連線地區定價才需要，請留意各網站條款。

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
| `SERPAPI_KEY_2` | Secret | 選用：第二個 SerpApi 金鑰，第一個額度用完自動切換（見第 3 步注意事項）|
| `NTFY_TOPICS` | Secret | `family=<共用主題>@zh-TW`（或各自 `sean=…@zh-TW,blue=…@en`）|
| `VERCEL_TOKEN` | Secret | 不需要（只有 `DEPLOY_TARGET=vercel` 的進階用法才需要）|
| `DUFFEL_ACCESS_TOKEN` | Secret | 選用 |
| `NTFY_TOKEN` | Secret | 選用：受保護主題 |
| `DEPLOY_TARGET` | Variable | `none`（預設，Vercel 讀 GitHub 資料）· `pages` · `vercel` · `pages,vercel` |
| `SITE_URL` | Variable | 推播連結網址（預設 `config/routes.json` 的 `siteUrl` = Vercel 網址）|
| `PRICE_ALERTS` | Variable | 個人目標價 JSON |
| `WATCH_TRIPS` | Variable | 固定行程 JSON |
| `SEARCHES_PER_RUN` | Variable | 每天搜尋次數上限（SerpApi 預設 20，並依剩餘額度自動調低）|
| `NOTIFICATIONS` | Variable | `on` = 開始推播；未設定 = 依 config（目前 `paused`）|
| `NOTIFY_MIN_SCORE` | Variable | 推播門檻分數（預設 72）|
| `SERPAPI_VERIFY_RETURN` | Variable | `1` = 驗證回程（每條多 1 次搜尋）|
| `FARE_PROVIDER` | Variable | 強制 `serpapi` / `duffel` / `demo` |
| `VERCEL_PROJECT`, `VERCEL_SCOPE`, `NTFY_SERVER` | Variable | 進階 |

## 疑難排解 · Troubleshooting

| 症狀 Symptom | 解法 Fix |
|---|---|
| `configure-pages` 失敗 / *Get Pages site failed* | 只有 `DEPLOY_TARGET=pages` 才會用到 Pages；刪掉該 Variable 即可 |
| 一直顯示示範資料 / Summary 寫 `demo ⚠️` | `SERPAPI_KEY` 必須出現在 **Secrets 分頁 → Repository secrets** 清單裡。放在 *Environment secrets*（例如 Vercel 自動建立的 Production / Preview 環境）、Variables 或 Vercel 都讀不到 — 見第 3 步 |
| *Every search failed* | `SERPAPI_KEY` 錯誤或本月額度用完（看 SerpApi dashboard）|
| 沒收到推播 | 目前暫停中（Variable `NOTIFICATIONS=on` 才會開始）？主題名稱是否一致？今天沒有 ≥ 72 分的新好價？示範資料不推播 |
| 每天沒有自動執行 | 預設分支必須是 `main`（第 1 步）|
| App 資料沒更新 | 看 Actions 當天是否綠色 ✓；App 右上 ↻ 重新整理（GitHub 快取約 5 分鐘）|
