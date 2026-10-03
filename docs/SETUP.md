# ÆtherSky 設定指南 · Setup guide（USERA & USERB）

> 本 App 只追蹤**機票**（商務艙），不含火車。 This app tracks **flight tickets only** (business class) — no trains.

App 網址 App URL：**https://aethersky.bluechiou.com**

> 📋 **重新設定所有金鑰？** 直接照 [docs/SECRETS.md](SECRETS.md)（全部 Secrets 一覽 + 逐步操作 + 檢查清單）。本檔保留各功能的詳細說明。
> Re-doing all keys? Follow [docs/SECRETS.md](SECRETS.md) — one master list, steps and checklist.

| # | 步驟 Step | 狀態 Status | 費用 Cost | 時間 Time |
|---|---|---|---|---|
| 1 | 合併 PR、預設分支 `main` · Merge PR, `main` as default | ✅ 已完成 Done | Free | — |
| 2 | 網站架在 Vercel（seanx888 帳號，已連 GitHub）· App on Vercel, Git-linked | ✅ Claude 已完成 Done by Claude | Free (Hobby) | — |
| 3 | SerpApi 金鑰（真實票價）· SerpApi key (real fares) | ✋ 需手動 Manual | Free 250 searches/mo | 5 min |
| 4 | ntfy 推播（兩人共用一個主題）· ntfy push, one shared topic | ✋ 需手動 Manual（目前暫停） | Free | 5 min |
| 5 | 個人目標價、固定行程 · Personal price targets & trips | 選用 Optional | Free | 3 min |
| 6 | 兩支手機安裝 App · Install on both phones | ✋ 需手動 Manual | — | 1 min |
| 7 | 第一次執行與檢查 · First run & check | ✋ 需手動 Manual | — | 3 min |
| 8 | Real Tracker 同步（Vercel）· Tracker sync | ✋ 需手動 Manual（選用但推薦） | Free | 5 min |
| 9 | 追蹤 Email 通知 · Tracker e-mail alerts | ✋ 需手動 Manual | Free | 5 min |
| 10 | App 內即時搜尋（含多段票、各國結帳比價）· Live search in the app | ✋ 需手動 Manual（選用）| 用 SerpApi 額度 | 3 min |
| 11 | 社群情報、活動通知、玩法庫 · Community deals, promotions & playbooks | ✅ 自動（通知可調）Automatic | Free | 0–5 min |

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

- 網址 URL：**https://aethersky.bluechiou.com**（公開，USERB 不需要 Vercel 帳號）
- Vercel 帳號：**seanx888**（與 GitHub 同一個），專案 `aethersky`（舊名 `business-class-tracker`，到 Vercel → Settings → General → Project Name 改名），已**連結 GitHub repo** `seanx888/aethersky`：
  - `main` 有程式碼更新 → **自動部署**正式網站；其他分支 / PR → 自動產生預覽網址。
  - 只有 `web/data/` 變動（每天的票價資料）時**略過部署**（Ignored Build Step），不浪費額度。
- **資料怎麼每天更新**：GitHub Actions 每天把票價寫進 repo 的 `web/data/`，App 直接從 GitHub 讀取最新資料
  （約 5 分鐘快取）→ **不需要**重新部署、**不需要** Vercel token。
  The app reads fare data straight from GitHub, so the site never needs a redeploy for new fares.

> 自訂網域 `aethersky.bluechiou.com` 由 Cloudflare DNS 指向 Vercel（CNAME `aethersky` → Vercel 在 Domains 頁顯示的目標，通常是 `cname.vercel-dns-0.com`，**DNS only 灰色雲**；
> 若 Vercel 要求 TXT `_vercel` 驗證，照它顯示的值新增，與同一網域下其他專案的那筆並存，兩筆都不要刪）。舊網域 `jcd-class.bluechiou.com` 已停用，
> 可在 Vercel Domains 與 Cloudflare DNS 刪除（或先設成導向新網域）。逐步操作見 [SECRETS.md 第 0 節](SECRETS.md#0-改名與網域--rename--domain)。
> Custom domain via Cloudflare DNS (CNAME, DNS only). The old `jcd-class` domain is retired.

<details>
<summary>替代方案：GitHub Pages · Alternative: GitHub Pages</summary>

**Settings → Pages → Source: GitHub Actions**（下方 *Visibility — start free for 30 days* 是企業版「私人網站」功能，**不需要**，忽略即可），
再新增 Variable `DEPLOY_TARGET` = `pages`。網址：`https://seanx888.github.io/aethersky/`
</details>

---

## 3. SerpApi 金鑰（Google Flights 真實票價）· SerpApi key

**金鑰只放一個地方：GitHub → Secrets → 名稱 `SERPAPI_KEY`。** 不是 Variables、不是 Environments、也不是 Vercel。
**The key goes in exactly one place: a GitHub repository *secret* named `SERPAPI_KEY`.** Not a Variable, not an Environment, not Vercel.

1. 註冊 Sign up：<https://serpapi.com/users/sign_up>（完成 email 驗證）
2. 複製金鑰 Copy key：<https://serpapi.com/manage-api-key> → **Your Private API Key**（64 個英數字）
3. 打開 <https://github.com/seanx888/aethersky/settings/secrets/actions>
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
第二位使用者用自己的 email 註冊自己的帳號、把金鑰給這個共用專案，屬灰色地帶——**最保險**是升級付費方案，或先寫信問 <support@serpapi.com>。
Technically supported (`SERPAPI_KEY_2`, automatic failover), but stacking free accounts may breach the spirit of the free tier — safest is a paid plan or asking SerpApi first.

---

## 4. ntfy 推播 — USERA & USERB 共用一個主題 · One shared ntfy topic

> ⏸ **目前暫停中 Currently paused**（`config/routes.json` → `"notifications": "paused"`）。
> 主題可以先設好；要開始推播時，在 GitHub **Variables** 新增 `NOTIFICATIONS` = `on`（刪除或設 `paused` 即再暫停）。
> Set up the topic now; add the variable `NOTIFICATIONS=on` when you want pushes to start.

ntfy 免費、免註冊。ntfy.sh 上的主題是公開的，**知道主題名稱的人就能看到訊息**，所以名稱要像密碼一樣保密，
**不要寫進 repo 的任何檔案**（這個 repo 是公開的）— 只放在 GitHub Secret。

1. **兩人都安裝 ntfy App** — iPhone：App Store「ntfy」；Android：Google Play / F-Droid「ntfy」。允許通知。
2. **兩人都訂閱同一個主題**：App 內 **＋** → *Subscribe to topic* → 輸入你們的共用主題 → Server 用預設 `ntfy.sh` → **Subscribe**。
3. **GitHub Secret**：<https://github.com/seanx888/aethersky/settings/secrets/actions> → **Secrets** 分頁 → **New repository secret**
   - **Name**：`NTFY_TOPICS`
   - **Secret**：`family=<你們的主題>@zh-TW`（`family` 是名字，`@zh-TW` = 繁體中文；只填主題本身也可以，預設就是繁中）
4. **測試 Test**：瀏覽器打開 `https://ntfy.sh/<你們的主題>` → 在下方輸入框送一則測試訊息，兩支手機應該同時收到。

**你們會收到什麼 · What you'll receive**（開啟後）
- 每天約 **05:40（台北）**：新出現、評分 ≥ 72 的好價摘要，**繁體中文、新台幣 NT$**（Variable `NOTIFY_MIN_SCORE` 可調門檻）。
- `PRICE_ALERTS` 目標價達成時（第 5 步，`who` 用 `family` 或 `all`）：高優先通知。
- 示範資料 (demo) 不會推播。

> 之後想各自分開？改成 `usera=<主題A>@zh-TW,userb=<主題B>@en`，各自訂閱自己的主題。
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

打開 **https://aethersky.bluechiou.com** → iPhone：Safari **分享 → 加入主畫面**；Android：Chrome **⋮ → 安裝應用程式**。

App 一律以**繁體中文、新台幣**開啟（可在設定改語言／幣別，只影響那支手機）。票價預設只顯示**傳統航空**，
頂端「傳統航空｜LCC｜全部」一鍵切換。「特殊票價」分頁有 **外站出發** 與 **外國站結帳** 兩種省錢方式。
The app always opens in Traditional Chinese with NT$; full-service airlines by default; the *Special fares* tab covers ex-station and foreign-site checkout.

每支手機的設定是**各自獨立**的：語言（USERA 繁中／한국어、USERB English）、幣別、天合加權、外站定位成本、App 內目標價。
Each phone keeps its own language, currency, SkyTeam preference, positioning costs and in-app targets.

---

## 7. 第一次執行與檢查 · First run & check

1. **Actions → Daily fare scan & deploy → Run workflow**（provider 留空）→ **Run workflow**。
2. 約 2–5 分鐘後應為綠色 ✓。
3. 打開 https://aethersky.bluechiou.com ：「示範資料」提示消失；**設定 → 資料** 顯示 `serpapi` 與本月剩餘次數。
4. 之後每天 **台北時間 05:40** 自動執行，不用再手動。

---

## 8. Real Tracker 同步 · Tracker sync（Vercel）

**航線追蹤 → 即時追蹤** 新增的行程先存在手機裡；伺服器（每日掃描）要知道它們才會查價。
同步做法：App → Vercel Function → 寫入**私人**的 GitHub Variable `TRACKERS`（不會出現在公開程式碼），每日掃描直接讀取。
Trackers saved in the app are written to the private repository variable `TRACKERS` through a small Vercel function.

1. **建立 GitHub 權杖 Fine-grained token**：<https://github.com/settings/personal-access-tokens/new>
   - Token name：`aethersky-trackers`；Expiration：1 year（到期前記得更新）
   - Repository access：**Only select repositories** → `aethersky`
   - Permissions → Repository permissions → **Variables：Read and write**（其他都不用）→ **Generate token** → 複製
2. **Vercel 環境變數**：<https://vercel.com> → 專案 `aethersky` → **Settings → Environment Variables**（Production）
   - `TRACKERS_GITHUB_TOKEN` = 第 1 步的權杖（勾選 Sensitive）
   - `PASSWORD_USERA`、`PASSWORD_USERB` = USERA、USERB 各自的**初始密碼**（≥ 12 字元、不可相同）；`SESSION_SECRET` = 隨機字串 ≥ 32 字元（`openssl rand -base64 48`）
   - 存檔後**重新部署**（Deployments → 最新一筆 ⋯ → Redeploy）。舊的 `GOOGLE_CLIENT_ID`、`ALLOWED_EMAILS`、`APP_PASSCODE` 已不使用，可刪除。
3. **兩支手機**：App → **設定 → 同步** → 輸入初始密碼登入（密碼會自動辨識是 USERA 或 USERB）→ App 會**立刻要求設定自己的新密碼**，改完才會開始同步。之後新增／修改／暫停／刪除都會自動同步。
   詳細說明與忘記密碼的處理：[SECRETS.md 第 B 節](SECRETS.md#b-追蹤同步與登入vercel--github-權杖)。
4. 驗證：GitHub → Settings → Secrets and variables → Actions → **Variables** 出現 `TRACKERS` 與 `AUTH`（只含密碼雜湊）。

> 不想設定同步？在「即時追蹤」頁最下方 **複製 JSON** → 貼到 Variable `TRACKERS`（每次修改都要重貼）。
> Without sync: copy the JSON at the bottom of the Real Tracker page into the `TRACKERS` variable by hand.

**省額度說明**：固定日期每天 1 次搜尋；彈性日期（±N 天）每天 2 次（重查目前最便宜的日期 + 探索新日期）。
追蹤最多用掉每日額度的 75%，其餘留給每日好價輪替。SerpApi 免費方案每天約 8 次 → 建議同時 3–4 個追蹤。
🔒 `web/data/trackers.json` 是公開的：只有航點、日期、價格，**不含名稱（label）、通知對象、Email**。

---

## 9. 追蹤 Email 通知 · Tracker e-mail alerts（像 Google Flights）

價格明顯變化（≥ NT$1,000 且 ≥ 3%）、找到更便宜的彈性日期、達到目標價（可選：漲價）時寄 Email；
第一次查到價格時會寄「開始追蹤」確認信。有設定 `NTFY_TOPICS` 的話也會同時推播。
⚠️ 示範資料（demo）不寄信 — 要先完成第 3 步 SerpApi 金鑰。

**A. 用 Gmail 寄信（最簡單）**
1. Google 帳戶開啟兩步驟驗證 → <https://myaccount.google.com/apppasswords> → 建立應用程式密碼（名稱 `ÆtherSky`）→ 16 碼
2. GitHub **Secret** `SMTP_URL` = `smtps://你的帳號%40gmail.com:16碼密碼不含空白@smtp.gmail.com:465`
   （帳號裡的 `@` 要寫成 `%40`）

**B. 用 Naver 寄信（USERA）**
1. Naver 메일 → 환경설정 → **POP3/IMAP 설정** → IMAP/SMTP 사용 **사용함**；若開了 2단계 인증，到 네이버 보안설정建立 **애플리케이션 비밀번호**
2. `SMTP_URL` = `smtps://아이디%40naver.com:앱비밀번호@smtp.naver.com:465`

**收件人 Recipients** — GitHub **Secret** `ALERT_EMAILS`（Email 是個資，務必放 Secrets）：
```
usera=USERA的信箱#zh-TW,userb=USERB的信箱#en
```
名字要和 App「通知誰」的選項一致（`config/routes.json` → `people`）；`#ko` = 韓文信件。

選用 Optional：Variable `MAIL_FROM` = `ÆtherSky <你的帳號@gmail.com>`；Variable `TRACKER_NOTIFICATIONS` = `paused` 暫停所有追蹤通知。
也可改用 [Resend](https://resend.com)（Secret `RESEND_API_KEY`，需驗證自己的網域才能寄給別人）。

**測試 Test**：Actions → Run workflow → 跑完看 Summary 的 **Real Tracker** 一列，例如 `sent: mail:usera, mail:userb`。

---

## 10. 即時搜尋 · Live flight search（航線追蹤 → 搜尋）

「航線追蹤」分頁的第一個畫面是**搜尋表單**：來回／單程／**多段票（最多 5 段，可加停留點）**，艙等（預設商務艙）、轉機、聯盟、指定航空公司、乘客、行李、最長時間；
搜尋時打開「追蹤這個搜尋」就能同時設定目標價、彈性日期、通知與「哪國結帳最便宜」，一次完成。
The Routes tab opens on a search form (round trip / one way / multi-city up to 5 legs). Switch on “Track this search” to set a target price, flexible dates, alerts and a daily “cheapest country to pay” check in the same step.

- **不設定也能用**：沒有即時搜尋時，表單會給你 Google Flights / KAYAK / Skyscanner 的一鍵連結（帶入全部條件）和各國結帳的免費連結；追蹤照常運作。
- **要開啟即時搜尋**：在 **Vercel → Settings → Environment Variables** 加入和 GitHub 一樣的 `SERPAPI_KEY`（可加 `SERPAPI_KEY_2`），然後 Redeploy。
  搜尋需要先**登入**（第 8 步的兩組密碼），因為每次搜尋都會用掉 SerpApi 額度；公開頁面不會。
- **額度保護**：Variable/環境變數 `SEARCH_RESERVE`（預設 60）= 永遠留給每日掃描的搜尋次數；剩餘額度低於這個數字，即時搜尋會暫停並說明原因。每人 10 分鐘最多 30 次請求。
- **一次搜尋用多少額度**：單程/來回 1–3 次；多段票每多一段、每個被驗證的選項多 1 次（最多 5 次）。「比較各國結帳價」每個國家 1 次（預設 10 國，可取消勾選；開始前會先詢問）。
- 每個追蹤每天用 1 次搜尋（彈性日期 2 次；勾「同時追蹤各國結帳價」再多 1 次）。
- 多段票的 Google Flights 連結是照 Google 的網址格式組出來的，尚未能在這個環境實測；如果 Google 改了格式，連結可能只會打開 Google Flights 而沒有帶入條件（KAYAK 連結和 App 內的搜尋不受影響）。

---

## 11. 社群情報、活動通知與玩法庫 · Community deals, promotions & playbooks

**今日好價**分頁多了兩個分頁：**社群情報**（低票價、外站票、多段票、聯運、停留點、隱藏城市、錯誤票價）和 **活動**（票價折扣、指定航線促銷、**會籍 Match**、里程加碼、兌換機票優惠 — 航空、**飯店集團**、郵輪、租車都算）。
每天 GitHub Actions 掃描時讀取公開的 RSS/Atom 來源（`config/sources.json`），分類後寫入 `web/data/community.json`，App 直接讀取。**特殊票價 → 玩法庫**說明每種玩法的邏輯、購買步驟、真實成本與風險（含貼文裡的阿提哈德聯運範例與成本試算）。

**來源與限制（重要）**

| 來源 | 狀態 | 說明 |
|---|---|---|
| Travel-Dealz、Fly4free、The Flight Deal、r/awardtravel、The MileLion、Head for Points、Doctor of Credit、OMAAT、View from the Wing、PTT 航空/省錢版 | ✅ 自動讀取 | RSS，每天一次 |
| Secret Flying | ⛔ 通常被擋 | 網站用 Cloudflare 擋雲端機房（GitHub Actions）。App 會標示「被擋住」；在家裡/VPS 網路跑 `node scripts/community.mjs` 才讀得到 |
| FlyerTalk | ⛔ 預設關閉 | Cloudflare 直接拒絕機房 IP（error 1005）|
| Reddit r/flightdeals | ⛔ 預設關閉 | 該社群已停止更新 |
| **Facebook 社團** | ❌ 程式無法讀取 | Facebook 禁止自動讀取且需登入。請用 **社群情報 → 貼上貼文**：貼上文字就會解析出路線、價格、航空公司、玩法，並一鍵帶入搜尋/追蹤 |

- 一律排除中國大陸／香港／澳門（航空公司、城市、機場代碼、班機號）；被排除的則數會顯示在畫面上。
- 新增來源：在 `config/sources.json` 加一筆（RSS/Atom 網址；`enabled: false` 可關閉；`include` 是標題關鍵字過濾）。
- 讀不到的來源不會讓整個掃描失敗；Actions 的 Summary 會列出每個來源的狀態。

**通知（與追蹤通知用同一組管道）**：新的強力好價、疑似錯誤票價、會籍 Match 和你會員的活動，會用 `NTFY_TOPICS` 推播、`ALERT_EMAILS` + `SMTP_URL`/`RESEND_API_KEY` 寄信（每人用自己的語言）。
第一次執行不會寄（因為全部都是「新的」）。App 打開時也會提醒新的強力好價與**你有的會員**的活動（每則只提醒一次）。

調整誰收到什麼 — GitHub **Variable** `PROMO_ALERTS`（JSON，沒有設定 = 每人收到最強的幾則）：
```json
[
  {"who":"usera","brands":["DL","KE","MARRIOTT","HILTON"],"kinds":["status-match","bonus-miles","fare-sale"],"minRelevance":45,"deals":true},
  {"who":"userb","brands":[],"kinds":["status-match","error-fare"],"minRelevance":55,"deals":false}
]
```
`brands` = 會員卡夾的方案代碼（`DL` `KE` `MARRIOTT` `HILTON` `HYATT` `IHG` `ACCOR` `HERTZ`…）或航空公司代碼；空 = 不限。`kinds` 空 = 不限；`deals:false` = 只收活動不收好價。
暫停這類通知：Variable `COMMUNITY_NOTIFICATIONS` = `paused`（仍會更新資料）。

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
| `SERPAPI_KEY`, `SERPAPI_KEY_2` | **Vercel** env | 開啟 App 內即時搜尋（第 10 步）；和 GitHub 用同一把金鑰 |
| `SEARCH_RESERVE` | **Vercel** env | 選用：留給每日掃描的搜尋次數，即時搜尋不會用到（預設 60）|
| `NTFY_TOPICS` | Secret | `family=<共用主題>@zh-TW`（或各自 `usera=…@zh-TW,userb=…@en`）|
| `VERCEL_TOKEN` | Secret | 不需要（只有 `DEPLOY_TARGET=vercel` 的進階用法才需要）|
| `DUFFEL_ACCESS_TOKEN` | Secret | 選用 |
| `NTFY_TOKEN` | Secret | 選用：受保護主題 |
| `ALERT_EMAILS` | Secret | 追蹤 Email 收件人 `usera=信箱#zh-TW,userb=信箱#en`（第 9 步）|
| `SMTP_URL` | Secret | 寄信伺服器 `smtps://帳號%40gmail.com:應用程式密碼@smtp.gmail.com:465`（第 9 步）|
| `RESEND_API_KEY` | Secret | 選用：用 Resend 取代 SMTP |
| `TRACKERS` | Variable | Real Tracker 行程 JSON（App 同步自動寫入，第 8 步）|
| `TRACKER_NOTIFICATIONS` | Variable | `paused` = 暫停追蹤通知（預設開啟）|
| `PROMO_ALERTS` | Variable | 選用：社群好價／活動通知的個人化 JSON（第 11 步）|
| `COMMUNITY_NOTIFICATIONS` | Variable | `paused` = 暫停社群好價／活動通知（資料照常更新）|
| `MAIL_FROM` | Variable | 選用：寄件人名稱與地址 |
| `PASSWORD_USERA`, `PASSWORD_USERB`, `SESSION_SECRET`, `TRACKERS_GITHUB_TOKEN` | **Vercel** env | 追蹤同步與兩組密碼登入（第 8 步）|
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
| 同步顯示「伺服器尚未設定」| 畫面會列出缺少或無效的變數（也可開 `/api/auth` 看 `problems`）：`PASSWORD_USERA` / `PASSWORD_USERB`（≥ 12 字元、不可相同）、`SESSION_SECRET`（≥ 32 字元）、`TRACKERS_GITHUB_TOKEN`；設定後要 Redeploy |
| 登入顯示「密碼不正確」| 輸入的不是 USERA 或 USERB 目前的密碼；改過密碼後初始密碼就作廢。忘記了 → SECRETS.md 第 B 節「忘記密碼」|
| 登入後一直要求更改密碼 | 還在用初始密碼；設定新密碼（≥ 12 字元）後才會開始同步 |
| 同步失敗 | 權杖過期或沒有 **Variables: Read and write** 權限（第 8 步）|
| 搜尋顯示「即時搜尋尚未啟用」| Vercel 環境變數沒有 `SERPAPI_KEY`，或設定後沒有 Redeploy（第 10 步）。還沒設定時表單會給 Google Flights / KAYAK 連結 |
| 搜尋顯示「額度已接近保留量」| 本月 SerpApi 剩餘額度低於 `SEARCH_RESERVE`（預設 60）；調低它，或等下個月/加第二把金鑰 |
| 社群情報顯示「還沒有社群資料」| 還沒跑過每日掃描；Actions → Run workflow，或本機 `node scripts/community.mjs` |
| 社群來源顯示「被擋住」| Secret Flying 等會擋雲端機房，屬預期；直接開網站，好貼文用「貼上貼文」|
| 沒收到追蹤 Email | 還在 demo 資料？`ALERT_EMAILS` 名字和「通知誰」一致？Gmail 要用**應用程式密碼**；Summary 的 Real Tracker 列會顯示寄送結果；查垃圾郵件匣 |
