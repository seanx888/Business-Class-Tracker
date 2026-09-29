-- ÆtherSky — initial schema (Supabase Postgres).
-- Flights are shared rows (one per real flight); users only hold links to them, so a popular
-- flight is fetched from FlightAware once no matter how many people follow it.
-- Every user-owned table has row-level security: people only ever see their own rows.

create extension if not exists pgcrypto;

-- ───────────────────────── users ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'zh-TW' check (locale in ('zh-TW', 'en', 'ko')),
  home_airport char(3) default 'TPE',
  alliance_pref text not null default 'SKYTEAM' check (alliance_pref in ('SKYTEAM', 'STAR', 'ONEWORLD', 'NONE')),
  exclude_cn_hk_mo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Written only by the RevenueCat webhook (service role); readable by the owner.
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro', 'elite')),
  product_id text,
  store text check (store in ('app_store', 'play_store', 'promo')),
  expires_at timestamptz,
  first_trip_trial_used boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  push_token text not null,          -- FCM registration token
  live_activity_token text,          -- iOS ActivityKit push token (per active flight)
  created_at timestamptz not null default now(),
  unique (user_id, push_token)
);

-- ───────────────────────── reference data ─────────────────────────
create table public.airports (
  iata char(3) primary key,
  icao char(4),
  name text not null,
  city text,
  country char(2) not null,
  tz text not null,                  -- IANA time zone
  lat double precision,
  lon double precision
);

create table public.airlines (
  iata char(2) primary key,
  name text not null,
  alliance text not null default 'NONE' check (alliance in ('SKYTEAM', 'STAR', 'ONEWORLD', 'NONE')),
  country char(2)
);

-- ───────────────────────── flights (shared) ─────────────────────────
create table public.flights (
  id text primary key,               -- provider id, e.g. FlightAware fa_flight_id
  carrier char(2) not null,
  number text not null,
  service_date date not null,        -- scheduled departure date at the origin (local)
  origin char(3) not null,
  destination char(3) not null,
  out_scheduled timestamptz, out_estimated timestamptz, out_actual timestamptz,
  off_scheduled timestamptz, off_estimated timestamptz, off_actual timestamptz,
  on_scheduled  timestamptz, on_estimated  timestamptz, on_actual  timestamptz,
  in_scheduled  timestamptz, in_estimated  timestamptz, in_actual  timestamptz,
  terminal_origin text, gate_origin text,
  terminal_destination text, gate_destination text, baggage_claim text,
  aircraft_type text, registration text,
  distance_km integer,
  cancelled boolean not null default false,
  diverted boolean not null default false,
  inbound_id text,                   -- the aircraft's previous flight (delay prediction)
  status_text text,
  source text not null default 'aeroapi',
  alert_id bigint,                   -- AeroAPI alert registered for this flight
  raw jsonb,
  updated_at timestamptz not null default now(),
  unique (carrier, number, service_date)
);
create index flights_ident_idx on public.flights (carrier, number, service_date);

create table public.flight_events (
  id bigint generated always as identity primary key,
  flight_id text not null references public.flights (id) on delete cascade,
  kind text not null,                -- departure · arrival · delay · gate · cancelled · diverted · filed …
  summary text,
  payload jsonb,
  source text not null default 'aeroapi',
  created_at timestamptz not null default now()
);
create index flight_events_flight_idx on public.flight_events (flight_id, created_at desc);

create table public.user_flights (
  user_id uuid not null references auth.users (id) on delete cascade,
  flight_id text not null references public.flights (id) on delete cascade,
  seat text,
  cabin text check (cabin in ('economy', 'premium', 'business', 'first')),
  booking_ref text,
  shared_with uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, flight_id)
);

-- ───────────────────────── fares (Real Tracker, same shape as the PWA) ─────────────────────────
create table public.fare_trackers (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  origin char(3) not null,
  destination char(3) not null,
  trip text not null default 'rt' check (trip in ('rt', 'ow')),
  depart date not null,
  return_date date,
  flex smallint not null default 0 check (flex between 0 and 7),
  cabin text not null default 'business' check (cabin in ('economy', 'premium', 'business', 'first')),
  max_stops smallint check (max_stops between 0 and 2),
  target_twd integer check (target_twd > 0),
  alert_on text not null default 'drop' check (alert_on in ('drop', 'any')),
  label text,
  paused boolean not null default false,
  last_alert jsonb,
  created_at timestamptz not null default now(),
  check (trip = 'ow' or return_date > depart)
);

-- Samples are shared by route + dates + cabin: one search serves every tracker that asks for it.
create table public.fare_samples (
  id bigint generated always as identity primary key,
  origin char(3) not null,
  destination char(3) not null,
  depart date not null,
  return_date date,                  -- null = one way
  cabin text not null,
  checked_on date not null,
  price_twd integer,
  carrier char(2),
  stops smallint,
  details jsonb
);
create unique index fare_samples_key on public.fare_samples
  (origin, destination, depart, coalesce(return_date, '1900-01-01'::date), cabin, checked_on);

-- ───────────────────────── member wallet ─────────────────────────
-- The member number is encrypted on the phone (user-held key); the server only stores ciphertext.
create table public.memberships (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  program text not null,
  program_name text,
  owner text,
  tier text,
  status_expiry date,
  miles integer,
  number_ciphertext bytea not null,
  number_last4 text,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── lounges ─────────────────────────
create table public.lounges (
  id uuid primary key default gen_random_uuid(),
  airport char(3) not null references public.airports (iata),
  terminal text,
  airside boolean not null default true,
  name text not null,
  operator text,
  near_gates text,
  hours text,
  access_rules jsonb not null default '{}'::jsonb,   -- e.g. {"cabins":["business"],"status":{"SKYTEAM":["Elite Plus"]},"cards":["priority_pass"]}
  amenities text[] not null default '{}',             -- shower · sleep · dining · spa …
  source text,
  updated_at timestamptz not null default now()
);
create index lounges_airport_idx on public.lounges (airport);

create table public.lounge_reviews (
  id uuid primary key default gen_random_uuid(),
  lounge_id uuid not null references public.lounges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  crowd smallint check (crowd between 1 and 5),
  body text check (char_length(body) <= 2000),
  visited_on date,
  created_at timestamptz not null default now(),
  unique (lounge_id, user_id, visited_on)
);

-- ───────────────────────── row-level security ─────────────────────────
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.devices enable row level security;
alter table public.user_flights enable row level security;
alter table public.fare_trackers enable row level security;
alter table public.memberships enable row level security;
alter table public.flights enable row level security;
alter table public.flight_events enable row level security;
alter table public.fare_samples enable row level security;
alter table public.airports enable row level security;
alter table public.airlines enable row level security;
alter table public.lounges enable row level security;
alter table public.lounge_reviews enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "read own subscription" on public.subscriptions for select using (user_id = auth.uid());
create policy "own devices" on public.devices for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own flights" on public.user_flights for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own trackers" on public.fare_trackers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own memberships" on public.memberships for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Shared flight data: readable when you follow the flight (or it was shared with you).
create policy "followed flights" on public.flights for select using (
  exists (select 1 from public.user_flights uf where uf.flight_id = flights.id and (uf.user_id = auth.uid() or auth.uid() = any (uf.shared_with)))
);
create policy "followed flight events" on public.flight_events for select using (
  exists (select 1 from public.user_flights uf where uf.flight_id = flight_events.flight_id and (uf.user_id = auth.uid() or auth.uid() = any (uf.shared_with)))
);

-- Public reference data and reviews.
create policy "read airports" on public.airports for select using (true);
create policy "read airlines" on public.airlines for select using (true);
create policy "read lounges" on public.lounges for select using (true);
create policy "read fare samples" on public.fare_samples for select to authenticated using (true);
create policy "read reviews" on public.lounge_reviews for select using (true);
create policy "write own reviews" on public.lounge_reviews for insert with check (user_id = auth.uid());
create policy "edit own reviews" on public.lounge_reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own reviews" on public.lounge_reviews for delete using (user_id = auth.uid());

-- Live updates to the app (Supabase Realtime).
alter publication supabase_realtime add table public.flights, public.flight_events;

-- New users get a profile and a free subscription row.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
