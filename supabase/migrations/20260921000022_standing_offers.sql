-- Session 7c (standing offers): a collector's rule to AUTO-offer when a matching
-- coin is listed at or below a target price (optionally within a grade range).
-- The collector authorizes it by creating the rule; a cron (and the moment a
-- matching coin lists) fires the offers. Owner-only RLS. Idempotent.

create table if not exists public.standing_offers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  coin_type_id uuid not null references public.coin_types (id) on delete cascade,
  max_price_cents integer not null,
  grade_min integer check (grade_min between 1 and 70),
  grade_max integer check (grade_max between 1 and 70),
  note text,
  status text not null default 'active'
    check (status in ('active','paused','cancelled','filled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists standing_offers_profile_idx
  on public.standing_offers (profile_id, status);
create index if not exists standing_offers_active_idx
  on public.standing_offers (coin_type_id) where status = 'active';

alter table public.standing_offers enable row level security;
drop policy if exists standing_offers_owner_all on public.standing_offers;
create policy standing_offers_owner_all on public.standing_offers
  for all
  using (profile_id in (select id from public.profiles where user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where user_id = auth.uid()));

drop trigger if exists standing_offers_set_updated_at on public.standing_offers;
create trigger standing_offers_set_updated_at
  before update on public.standing_offers
  for each row execute function public.set_updated_at();
