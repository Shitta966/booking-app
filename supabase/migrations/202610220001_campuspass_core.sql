create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  role text not null default 'attendee' check (role in ('attendee', 'organizer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  display_name text not null,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizer_profiles (id),
  title text not null,
  description text not null default '',
  poster_url text,
  category text not null,
  venue text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  booking_deadline timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'published', 'rejected', 'cancelled', 'completed')),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  cancellation_policy text,
  refund_policy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_time_order check (end_time > start_time),
  constraint event_booking_deadline check (booking_deadline <= start_time)
);

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  quantity_limit integer not null check (quantity_limit > 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  quantity_sold integer not null default 0 check (quantity_sold >= 0),
  sales_start timestamptz,
  sales_end timestamptz,
  created_at timestamptz not null default now(),
  constraint inventory_within_limit check (quantity_reserved + quantity_sold <= quantity_limit)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique default upper(encode(extensions.gen_random_bytes(5), 'hex')),
  user_id uuid not null references public.profiles (id),
  event_id uuid not null references public.events (id),
  status text not null check (status in ('pending_payment', 'payment_submitted', 'confirmed', 'cancelled', 'expired', 'refunded')),
  total_amount_minor bigint not null check (total_amount_minor >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types (id),
  quantity integer not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  line_total_minor bigint not null check (line_total_minor >= 0)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  event_id uuid not null references public.events (id),
  ticket_type_id uuid not null references public.ticket_types (id),
  token_hash text not null unique,
  status text not null default 'valid' check (status in ('valid', 'used', 'cancelled', 'refunded')),
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles (id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  method text not null default 'manual_bank_transfer',
  transaction_reference text,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'confirmed', 'rejected', 'refunded')),
  submitted_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payment_claims (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id),
  submitted_by uuid not null references public.profiles (id),
  transaction_reference text,
  claimed_amount_minor bigint not null check (claimed_amount_minor > 0),
  evidence_path text,
  status text not null default 'submitted' check (status in ('submitted', 'confirmed', 'rejected', 'clarification_requested')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create table public.organizer_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizer_profiles (id) on delete cascade,
  account_name text not null,
  bank_name text not null,
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  payment_instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_public_listing_idx on public.events (start_time) where status = 'published' and visibility = 'public';
create index ticket_types_event_idx on public.ticket_types (event_id);
create index bookings_user_created_idx on public.bookings (user_id, created_at desc);
create index bookings_expiration_idx on public.bookings (expires_at) where status = 'pending_payment';
create index payment_claims_payment_created_idx on public.payment_claims (payment_id, created_at desc);
create index tickets_event_status_idx on public.tickets (event_id, status);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.create_booking(p_ticket_type_id uuid, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket public.ticket_types%rowtype;
  v_event public.events%rowtype;
  v_booking_id uuid;
  v_reference text;
  v_total bigint;
  v_expires_at timestamptz;
  v_is_free boolean;
  v_token text;
  v_index integer;
begin
  if v_user_id is null then
    raise exception 'Sign in to book tickets';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Choose between 1 and 10 tickets';
  end if;

  select * into v_ticket
  from public.ticket_types
  where id = p_ticket_type_id
  for update;

  if not found then
    raise exception 'Ticket type not found';
  end if;

  select * into v_event
  from public.events
  where id = v_ticket.event_id;

  if v_event.status <> 'published' or v_event.visibility <> 'public' then
    raise exception 'This event is not available for booking';
  end if;
  if v_event.booking_deadline <= now() or v_event.start_time <= now() then
    raise exception 'Booking has closed for this event';
  end if;
  if v_ticket.sales_start is not null and v_ticket.sales_start > now() then
    raise exception 'Ticket sales have not started';
  end if;
  if v_ticket.sales_end is not null and v_ticket.sales_end <= now() then
    raise exception 'Ticket sales have ended';
  end if;
  if v_ticket.quantity_limit - v_ticket.quantity_reserved - v_ticket.quantity_sold < p_quantity then
    raise exception 'Not enough tickets remain';
  end if;

  v_total := v_ticket.price_minor * p_quantity;
  v_is_free := v_total = 0;
  if not v_is_free and not exists (
    select 1 from public.organizer_payment_accounts
    where organizer_id = v_event.organizer_id and is_active
  ) then
    raise exception 'The organizer has not configured payment details';
  end if;

  v_reference := upper(encode(extensions.gen_random_bytes(5), 'hex'));
  v_expires_at := case when v_is_free then null else now() + interval '20 minutes' end;

  insert into public.bookings (user_id, event_id, booking_reference, status, total_amount_minor, expires_at)
  values (
    v_user_id,
    v_event.id,
    v_reference,
    case when v_is_free then 'confirmed' else 'pending_payment' end,
    v_total,
    v_expires_at
  )
  returning id into v_booking_id;

  insert into public.booking_items (booking_id, ticket_type_id, quantity, unit_price_minor, line_total_minor)
  values (v_booking_id, v_ticket.id, p_quantity, v_ticket.price_minor, v_total);

  if v_is_free then
    update public.ticket_types
    set quantity_sold = quantity_sold + p_quantity
    where id = v_ticket.id;

    for v_index in 1..p_quantity loop
      v_token := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.tickets (booking_id, event_id, ticket_type_id, token_hash)
      values (v_booking_id, v_event.id, v_ticket.id, encode(extensions.digest(v_token, 'sha256'), 'hex'));
    end loop;
  else
    update public.ticket_types
    set quantity_reserved = quantity_reserved + p_quantity
    where id = v_ticket.id;

    insert into public.payments (booking_id, amount_minor, currency)
    values (v_booking_id, v_total, v_ticket.currency);
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'booking.created',
    'booking',
    v_booking_id,
    jsonb_build_object('reference', v_reference, 'quantity', p_quantity, 'amount_minor', v_total)
  );

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_reference', v_reference,
    'status', case when v_is_free then 'confirmed' else 'pending_payment' end,
    'total_amount_minor', v_total,
    'currency', v_ticket.currency,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.submit_payment_claim(
  p_booking_id uuid,
  p_transaction_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_claim_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in to submit a payment claim';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;
  if v_booking.status not in ('pending_payment', 'payment_submitted')
    or v_booking.expires_at is null
    or v_booking.expires_at <= now() then
    raise exception 'This booking is no longer eligible for a payment claim';
  end if;

  select * into v_payment
  from public.payments
  where booking_id = v_booking.id
  for update;

  if not found or v_payment.status not in ('pending', 'rejected') then
    raise exception 'Payment claim cannot be submitted in its current state';
  end if;

  insert into public.payment_claims (
    payment_id, submitted_by, transaction_reference, claimed_amount_minor
  )
  values (
    v_payment.id,
    v_user_id,
    nullif(left(trim(coalesce(p_transaction_reference, '')), 120), ''),
    v_payment.amount_minor
  )
  returning id into v_claim_id;

  update public.payments
  set status = 'submitted',
      transaction_reference = nullif(left(trim(coalesce(p_transaction_reference, '')), 120), ''),
      submitted_at = now()
  where id = v_payment.id;

  update public.bookings
  set status = 'payment_submitted', updated_at = now()
  where id = v_booking.id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (v_user_id, 'payment.claim_submitted', 'payment_claim', v_claim_id, jsonb_build_object('booking_id', v_booking.id));

  return v_claim_id;
end;
$$;

create or replace function public.get_booking_payment_instructions(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Sign in to view payment details';
  end if;

  select jsonb_build_object(
    'account_name', a.account_name,
    'bank_name', a.bank_name,
    'account_number', a.account_number,
    'payment_instructions', a.payment_instructions,
    'amount_minor', p.amount_minor,
    'currency', p.currency,
    'booking_reference', b.booking_reference,
    'expires_at', b.expires_at
  ) into v_result
  from public.bookings b
  join public.events e on e.id = b.event_id
  join public.organizer_payment_accounts a on a.organizer_id = e.organizer_id and a.is_active
  join public.payments p on p.booking_id = b.id
  where b.id = p_booking_id
    and b.user_id = v_user_id
    and b.status in ('pending_payment', 'payment_submitted')
    and b.expires_at > now()
  order by a.created_at desc
  limit 1;

  if v_result is null then
    raise exception 'Payment instructions are unavailable for this booking';
  end if;
  return v_result;
end;
$$;

create or replace function public.confirm_payment(p_payment_id uuid, p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_organizer_id uuid;
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_claim public.payment_claims%rowtype;
  v_item record;
  v_index integer;
  v_token text;
begin
  select id into v_organizer_id
  from public.organizer_profiles
  where user_id = v_user_id and approval_status = 'approved';
  if v_organizer_id is null then
    raise exception 'Approved organizer access is required';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'Payment not found';
  end if;

  select * into v_booking
  from public.bookings
  where id = v_payment.booking_id
  for update;
  if not exists (select 1 from public.events where id = v_booking.event_id and organizer_id = v_organizer_id) then
    raise exception 'You are not authorized to review this payment';
  end if;

  if v_payment.status = 'confirmed' then
    return;
  end if;
  if v_payment.status <> 'submitted' then
    raise exception 'Payment is not awaiting review';
  end if;
  if v_booking.status <> 'payment_submitted' or v_booking.expires_at <= now() then
    raise exception 'Booking reservation expired or is no longer eligible';
  end if;

  select * into v_claim
  from public.payment_claims
  where id = p_claim_id and payment_id = v_payment.id and status = 'submitted'
  for update;
  if not found then
    raise exception 'Submitted payment claim not found';
  end if;

  update public.payments
  set status = 'confirmed', confirmed_by = v_user_id, confirmed_at = now()
  where id = v_payment.id;
  update public.bookings
  set status = 'confirmed', updated_at = now()
  where id = v_booking.id;
  update public.payment_claims
  set status = 'confirmed', reviewed_by = v_user_id, reviewed_at = now()
  where id = v_claim.id;

  for v_item in
    select ticket_type_id, quantity
    from public.booking_items
    where booking_id = v_booking.id
  loop
    update public.ticket_types
    set quantity_reserved = quantity_reserved - v_item.quantity,
        quantity_sold = quantity_sold + v_item.quantity
    where id = v_item.ticket_type_id and quantity_reserved >= v_item.quantity;
    if not found then
      raise exception 'Reserved ticket inventory is no longer available';
    end if;

    for v_index in 1..v_item.quantity loop
      v_token := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.tickets (booking_id, event_id, ticket_type_id, token_hash)
      values (v_booking.id, v_booking.event_id, v_item.ticket_type_id, encode(extensions.digest(v_token, 'sha256'), 'hex'));
    end loop;
  end loop;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
  values (v_user_id, 'payment.confirmed', 'payment', v_payment.id);
end;
$$;

create or replace function public.reject_payment(p_payment_id uuid, p_claim_id uuid, p_review_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_organizer_id uuid;
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_claim public.payment_claims%rowtype;
begin
  select id into v_organizer_id
  from public.organizer_profiles
  where user_id = v_user_id and approval_status = 'approved';
  if v_organizer_id is null then
    raise exception 'Approved organizer access is required';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if not exists (select 1 from public.events where id = v_booking.event_id and organizer_id = v_organizer_id) then
    raise exception 'You are not authorized to review this payment';
  end if;
  if v_payment.status <> 'submitted' then raise exception 'Payment is not awaiting review'; end if;
  select * into v_claim from public.payment_claims
  where id = p_claim_id and payment_id = v_payment.id and status = 'submitted' for update;
  if not found then raise exception 'Submitted payment claim not found'; end if;

  update public.payments set status = 'rejected' where id = v_payment.id;
  update public.payment_claims
  set status = 'rejected', reviewed_by = v_user_id, reviewed_at = now(),
      review_note = nullif(left(trim(coalesce(p_review_note, '')), 500), '')
  where id = v_claim.id;
  update public.bookings set status = 'pending_payment', updated_at = now() where id = v_booking.id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
  values (v_user_id, 'payment.rejected', 'payment', v_payment.id);
end;
$$;

create or replace function public.expire_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_item record;
  v_count integer := 0;
begin
  for v_booking in
    select * from public.bookings
    where status in ('pending_payment', 'payment_submitted')
      and expires_at <= now()
    for update skip locked
  loop
    for v_item in
      select ticket_type_id, quantity from public.booking_items where booking_id = v_booking.id
    loop
      update public.ticket_types
      set quantity_reserved = quantity_reserved - v_item.quantity
      where id = v_item.ticket_type_id and quantity_reserved >= v_item.quantity;
    end loop;
    update public.bookings set status = 'expired', updated_at = now() where id = v_booking.id;
    update public.payments set status = 'rejected' where booking_id = v_booking.id and status in ('pending', 'submitted');
    insert into public.audit_logs (action, entity_type, entity_id)
    values ('booking.expired', 'booking', v_booking.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

alter table public.profiles enable row level security;
alter table public.organizer_profiles enable row level security;
alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.tickets enable row level security;
alter table public.payments enable row level security;
alter table public.payment_claims enable row level security;
alter table public.organizer_payment_accounts enable row level security;
alter table public.audit_logs enable row level security;

create policy "Profiles are readable by their owner" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "Profiles can be created by the auth trigger" on public.profiles for insert to authenticated with check (id = (select auth.uid()) and role = 'attendee');
create policy "Users update their own non-privileged profile fields" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update (role) on public.profiles from authenticated;
grant update (full_name, phone, updated_at) on public.profiles to authenticated;

create policy "Organizer profile is visible to its owner" on public.organizer_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "Approved organizer names are public" on public.organizer_profiles for select using (approval_status = 'approved');

create policy "Published public events are readable" on public.events for select using (
  (status = 'published' and visibility = 'public')
  or exists (
    select 1 from public.organizer_profiles op
    where op.id = organizer_id and op.user_id = (select auth.uid())
  )
);
create policy "Approved organizers create draft events" on public.events for insert to authenticated with check (
  status = 'draft' and exists (
    select 1 from public.organizer_profiles op
    where op.id = organizer_id and op.user_id = (select auth.uid()) and op.approval_status = 'approved'
  )
);
create policy "Organizers update their own events" on public.events for update to authenticated using (
  exists (
    select 1 from public.organizer_profiles op
    where op.id = organizer_id and op.user_id = (select auth.uid()) and op.approval_status = 'approved'
  )
) with check (
  exists (
    select 1 from public.organizer_profiles op
    where op.id = organizer_id and op.user_id = (select auth.uid()) and op.approval_status = 'approved'
  )
);

create policy "Ticket types for readable events are readable" on public.ticket_types for select using (
  exists (select 1 from public.events e where e.id = event_id)
);
create policy "Attendees read their bookings" on public.bookings for select to authenticated using (user_id = (select auth.uid()));
create policy "Attendees read their booking items" on public.booking_items for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = (select auth.uid()))
);
create policy "Attendees read their tickets" on public.tickets for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = (select auth.uid()))
);
create policy "Attendees and event organizers read payments" on public.payments for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = (select auth.uid()))
  or exists (
    select 1 from public.bookings b
    join public.events e on e.id = b.event_id
    join public.organizer_profiles op on op.id = e.organizer_id
    where b.id = booking_id and op.user_id = (select auth.uid())
  )
);
create policy "Attendees and event organizers read claims" on public.payment_claims for select to authenticated using (
  submitted_by = (select auth.uid())
  or exists (
    select 1 from public.payments p
    join public.bookings b on b.id = p.booking_id
    join public.events e on e.id = b.event_id
    join public.organizer_profiles op on op.id = e.organizer_id
    where p.id = payment_id and op.user_id = (select auth.uid())
  )
);
create policy "Organizers manage their payment account" on public.organizer_payment_accounts for all to authenticated using (
  exists (select 1 from public.organizer_profiles op where op.id = organizer_id and op.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.organizer_profiles op where op.id = organizer_id and op.user_id = (select auth.uid()))
);
create policy "Attendees read payment accounts for their paid booking" on public.organizer_payment_accounts for select to authenticated using (
  is_active and exists (
    select 1 from public.events e
    join public.bookings b on b.event_id = e.id
    join public.payments p on p.booking_id = b.id
    where e.organizer_id = organizer_id and b.user_id = (select auth.uid())
      and b.status in ('pending_payment', 'payment_submitted')
  )
);
create policy "Admins read audit logs" on public.audit_logs for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

revoke all on public.organizer_profiles, public.bookings, public.booking_items, public.tickets,
  public.payments, public.payment_claims, public.audit_logs from anon, authenticated;
grant select on public.events, public.ticket_types to anon, authenticated;
grant select on public.profiles, public.organizer_profiles, public.events, public.ticket_types,
  public.bookings, public.booking_items, public.tickets, public.payments, public.payment_claims,
  public.organizer_payment_accounts to authenticated;
grant insert on public.events to authenticated;
grant update (title, description, poster_url, category, venue, start_time, end_time, booking_deadline, visibility, cancellation_policy, refund_policy, updated_at) on public.events to authenticated;
grant insert, update on public.organizer_payment_accounts to authenticated;
grant update (full_name, phone, updated_at) on public.profiles to authenticated;

revoke all on function public.create_booking(uuid, integer) from public, anon;
revoke all on function public.submit_payment_claim(uuid, text) from public, anon;
revoke all on function public.get_booking_payment_instructions(uuid) from public, anon;
revoke all on function public.confirm_payment(uuid, uuid) from public, anon;
revoke all on function public.reject_payment(uuid, uuid, text) from public, anon;
revoke all on function public.expire_pending_bookings() from public, anon, authenticated;
grant execute on function public.create_booking(uuid, integer) to authenticated;
grant execute on function public.submit_payment_claim(uuid, text) to authenticated;
grant execute on function public.get_booking_payment_instructions(uuid) to authenticated;
grant execute on function public.confirm_payment(uuid, uuid) to authenticated;
grant execute on function public.reject_payment(uuid, uuid, text) to authenticated;
grant execute on function public.expire_pending_bookings() to service_role;
