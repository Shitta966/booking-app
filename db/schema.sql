-- FUTICK — corporate event planning and ticket management (PostgreSQL 15+)
-- Applied automatically on first start (see src/lib/db.ts). Every statement is idempotent.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text not null default '',
  phone text,
  is_super_admin boolean not null default false,
  status text not null default 'active' check (status in ('active', 'suspended')),
  -- Bumped to revoke every session the user holds (sign out everywhere, suspension, password reset).
  session_version integer not null default 1,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- SaaS subscription plans. Limits that are null mean "unlimited".
create table if not exists plans (
  id text primary key,
  name text not null,
  description text not null default '',
  price_minor bigint not null default 0 check (price_minor >= 0),
  billing_period text not null default 'month' check (billing_period in ('month', 'year', 'event')),
  max_events integer check (max_events is null or max_events > 0),
  max_tickets_per_event integer check (max_tickets_per_event is null or max_tickets_per_event > 0),
  max_team_members integer check (max_team_members is null or max_team_members > 0),
  ticket_fee_percent numeric(5, 2) not null default 0 check (ticket_fee_percent >= 0 and ticket_fee_percent <= 50),
  features text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0
);

-- Tenants: faculties, departments, student bodies, companies and partners hosting events.
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  kind text not null default 'department'
    check (kind in ('department', 'faculty', 'student_body', 'company', 'partner', 'other')),
  contact_email text,
  contact_phone text,
  plan_id text not null default 'starter' references plans (id),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  subscription_ends_at timestamptz,
  bank_name text,
  account_name text,
  account_number text check (account_number is null or account_number ~ '^[0-9]{10}$'),
  payment_instructions text,
  created_by uuid references users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'organizer', 'scanner')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Invitations by email. Accepted automatically when that email signs up or signs in.
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'organizer', 'scanner')),
  invited_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (org_id, email)
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  title text not null,
  summary text not null default '',
  description text not null default '',
  category text not null default 'Conference',
  venue text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  poster_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted')),
  is_featured boolean not null default false,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_time_order check (end_time > start_time)
);

create table if not exists ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  name text not null,
  description text not null default '',
  price_minor bigint not null default 0 check (price_minor >= 0),
  quantity_total integer not null check (quantity_total > 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  quantity_sold integer not null default 0 check (quantity_sold >= 0),
  max_per_order integer not null default 10 check (max_per_order between 1 and 50),
  sales_end timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint inventory_within_total check (quantity_reserved + quantity_sold <= quantity_total)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  org_id uuid not null references organizations (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  status text not null check (status in ('pending_payment', 'awaiting_review', 'paid', 'cancelled', 'expired')),
  total_minor bigint not null check (total_minor >= 0),
  platform_fee_minor bigint not null default 0 check (platform_fee_minor >= 0),
  payment_reference text,
  review_note text,
  reviewed_by uuid references users (id) on delete set null,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  ticket_type_id uuid not null references ticket_types (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0)
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  order_id uuid not null references orders (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  ticket_type_id uuid not null references ticket_types (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  attendee_name text not null default '',
  status text not null default 'valid' check (status in ('valid', 'checked_in', 'cancelled')),
  issued_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_by uuid references users (id) on delete set null
);

-- Every scan attempt at the gate, admitted or not.
create table if not exists check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  ticket_id uuid references tickets (id) on delete set null,
  scanned_by uuid references users (id) on delete set null,
  result text not null check (result in ('admitted', 'already_used', 'cancelled', 'wrong_event', 'invalid')),
  created_at timestamptz not null default now()
);

-- Planning checklist for corporate events.
create table if not exists event_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  title text not null,
  assignee text not null default '',
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_at timestamptz not null default now()
);

-- Platform-wide settings managed by super admins (branding, homepage copy, switches).
create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users (id) on delete set null,
  org_id uuid references organizations (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists members_user_idx on organization_members (user_id);
create index if not exists invitations_email_idx on invitations (lower(email)) where accepted_at is null;
create index if not exists events_org_idx on events (org_id, start_time desc);
create index if not exists events_public_idx on events (start_time) where status = 'published' and visibility = 'public';
create index if not exists ticket_types_event_idx on ticket_types (event_id);
create index if not exists orders_user_idx on orders (user_id, created_at desc);
create index if not exists orders_event_idx on orders (event_id, status);
create index if not exists orders_pending_idx on orders (expires_at) where status = 'pending_payment';
create index if not exists tickets_user_idx on tickets (user_id);
create index if not exists tickets_event_idx on tickets (event_id, status);
create index if not exists check_ins_event_idx on check_ins (event_id, created_at desc);
create index if not exists event_tasks_event_idx on event_tasks (event_id);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);

insert into plans (id, name, description, price_minor, billing_period, max_events, max_tickets_per_event, max_team_members, ticket_fee_percent, features, sort_order)
values
  ('starter', 'Starter', 'For departments and clubs running occasional events.', 0, 'month', 3, 300, 3, 3.5,
    array['3 active events', '300 tickets per event', 'QR check-in', 'Manual bank-transfer payments'], 1),
  ('pro', 'Pro', 'For faculties and companies with a regular event calendar.', 1500000, 'month', 25, 2000, 15, 2.0,
    array['25 active events', '2,000 tickets per event', 'Planning checklists', 'Attendee CSV export', 'Featured listings'], 2),
  ('enterprise', 'Enterprise', 'For convocations, conferences and university-wide programmes.', 6000000, 'month', null, null, null, 1.0,
    array['Unlimited events and tickets', 'Unlimited team members', 'Priority support', 'Dedicated onboarding'], 3)
on conflict (id) do nothing;

insert into platform_settings (key, value) values
  ('branding', '{"appName": "FUTICK", "tagline": "Corporate events and tickets for FUT Minna", "supportEmail": "support@futick.ng", "primaryColor": "#2b3fd9"}'::jsonb),
  ('homepage', '{"heroTitle": "Plan it. Ticket it. Check them in.", "heroSubtitle": "FUTICK helps faculties, departments, companies and partners run professional events around the Federal University of Technology, Minna — from the planning checklist to the gate scan.", "announcement": ""}'::jsonb),
  ('features', '{"signupsOpen": true, "organizerApplicationsOpen": true, "reservationMinutes": 30}'::jsonb)
on conflict (key) do nothing;

-- 2026-11: dashboards moved from green to the Tixia blue; update the old default if it was never customised.
update platform_settings set value = jsonb_set(value, '{primaryColor}', '"#2b3fd9"')
where key = 'branding' and value ->> 'primaryColor' = '#0b6b3a';

-- Uploaded images (event posters). Stored in the database so uploads work on any host without extra storage;
-- move to object storage (S3, R2, Supabase Storage) when volume grows — see ROADMAP.md.
create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations (id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880), -- app limit is 4 MB
  data bytea not null,
  uploaded_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- In-app notifications (the bell) and browser push subscriptions.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (user_id) where read_at is null;

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

-- Fixed-window rate limiting shared by every app instance (log-in lockout, sign-ups, scans).
create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

-- Refer & earn -------------------------------------------------------------------------------------
-- Attendees invite friends; every N friends who book their first ticket earns a free-ticket coupon.
-- Coupons redeemed at an event earn that organiser credit towards FUTICK Pro.
alter table users add column if not exists referral_code text unique;
alter table users add column if not exists referred_by uuid references users (id) on delete set null;
alter table users add column if not exists referral_qualified_at timestamptz;
create index if not exists users_referred_by_idx on users (referred_by);

alter table events add column if not exists accepts_reward_coupons boolean not null default true;

alter table organizations add column if not exists plan_source text not null default 'manual';
do $$ begin
  alter table organizations add constraint organizations_plan_source_check check (plan_source in ('manual', 'reward'));
exception when duplicate_object then null; end $$;

create table if not exists reward_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null references users (id) on delete cascade,
  source text not null default 'referral' check (source in ('referral', 'admin')),
  value_cap_minor bigint not null check (value_cap_minor > 0),
  -- reserved: attached to an unpaid order; used: that order was paid.
  status text not null default 'available' check (status in ('available', 'reserved', 'used', 'revoked')),
  order_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists reward_coupons_user_idx on reward_coupons (user_id, status);

alter table orders add column if not exists coupon_id uuid references reward_coupons (id) on delete set null;
alter table orders add column if not exists discount_minor bigint not null default 0;

create table if not exists org_reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  credits_minor bigint not null check (credits_minor > 0),
  months integer not null check (months > 0),
  redeemed_by uuid references users (id) on delete set null,
  plan_ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- One row per redeemed coupon (amount = the ticket value FUTICK covered), plus carry-over rows.
create table if not exists org_reward_credits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  order_id uuid unique references orders (id) on delete set null,
  amount_minor bigint not null check (amount_minor > 0),
  note text not null default '',
  redemption_id uuid references org_reward_redemptions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists org_reward_credits_open_idx on org_reward_credits (org_id) where redemption_id is null;

insert into platform_settings (key, value) values
  ('referrals', '{"enabled": true, "friendsPerReward": 5, "couponCapMinor": 1000000, "couponValidDays": 90, "maxRewardsPerMonth": 3, "proThresholdMinor": 5000000, "proMonthsPerRedemption": 1}'::jsonb)
on conflict (key) do nothing;

-- Online payments ------------------------------------------------------------------------------------
-- Card / bank / USSD payments through Stripe or Flutterwave, configured by super admins. Money lands in
-- the platform's gateway account; organisers are paid out (recorded in payouts) less the platform fee.
alter table orders add column if not exists payment_method text not null default 'bank_transfer';
do $$ begin
  alter table orders add constraint orders_payment_method_check check (payment_method in ('bank_transfer', 'stripe', 'flutterwave', 'free'));
exception when duplicate_object then null; end $$;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'flutterwave')),
  -- Stripe Checkout Session id, or our Flutterwave tx_ref.
  provider_ref text not null,
  -- Stripe PaymentIntent id, or Flutterwave transaction id, once paid.
  provider_txn_id text,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'NGN',
  status text not null default 'initiated' check (status in ('initiated', 'succeeded', 'failed', 'refund_needed')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index if not exists payments_order_idx on payments (order_id);
create index if not exists payments_status_idx on payments (status, created_at desc);

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  reference text not null default '',
  paid_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payouts_org_idx on payouts (org_id, created_at desc);

insert into platform_settings (key, value) values
  ('payments', '{"bankTransferEnabled": true, "stripe": {"enabled": false}, "flutterwave": {"enabled": false}}'::jsonb)
on conflict (key) do nothing;

-- Lock every table away from Supabase's auto-generated REST/GraphQL APIs.
-- FUTICK talks to the database only from its own server, connecting as the table owner, which bypasses
-- RLS. With RLS on and no policies, the public `anon` and `authenticated` API roles can read nothing —
-- otherwise anyone holding the project's public key could read users, password hashes and orders.
-- On plain PostgreSQL (no anon role) this just enables RLS, which the owner also bypasses.
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'plans', 'organizations', 'organization_members', 'invitations', 'events', 'ticket_types', 'orders',
    'order_items', 'tickets', 'check_ins', 'event_tasks', 'platform_settings', 'audit_logs', 'uploads',
    'notifications', 'push_subscriptions', 'rate_limits', 'reward_coupons', 'org_reward_redemptions', 'org_reward_credits', 'payments', 'payouts'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
    execute 'revoke all on all sequences in schema public from anon, authenticated';
    execute 'revoke all on all functions in schema public from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on tables from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on functions from anon, authenticated';
  end if;
end $$;
