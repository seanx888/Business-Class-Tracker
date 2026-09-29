# ÆtherSky backend (Supabase)

Postgres + Auth + Realtime + Edge Functions for the mobile app. 計畫見 [docs/aethersky/PLAN.md](../docs/aethersky/PLAN.md) §4–6.

```
supabase/
  migrations/0001_init.sql        schema + row-level security (profiles, subscriptions, devices, flights,
                                   flight_events, user_flights, fare_trackers, fare_samples, memberships,
                                   lounges, lounge_reviews)
  functions/_shared/aeroapi.ts    FlightAware AeroAPI v3 → app flight contract (pure, tested in test/aeroapi.test.mjs)
  functions/flight-lookup/        GET ?ident=BR198&date=2026-12-20 → cached shared flight row + contract JSON
  functions/aeroapi-webhook/      POST from AeroAPI alerts → update flight, append flight_events (Realtime → app)
```

## 建立 Setup（Sean）

1. <https://supabase.com> 建立專案，區域 **Tokyo (ap-northeast-1)**（台灣／韓國延遲最低）。
2. 安裝 CLI 後：
   ```bash
   supabase link --project-ref <ref>
   supabase db push                                   # 套用 migrations
   supabase secrets set AEROAPI_KEY=<FlightAware key> AEROAPI_WEBHOOK_SECRET=<random 32+ chars>
   supabase functions deploy flight-lookup                    # called by the app with the anon key (JWT checked)
   supabase functions deploy aeroapi-webhook --no-verify-jwt  # called by FlightAware; protected by ?secret=
   ```
3. FlightAware：<https://www.flightaware.com/aeroapi/portal>（Personal 方案每月有免費額度）→ 建立 API key；
   Alerts 的 target URL 設為 `https://<ref>.supabase.co/functions/v1/aeroapi-webhook?secret=<AEROAPI_WEBHOOK_SECRET>`。
4. App：`flutter run --dart-define=AETHER_API_BASE=https://<ref>.supabase.co/functions/v1 --dart-define=AETHER_API_KEY=<anon key>`

## 已驗證 Verified

- `0001_init.sql` 在 Postgres 16 上實際執行成功（加上 Supabase `auth` 的最小替身）；RLS 測試：使用者只看得到自己追蹤的航班與追蹤清單。
- `aeroapi.ts`：欄位對應、依出發地當地日期挑航班、Alerts → 事件，Node 測試通過。
- Edge Functions 本身（Deno + supabase-js）需在 Supabase 上部署後做整合測試。

## 安全 Security

- 所有使用者資料表開啟 RLS（`user_id = auth.uid()`）；共用的 `flights` 只有追蹤者可讀。
- `subscriptions` 只由 RevenueCat webhook（service role）寫入。
- 會員號碼在手機端加密後才上傳（`memberships.number_ciphertext`），伺服器看不到明文。
- API 金鑰只存在 Supabase secrets，從不進 App。
