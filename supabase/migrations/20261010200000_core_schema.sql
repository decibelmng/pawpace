-- PawPace core schema
-- Owners list dogs, runners swipe on listings, owners swipe on runners.
-- A mutual right-swipe is a match; a one-sided right-swipe is a request.

-- ---------- reference data ----------
create table public.cities (
  id text primary key,                       -- 'DC', 'DEN'
  name text not null,
  timezone text not null default 'America/New_York',
  active boolean not null default true
);

create table public.pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  city_id text not null references public.cities(id) on delete cascade,
  code text not null check (code in ('short','standard','long','endurance')),
  label text not null,
  minutes int not null check (minutes > 0),
  miles numeric(4,1) not null check (miles > 0),
  price_cents int not null check (price_cents > 0),
  sort smallint not null default 0,
  active boolean not null default true,
  unique (city_id, code)
);

-- one row of platform-wide fees, edited by admins
create table public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  commission_bps int not null default 1500,        -- 15% of the run price
  booking_fee_cents int not null default 299,       -- paid by the owner
  gps_addon_cents int not null default 299,
  extra_dog_cents int not null default 1200,
  min_runner_age int not null default 18,
  updated_at timestamptz not null default now()
);

-- ---------- people ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  city_id text references public.cities(id),
  neighborhood text,
  is_owner boolean not null default false,
  is_runner boolean not null default false,
  bio text,
  onboarded boolean not null default false,
  suspended_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- private details only the person (and admins) can read
create table public.profile_private (
  id uuid primary key references public.profiles(id) on delete cascade,
  birthdate date,
  phone text,
  home_lat double precision,
  home_lng double precision,
  handoff_note text,
  guardian_profile_id uuid references public.profiles(id),   -- runners aged 14 to 17 (later release)
  waiver_accepted_at timestamptz
);

create table public.runner_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  gender text check (gender in ('woman','man','nonbinary','prefer_not')),
  pace_min_sec int check (pace_min_sec between 240 and 1200),   -- fastest pace, seconds per mile
  pace_max_sec int check (pace_max_sec between 240 and 1200),
  miles_min numeric(4,1),
  miles_max numeric(4,1),
  styles text[] not null default '{}',                           -- easy, tempo, trail, intervals
  sizes_accepted text[] not null default '{S,M,L}',
  max_dogs smallint not null default 1 check (max_dogs between 1 and 3),
  service_radius_mi numeric(4,1) not null default 2,
  rating_avg numeric(3,2),
  runs_completed int not null default 0,
  active boolean not null default true
);

create table public.admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade
);

-- ---------- dogs and listings ----------
create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  breed text,
  birth_year smallint,
  size text not null check (size in ('XS','S','M','L','XL')),
  energy text not null default 'medium' check (energy in ('low','medium','high','very_high')),
  run_minutes_min smallint,
  run_minutes_max smallint,
  leash_manners smallint check (leash_manners between 1 and 5),
  reactive_dogs boolean not null default false,
  reactive_people boolean not null default false,
  reactive_bikes boolean not null default false,
  heat_sensitive boolean not null default false,
  vaccination_path text,
  rating_avg numeric(3,2),
  created_at timestamptz not null default now()
);

-- care details only the owner and matched runners can read
create table public.dog_care (
  dog_id uuid primary key references public.dogs(id) on delete cascade,
  health_notes text,
  vet_name text,
  vet_phone text,
  emergency_contact text
);

-- what runners swipe on: one dog, or several dogs that run together
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  preferred_tier text check (preferred_tier in ('short','standard','long','endurance')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.listing_dogs (
  listing_id uuid not null references public.listings(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  primary key (listing_id, dog_id)
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('profile','dog')),
  subject_id uuid not null,
  path text not null,                      -- storage path in the photos bucket
  sort smallint not null default 0,
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

-- weekly windows: runner availability, or a dog's wanted run times
create table public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  dog_id uuid references public.dogs(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  check ((profile_id is null) <> (dog_id is null))
);

-- ---------- matching ----------
create table public.swipes (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  runner_id uuid not null references public.profiles(id) on delete cascade,
  actor text not null check (actor in ('owner','runner')),
  direction text not null check (direction in ('left','right')),
  created_at timestamptz not null default now(),
  unique (listing_id, runner_id, actor)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  runner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('requested','matched','declined','blocked')),
  requested_by text check (requested_by in ('owner','runner')),
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, runner_id),
  check (owner_id <> runner_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,   -- null = system message
  body text,
  photo_path text,
  run_id uuid,                                  -- set for Lock in run cards
  ai_flag text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (body is not null or photo_path is not null or run_id is not null)
);

-- ---------- runs ----------
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  runner_id uuid not null references public.profiles(id),
  listing_id uuid not null references public.listings(id),
  proposed_by uuid not null references public.profiles(id),
  city_id text not null references public.cities(id),
  scheduled_at timestamptz not null,
  tier_code text not null,
  minutes int not null,
  miles numeric(4,1) not null,
  extra_dogs smallint not null default 0,
  gps_addon boolean not null default false,
  repeat_weekly boolean not null default false,
  -- price snapshot, computed server-side
  price_cents int not null,
  extra_dog_cents int not null default 0,
  gps_cents int not null default 0,
  booking_fee_cents int not null,
  commission_cents int not null,
  owner_total_cents int not null,
  runner_payout_cents int not null,
  status text not null default 'proposed'
    check (status in ('proposed','confirmed','in_progress','completed','cancelled','disputed','declined')),
  started_at timestamptz,
  ended_at timestamptz,
  distance_mi numeric(5,2),
  cancelled_by text check (cancelled_by in ('owner','runner')),
  cancel_reason text check (cancel_reason in ('weather','late','standard','no_show')),
  refund_cents int,
  runner_comp_cents int,
  dispute_open_until timestamptz,
  payout_released_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.messages
  add constraint messages_run_fk foreign key (run_id) references public.runs(id) on delete set null;

create table public.run_points (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.runs(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null
);

create table public.run_reports (
  run_id uuid primary key references public.runs(id) on delete cascade,
  runner_id uuid not null references public.profiles(id),
  leash_manners smallint not null check (leash_manners between 1 and 5),
  energy smallint not null check (energy between 1 and 5),
  behavior smallint not null check (behavior between 1 and 5),
  pace_fit smallint not null check (pace_fit between 1 and 5),
  overall smallint not null check (overall between 1 and 5),
  notes text,
  photo_path text,
  ai_tags text[] not null default '{}',
  ai_flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.ratings (
  run_id uuid primary key references public.runs(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  runner_id uuid not null references public.profiles(id),
  punctuality smallint not null check (punctuality between 1 and 5),
  communication smallint not null check (communication between 1 and 5),
  care smallint not null check (care between 1 and 5),
  report_quality smallint not null check (report_quality between 1 and 5),
  overall smallint not null check (overall between 1 and 5),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- money (written only by edge functions with the service role) ----------
create table public.payment_accounts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text,
  stripe_account_id text,
  payouts_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.runs(id) on delete cascade,
  stripe_payment_intent_id text unique,
  status text not null default 'pending'
    check (status in ('pending','authorized','captured','refunded','partially_refunded','failed','cancelled')),
  amount_cents int not null,
  captured_cents int not null default 0,
  refunded_cents int not null default 0,
  transfer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  runner_id uuid not null references public.profiles(id),
  amount_cents int not null check (amount_cents > 0),
  stripe_payment_intent_id text,
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  created_at timestamptz not null default now()
);

-- ---------- trust and safety ----------
create table public.badges (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('phone_verified','background_check','insurance_platform','insurance_own')),
  status text not null default 'pending' check (status in ('pending','verified','rejected','expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (profile_id, type)
);

create table public.strikes (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.profiles(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  created_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create table public.push_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null default 'ios',
  created_at timestamptz not null default now()
);

-- ---------- indexes ----------
create index on public.pricing_tiers (city_id);
create index on public.dogs (owner_id);
create index on public.listings (owner_id);
create index on public.listing_dogs (dog_id);
create index on public.photos (subject_type, subject_id, sort);
create index on public.photos (owner_id);
create index on public.availability_windows (profile_id);
create index on public.availability_windows (dog_id);
create index on public.swipes (runner_id);
create index on public.matches (owner_id);
create index on public.matches (runner_id);
create index on public.messages (match_id, created_at);
create index on public.messages (sender_id);
create index on public.messages (run_id);
create index on public.runs (match_id);
create index on public.runs (owner_id, scheduled_at);
create index on public.runs (runner_id, scheduled_at);
create index on public.runs (listing_id);
create index on public.runs (proposed_by);
create index on public.runs (city_id);
create index on public.run_points (run_id, recorded_at);
create index on public.run_reports (runner_id);
create index on public.ratings (owner_id);
create index on public.ratings (runner_id);
create index on public.tips (run_id);
create index on public.tips (owner_id);
create index on public.tips (runner_id);
create index on public.strikes (runner_id, created_at);
create index on public.strikes (run_id);
create index on public.user_reports (reporter_id);
create index on public.user_reports (target_profile_id);
create index on public.user_reports (match_id);
create index on public.user_reports (message_id);
create index on public.blocks (blocked_id);
create index on public.admin_actions (admin_id);
create index on public.push_tokens (profile_id);
create index on public.profiles (city_id);
create index on public.profile_private (guardian_profile_id);
