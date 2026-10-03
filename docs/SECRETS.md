# ÆtherSky 金鑰與設定總表 · Secrets & config master list

> 給 USERA & USERB「全面重設」用。Repo：`seanx888/aethersky` · App：**https://aethersky.bluechiou.com**
> 各功能的背景說明看 [SETUP.md](SETUP.md)；本檔只講 **要填什麼、填在哪、怎麼拿、怎麼驗證**。

## 先看這裡 · Read first

- **Secret**＝機密（金鑰、密碼、Email）。**Variable**＝一般設定（可再編輯、不機密）。**Public value**＝本來就公開的值（Supabase anon key）。
- 金鑰只放「該放的那一個地方」。放錯地方 = 讀不到（最常見錯誤：GitHub 的 Secret 放成 Variable 或 Environment secret）。
- **不要把任何金鑰貼進 repo 檔案、issue、聊天**（repo 是公開的）。
- 這個 repo 的程式碼**目前實際會讀取**的金鑰，只有 §A、§B、§C（票價掃描、追蹤同步、通知）。
  §D、§E（Supabase + FlightAware + 手機 App）是 P1 階段，**要做手機 App 才需要**。§F 是計畫中、程式還沒讀，**現在不要設定**。

## 全部一覽 · Everything at a glance

| 優先 | 名稱 Name | 放在哪 Where | 用途 | 費用 | 步驟 |
|---|---|---|---|---|---|
| ★必要 | `SERPAPI_KEY` | GitHub **Secret** | 真實票價（Google Flights）。沒有 → 只顯示示範資料 | Free 250 次/月 | [A1](#a1-serpapi_key--真實票價) |
| ★推薦 | `PASSWORD_USERA` / `PASSWORD_USERB` | **Vercel** env | USERA 與 USERB 各一組**初始密碼**（密碼本身就決定是誰；登入後強制自己改）| 自己產生 | [B2](#b2-vercel-環境變數與登入) |
| ★推薦 | `SESSION_SECRET` | **Vercel** env | 簽登入 Cookie 的隨機字串（≥32 字元）| 自己產生 | [B2](#b2-vercel-環境變數與登入) |
| 選用 | `SERPAPI_KEY` / `SERPAPI_KEY_2` | **Vercel** env | 開啟 App 內即時搜尋（和 GitHub 同一把金鑰）| 用 SerpApi 額度 | [B2](#b2-vercel-環境變數與登入) |
| 選用 | `SEARCH_RESERVE` | **Vercel** env | 留給每日掃描的搜尋次數（預設 60）| — | [B2](#b2-vercel-環境變數與登入) |
| ★推薦 | `TRACKERS_GITHUB_TOKEN` | **Vercel** env | GitHub 權杖，讓 App 寫入 `TRACKERS`，也存放改過的密碼（雜湊）| Free | [B1](#b1-github-fine-grained-權杖) |
| ★推薦 | `SMTP_URL` | GitHub **Secret** | 寄追蹤 Email 的帳號密碼 | Free | [C1](#c1-email-追蹤通知) |
| ★推薦 | `ALERT_EMAILS` | GitHub **Secret** | 收件人 | Free | [C1](#c1-email-追蹤通知) |
| 選用 | `NTFY_TOPICS` | GitHub **Secret** | ntfy 手機推播主題（等於密碼） | Free | [C2](#c2-ntfy-推播) |
| 選用 | `NTFY_TOKEN` | GitHub **Secret** | 受保護的 ntfy 主題 | — | [C2](#c2-ntfy-推播) |
| 選用 | `SERPAPI_KEY_2` | GitHub **Secret** | 第二個 SerpApi 金鑰（灰色地帶，見 A1） | — | [A1](#a1-serpapi_key--真實票價) |
| 選用 | `DUFFEL_ACCESS_TOKEN` | GitHub **Secret** | Duffel 航空公司直連報價 | 依用量 | [A2](#a2-duffel_access_token--選用) |
| 選用 | `RESEND_API_KEY` | GitHub **Secret** | 用 Resend 取代 SMTP 寄信 | Free 額度 | [C1](#c1-email-追蹤通知) |
| 不需要 | `VERCEL_TOKEN` | GitHub **Secret** | 只有 `DEPLOY_TARGET=vercel` 才要 | — | 略 |
| P1 | `AEROAPI_KEY` | **Supabase** secret | FlightAware 航班資料 | Personal 有免費額度 | [D3](#d3-flightaware-aeroapi) |
| P1 | `AEROAPI_WEBHOOK_SECRET` | **Supabase** secret | 驗證 FlightAware 的 webhook | 自己產生 | [D3](#d3-flightaware-aeroapi) |
| P1 | `AETHER_API_BASE` / `AETHER_API_KEY` | Flutter build 參數 | App 連 Supabase（anon key 是公開值） | — | [E1](#e1-flutter-app-build-參數) |

Variables（選用，全部在 GitHub → Variables，見 [附錄](#附錄--github-variables-全表)）：`NOTIFICATIONS`、`TRACKER_NOTIFICATIONS`、`MAIL_FROM`、`PRICE_ALERTS`、`WATCH_TRIPS`、`NOTIFY_MIN_SCORE`、`SEARCHES_PER_RUN`、`SITE_URL`…

**固定連結（GitHub 設定頁）**
- Secrets：<https://github.com/seanx888/aethersky/settings/secrets/actions>（要停在 **Secrets** 分頁 → **Repository secrets** → New repository secret）
- Variables：<https://github.com/seanx888/aethersky/settings/variables/actions>

---

## 0. 改名與網域 · Rename & domain

> 目標：repo `aethersky`、網域 `aethersky.bluechiou.com`。程式碼裡的舊名稱（`Business-Class-Tracker`、`jcd-class.bluechiou.com`、`business-class-tracker`）已全部換掉。

**目前狀態（2026-09-29 查到）**
- GitHub repo：已是 `seanx888/aethersky` ✅
- Vercel 專案：名稱仍是 `business-class-tracker` ⚠️（要手動改）；`aethersky.bluechiou.com` 已加入並**已驗證** ✅

**你要做的**
1. **Vercel 專案改名**：<https://vercel.com/seanx888> → 專案 → **Settings → General → Project Name** → `aethersky` → Save。
   （改名後舊的 `business-class-tracker-*.vercel.app` 備用網址會變成 `aethersky-*.vercel.app`。）
2. **確認 Git 連結**：Settings → **Git** → Connected Git Repository 顯示 `seanx888/aethersky`。若還是舊名或顯示錯誤 → **Disconnect** 再 **Connect** 選 `aethersky`。
   Vercel 的 GitHub App 需要有 `aethersky` repo 的存取權：GitHub → Settings → Applications → Vercel → Configure → Repository access。
3. **確認專案設定**（重建專案時才需要重設）：**Root Directory = `web`**（`web/api/trackers.mjs` 才會變成 `/api/trackers`）、Framework Preset = *Other*、
   Production Branch = `main`。（要省額度可在 Settings → Git → **Ignored Build Step** 設成只有 `web/data/` 變動時略過。）
4. **網域**：Settings → **Domains** → `aethersky.bluechiou.com` 應顯示 *Valid Configuration*，並設為 Production。
   **移除舊網域** `jcd-class.bluechiou.com`（或改成 *Redirect to* 新網域）。
5. **Cloudflare DNS**（<https://dash.cloudflare.com> → `bluechiou.com` → DNS → Records）：
   - 新增 **CNAME** `aethersky` → Vercel Domains 頁顯示的目標（通常 `cname.vercel-dns-0.com`），**Proxy status = DNS only（灰色雲）**。
   - 若 Vercel 要求 **TXT** `_vercel` 驗證 → 照它顯示的值新增；與同一網域下其他專案的那筆並存，**兩筆都不要刪**。
   - 舊的 CNAME `jcd-class` 確認新網域可開之後再刪。
6. **兩支手機重新安裝**：舊網域的 PWA 和新網域是不同的「網站」，手機上的資料**不會自動搬過來**。
   - **會員卡夾**：舊 App → **會員** 分頁 → **匯出備份** → 開新網址 → **加入主畫面** → 會員分頁 **匯入**。
   - **Real Tracker**：已同步的話，新 App → **設定 → 同步** → 輸入你的密碼登入，追蹤會自動回來。
   - 語言、幣別、天合加權等偏好設定需重新選一次。
7. **驗證**：<https://aethersky.bluechiou.com> 能開、`https://aethersky.bluechiou.com/api/trackers?ping=1` 回 JSON（`{"configured": …}`）。

---

## A. 票價掃描（GitHub Actions）

### A1. `SERPAPI_KEY` — 真實票價
**放：GitHub → Secrets。**（不是 Variables、不是 Environment secrets、不是 Vercel）

1. 註冊 <https://serpapi.com/users/sign_up> → 完成 Email 驗證。
2. <https://serpapi.com/manage-api-key> → 複製 **Your Private API Key**（64 個英數字）。
   （重設全部：同頁可 **Regenerate** → 舊金鑰立刻失效。）
3. <https://github.com/seanx888/aethersky/settings/secrets/actions> → **New repository secret**
   - Name：`SERPAPI_KEY`（全大寫，前後無空格）
   - Secret：貼上金鑰（不加引號、不留空白）→ **Add secret**
4. 驗證：**Actions → Daily fare scan & deploy → Run workflow** → 跑完看 **Summary**：
   `Provider: serpapi ✅` + `SerpApi quota left: …` = 成功。`demo ⚠️` = 放錯位置。
5. 額度：免費 250 次/月，程式自動分配約 8 次/天；用量看 <https://serpapi.com/dashboard>。

> `SERPAPI_KEY_2`（選用）：第二個帳號金鑰，第一個用完自動切換。SerpApi 免費方案原意是一人一帳號，多帳號疊加有被停用風險；最保險是升級付費或先問 <support@serpapi.com>。

### A2. `DUFFEL_ACCESS_TOKEN` — 選用
1. <https://app.duffel.com> 註冊 → 完成帳戶驗證啟用 **live mode**。
2. **Developers → Access tokens** → 建立 **live** token（`duffel_live_…`）。
3. GitHub Secret `DUFFEL_ACCESS_TOKEN`；要優先使用 Duffel 時再加 Variable `FARE_PROVIDER` = `duffel`。

---

## B. 追蹤同步與登入（Vercel + GitHub 權杖）

App 內新增的 Real Tracker → Vercel Function → 寫入 GitHub Variable `TRACKERS` → 每日掃描讀取。
**會用到 SerpApi 額度的只有「每日掃描」，而它只查你同步上來的追蹤**，所以把「同步」鎖起來就等於鎖住額度：

- 只有輸入正確密碼才能同步；**密碼本身就決定你是 USERA 還是 USERB**（兩組密碼不能相同），不需要帳號、不需要 Google。
- 網站與票價頁維持公開（票價資料在公開 repo，本來就看得到）；訪客不會消耗任何額度。
- 打開網站時會跳出登入視窗（可按「稍後再說，先瀏覽」略過；關掉分頁前不會再跳）。
- 登入資訊是簽章過的 HttpOnly Cookie；新增追蹤時「通知誰」預設就是登入的那個人。
- **記住我**（預設勾選）：這台裝置 90 天內免再登入，用得越久會自動續期；沒勾選則關閉瀏覽器就登出（最長 24 小時）。公用電腦請取消勾選，或在 設定 → 同步 按「登出」。

**密碼怎麼運作**
1. **初始密碼**放在 Vercel（`PASSWORD_USERA`、`PASSWORD_USERB`）。用初始密碼登入後，App 會**立刻要求設定你自己的新密碼**；改完之前「同步追蹤清單」是鎖住的。
2. **你自己的密碼**只以加鹽的 scrypt 雜湊存在 GitHub Variable `AUTH`（App 用 `TRACKERS_GITHUB_TOKEN` 自動寫入，不用手動建立）。改完後初始密碼就作廢；改密碼會把你在其他裝置的登入一併登出。
3. **忘記密碼**：GitHub → Settings → Secrets and variables → Actions → **Variables** → `AUTH` → 編輯，把你的那一項（`"usera": {…}` 或 `"userb": {…}`）刪掉（或整個 Variable 刪除）→ 又可以用 Vercel 的初始密碼登入，並再次被要求改密碼。
   ⚠️ 初始密碼若曾出現在聊天或截圖，重設前先到 Vercel 換成新的隨機初始密碼。
4. **想暫時踢掉某人**：從 Vercel 刪掉他的 `PASSWORD_XXX`，他的登入立刻失效。

### B1. GitHub fine-grained 權杖
**放：Vercel env `TRACKERS_GITHUB_TOKEN`（B2）。** 追蹤清單與密碼雜湊都靠它寫入 GitHub Variables。

1. <https://github.com/settings/personal-access-tokens/new>（登入 seanx888）
2. Token name：`aethersky-trackers`；Expiration：1 year（**到期前要換**，日曆記一下）。
3. Resource owner：`seanx888`；Repository access：**Only select repositories** → **`aethersky`**。
4. Repository permissions → **Variables：Read and write**（其他全部不給）→ **Generate token** → 立刻複製（只顯示一次，`github_pat_…`）。
5. 舊權杖：<https://github.com/settings/personal-access-tokens> → 舊的 `aethersky-trackers` → **Delete**（全面重設就刪掉舊的）。

### B2. Vercel 環境變數與登入
<https://vercel.com/seanx888> → 專案 `aethersky` → **Settings → Environment Variables**（Production）

| Key | Value | 備註 |
|---|---|---|
| `PASSWORD_USERA` | USERA 的**初始**密碼，≥ 12 字元 | 勾 **Sensitive**；建議隨機（例如 `XXXX-XXXX-XXXX-XXXX`）|
| `PASSWORD_USERB` | USERB 的**初始**密碼，≥ 12 字元，不可與 USERA 的相同 | 同上 |
| 其他名稱的 `PASSWORD_*` | 舊變數 | 名稱必須是 `PASSWORD_USER` + 一個字母（`USERA`、`USERB`…），其他名稱一律**不會被讀取**，可放心刪除 |
| `SESSION_SECRET` | 隨機字串 ≥ 32 字元（`openssl rand -base64 48`）| 勾 **Sensitive**；換掉這個值 = 所有人被登出 |
| `TRACKERS_GITHUB_TOKEN` | B1 的權杖 | 勾 **Sensitive** |
| `SERPAPI_KEY` | 和 GitHub Secret 同一把（選用）| 開啟 App 內**即時搜尋**；沒設定時搜尋頁改給 Google Flights / KAYAK 連結，追蹤不受影響。勾 **Sensitive** |
| `SERPAPI_KEY_2` | 第二把（選用）| 第一把額度不足時自動改用 |
| `SEARCH_RESERVE` | 數字，預設 `60`（選用）| 每月永遠留給每日掃描的搜尋次數；即時搜尋不會把額度用到低於它 |
| `TRACKERS_REPO` | （不用填）預設已是 `seanx888/aethersky` | 若設過，值必須是 `seanx888/aethersky`，或直接刪掉 |
| ~~`GOOGLE_CLIENT_ID`~~、~~`ALLOWED_EMAILS`~~、~~`APP_PASSCODE`~~ | 舊方案 | **刪除**（已不再使用；Google Cloud 那個專案也可以刪）|

- 環境變數要**重新部署**才生效（合併 PR 會自動部署）。
- 驗證 ①：開 `https://aethersky.bluechiou.com/api/auth` → `{"configured":true,"user":null,"problems":[]}`。
  `configured:false` 時 `problems` 會列出缺少或無效的變數名稱（只有名稱，沒有值）；若寫 `GitHub variables unreachable`，檢查 `TRACKERS_GITHUB_TOKEN` 與 `TRACKERS_REPO`。
- 驗證 ②：App → **設定 → 同步** → 輸入初始密碼 → 顯示「已登入：USERA」和一個**要求更改密碼**的表單 → 設定新密碼（≥ 12 字元）→ 顯示「已同步」。
- 驗證 ③：GitHub → Variables 會出現 `TRACKERS`、`AUTH`（App 自動寫入）。`AUTH` 裡只有雜湊，看不到密碼。

---

## C. 通知

### C1. Email 追蹤通知
**放：GitHub → Secrets（Email 與密碼都是個資，禁止放 Variables）。**
兩個都要：`SMTP_URL`（寄件帳號）+ `ALERT_EMAILS`（收件人）。

**方案 A — Gmail 寄信（建議）**
1. Google 帳戶開啟 **兩步驟驗證** → <https://myaccount.google.com/apppasswords> → 建立應用程式密碼（名稱 `ÆtherSky`）→ 16 碼。
2. Secret `SMTP_URL` = `smtps://你的帳號%40gmail.com:16碼密碼不含空白@smtp.gmail.com:465`（帳號裡的 `@` 寫成 `%40`）

**兩個寄信帳號（選用）**：`SMTP_URL` 可放多組，用逗號隔開，第一組失敗（密碼錯、被 Google 暫停）會自動改用下一組：
```
smtps://a%40gmail.com:第一個帳號的16碼@smtp.gmail.com:465,smtps://b%40gmail.com:第二個帳號的16碼@smtp.gmail.com:465
```
⚠️ **每個 Google 帳號的應用程式密碼都不同**（Google 隨機產生、各帳號獨立）；兩組 16 碼一模一樣，其中一組必定是錯的。
Actions 紀錄是公開的，失敗訊息只會寫「account #1 / #2」，不會印出信箱。

**方案 B — Naver 寄信（USERA）**
1. Naver 메일 → 환경설정 → **POP3/IMAP 설정** → IMAP/SMTP **사용함**；有 2단계 인증 → 네이버 보안설정建立 **애플리케이션 비밀번호**。
2. Secret `SMTP_URL` = `smtps://아이디%40naver.com:앱비밀번호@smtp.naver.com:465`

**方案 C — Resend（選用，取代 SMTP）**：<https://resend.com> → API Keys → Secret `RESEND_API_KEY`；要寄給別人必須先驗證自己的網域（可用 `bluechiou.com`），並設 Variable `MAIL_FROM`。（同時有 `SMTP_URL` 時 SMTP 優先。）

**收件人** Secret `ALERT_EMAILS`（名字要和 App「通知誰」一致）：
```
usera=USERA的信箱#zh-TW,userb=USERB的信箱#en
```
`#ko` = 韓文信件。選用 Variable：`MAIL_FROM` = `ÆtherSky <你的帳號@gmail.com>`。

驗證：Actions → Run workflow → Summary 的 **Real Tracker** 一列出現 `sent: mail:usera, mail:userb`（demo 資料不寄信，需先完成 A1）。

### C2. ntfy 推播
**放：GitHub → Secrets `NTFY_TOPICS`。** ntfy.sh 上「知道主題名稱的人就能看到訊息」，主題名等於密碼，**不要寫進任何檔案**。

1. 兩人安裝 **ntfy** App（App Store / Google Play）→ 允許通知。
2. 想一個**很難猜的主題**（例如 `aethersky-` + 12 位以上隨機字）；App 內 **＋ → Subscribe to topic** → 輸入主題 → Server 預設 `ntfy.sh`。
3. Secret `NTFY_TOPICS` = `family=<主題>@zh-TW`（各自分開：`usera=<主題A>@zh-TW,userb=<主題B>@en`）。
4. 測試：瀏覽器開 `https://ntfy.sh/<主題>` 送一則訊息，手機應收到。
5. 開始推播：Variable `NOTIFICATIONS` = `on`（目前 `config/routes.json` 是 `paused`）。
6. 自架或受保護主題：Variable `NTFY_SERVER`、Secret `NTFY_TOKEN`（access token）。

---

## D. 手機 App 後端 · Supabase + FlightAware（P1，要做手機 App 才需要）

> 詳細指令見 [backend/README.md](../backend/README.md)。**Supabase 自己提供的** `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 會自動注入 Edge Function，**不用手動設定**。

### D1. Supabase 專案
1. <https://supabase.com> → New project → Region **Tokyo (ap-northeast-1)** → 設定 **Database password**（存密碼管理員；`supabase db push` 會要）。
2. **Project Settings → API** 記下：
   - **Project URL**（`https://<ref>.supabase.co`）→ 公開值
   - **anon public key** → 公開值（給 App，§E1）
   - **service_role key** → 🔒 **最高權限，只能留在 Supabase**，不要放 App、GitHub、Vercel。
3. **Project ref**：URL 中的 `<ref>`。

### D2. Supabase CLI
```bash
npm i -g supabase          # 或 brew install supabase/tap/supabase
supabase login             # 瀏覽器授權（產生 access token，存在本機）
supabase link --project-ref <ref>
supabase db push           # 套用 migrations（會要 Database password）
```

### D3. FlightAware AeroAPI
1. <https://www.flightaware.com/aeroapi/portal> → 註冊 Personal 方案（有每月免費額度）→ 建立 **API key**。
2. 產生 webhook 密碼：`openssl rand -hex 32`
3. 寫入 Supabase 並部署：
   ```bash
   supabase secrets set AEROAPI_KEY=<FlightAware key> AEROAPI_WEBHOOK_SECRET=<上一步的隨機字串>
   supabase functions deploy flight-lookup                     # App 用 anon key 呼叫（驗 JWT）
   supabase functions deploy aeroapi-webhook --no-verify-jwt   # FlightAware 呼叫，靠 ?secret= 保護
   ```
4. 在 AeroAPI Portal 把 alert 的 delivery endpoint 設為
   `https://<ref>.supabase.co/functions/v1/aeroapi-webhook?secret=<AEROAPI_WEBHOOK_SECRET>`（以 Portal 現行畫面為準）。
   ⚠️ 這條網址含密碼，不要貼到任何公開處。
5. 驗證：`curl "https://<ref>.supabase.co/functions/v1/flight-lookup?ident=BR198&date=2026-12-20" -H "Authorization: Bearer <anon key>" -H "apikey: <anon key>"`

---

## E. Flutter 手機 App

### E1. Flutter App build 參數
App 內**沒有任何機密**；以下都是編譯時參數（`--dart-define`）：

| 參數 | 值 | 預設 |
|---|---|---|
| `AETHER_API_BASE` | `https://<ref>.supabase.co/functions/v1` | 空 = 用內建示範航班 |
| `AETHER_API_KEY` | Supabase **anon public key**（公開值） | 空 |
| `AETHER_DATA_BASE` | 票價資料網址 | `https://raw.githubusercontent.com/seanx888/aethersky/main/web/data/`（已改新 repo 名）|

```bash
cd apps/mobile
flutter run --dart-define=AETHER_API_BASE=https://<ref>.supabase.co/functions/v1 --dart-define=AETHER_API_KEY=<anon key>
```
Android 套件 ID `app.aethersky.aethersky`；上架用的簽章金鑰、Apple / Google 開發者帳號屬 P1 之後，見 [PLAN.md §7](aethersky/PLAN.md)。

---

## F. 計畫中、程式還沒讀 — 現在**不要**設定

這些在 [PLAN.md](aethersky/PLAN.md) 裡，但 repo 程式碼還沒有任何地方讀取它們；等做到該階段再申請，避免多放一堆用不到的金鑰：

| 服務 | 用途 | 階段 |
|---|---|---|
| RevenueCat（+ Apple / Google 訂閱） | 付費訂閱權益 webhook | P2 |
| Firebase Cloud Messaging / Apple APNs | 手機推播、iOS Live Activity | P1 後段 |
| Apple Developer（US$99/年）、Google Play（US$25） | 上架 | 上架前 |
| OAG Flight Info API | 班表 | P2 |
| Anthropic API（Claude 旅行助理） | AI 助理 | P3 |
| seats.aero、LoungeReview / DragonPass | 里程兌換位、貴賓室 | P3 |

---

## 重設檢查清單 · Reset checklist

**先撤銷舊的**（舊值可能留在聊天、截圖、舊設定）
- [ ] SerpApi：<https://serpapi.com/manage-api-key> → Regenerate
- [ ] GitHub 舊權杖 `aethersky-trackers`（或舊專案名的）→ Delete
- [ ] Gmail / Naver 應用程式密碼：刪掉舊的、重建
- [ ] ntfy 主題：換一個新的（舊主題名視為已洩漏）
- [ ] GitHub Secrets 頁：刪掉不再使用的舊 Secret（`SERPAPI_API_KEY`、`NTFY_TOPIC` 是舊別名，統一用 `SERPAPI_KEY` / `NTFY_TOPICS`）
- [ ] GitHub **Variables** 頁確認沒有任何金鑰（`SERPAPI_KEY`、`SMTP_URL`… 放在 Variables = 公開風險，Actions 會報紅字）

**再設定**
- [ ] §0 Vercel 改名 `aethersky` + 網域 + Cloudflare DNS
- [ ] A1 `SERPAPI_KEY` → 手動 Run workflow → Summary 顯示 `serpapi ✅`
- [ ] B1 權杖 → B2 Vercel env（`PASSWORD_USERA`、`PASSWORD_USERB`、`SESSION_SECRET`、`TRACKERS_GITHUB_TOKEN`；刪掉 `GOOGLE_CLIENT_ID`、`ALLOWED_EMAILS`、`APP_PASSCODE`）→ **Redeploy** → `/api/auth` 回 `configured:true`
- [ ] C1 `SMTP_URL` + `ALERT_EMAILS` → Summary 的 Real Tracker 顯示 `sent`
- [ ] C2 `NTFY_TOPICS`（選用）→ `NOTIFICATIONS=on`（想開始推播時）
- [ ] 兩支手機用新網址重新安裝、**設定 → 同步** 用各自的初始密碼登入 → 立刻改成自己的密碼
- [ ] （P1）D、E 只在要做手機 App 時進行

---

## 附錄 · GitHub Variables 全表

放：<https://github.com/seanx888/aethersky/settings/variables/actions> → **Variables** 分頁。全部選用。

| Name | 說明 | 預設 |
|---|---|---|
| `TRACKERS` | Real Tracker 行程 JSON（App 同步自動寫入） | — |
| `TRACKER_NOTIFICATIONS` | `paused` = 暫停追蹤通知 | 開啟 |
| `PROMO_ALERTS` | 社群好價／活動通知的個人化 JSON（人、會員品牌、類型、門檻；見 SETUP 第 11 步）| 每人收最強的幾則 |
| `COMMUNITY_NOTIFICATIONS` | `paused` = 暫停社群好價／活動通知（資料照常更新）| 開啟 |
| `NOTIFICATIONS` | `on` = 開始 ntfy 推播 | 依 config（`paused`）|
| `NOTIFY_MIN_SCORE` | 推播門檻分數 | 72 |
| `MAIL_FROM` | 寄件人 `ÆtherSky <你的帳號@gmail.com>` | 依 SMTP 帳號 |
| `SITE_URL` | 推播/Email 內連結網址 | `config/routes.json` 的 `siteUrl`（已是 `https://aethersky.bluechiou.com/`）|
| `PRICE_ALERTS` | 個人目標價 JSON | — |
| `WATCH_TRIPS` | 固定行程 JSON | — |
| `SEARCHES_PER_RUN` | 每日搜尋上限 | SerpApi 20，並依剩餘額度自動調低 |
| `SERPAPI_VERIFY_RETURN` | `1` = 驗證回程（每條多 1 次搜尋） | 關 |
| `SERPAPI_DEEP_SEARCH` | `true` = SerpApi 深度搜尋（較慢、較準） | 關 |
| `FARE_PROVIDER` | 強制 `serpapi` / `duffel` / `demo` | 自動 |
| `NTFY_SERVER` | 自架 ntfy 網址 | `https://ntfy.sh` |
| `DEPLOY_TARGET` | `none` / `pages` / `vercel` / `pages,vercel` | `none` |
| `VERCEL_PROJECT`, `VERCEL_SCOPE` | 僅 `DEPLOY_TARGET=vercel` 才用 | `aethersky` |
