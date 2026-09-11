-- Session 1: seller-side schema (SPEC §5). Idempotent — safe to re-run.
-- Tables: dealers, inventory_items (coin_type_id nullable + manual fields),
-- pricing_rules (schema only; logic in Session 3). Plus an item-photos bucket.

-- DEALERS ---------------------------------------------------------------
create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  business_name text,
  location text,
  categories text[] not null default '{}',
  response_rate numeric,
  median_response_minutes integer,
  accepts_requests boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dealers enable row level security;

drop policy if exists dealers_select_all on public.dealers;
create policy dealers_select_all on public.dealers
  for select using (true);

drop policy if exists dealers_write_own on public.dealers;
create policy dealers_write_own on public.dealers
  for all
  using (profile_id in (select id from public.profiles where user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where user_id = auth.uid()));

drop trigger if exists dealers_set_updated_at on public.dealers;
create trigger dealers_set_updated_at
  before update on public.dealers
  for each row execute function public.set_updated_at();

-- INVENTORY ITEMS -------------------------------------------------------
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  coin_type_id uuid,                       -- linked to the catalog later (Session 4)
  -- manual-entry descriptive fields, used until coin_type_id is set:
  series text,
  year integer,
  mintmark text,
  variety text,
  metal text check (metal in ('gold','silver','copper','nickel','clad','other')),
  fine_weight_oz numeric,
  grade integer check (grade between 1 and 70),
  designation text,
  grading_service text check (grading_service in ('PCGS','NGC','CAC','ANACS','ICG','raw')),
  cert_number text,
  cost_cents integer,
  price_cents integer not null default 0,
  status text not null default 'unlisted' check (status in ('listed','unlisted','reserved','sold')),
  is_public boolean not null default false,
  location_note text,
  title text,
  description text,
  shipping_note text,
  photos text[] not null default '{}',
  rule_visible boolean not null default false,
  view_count integer not null default 0,
  listed_at timestamptz,
  max_daily_move_pct numeric not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_dealer_id_idx on public.inventory_items (dealer_id);
create index if not exists inventory_items_public_idx on public.inventory_items (is_public, status);

alter table public.inventory_items enable row level security;

-- Listed & public items are visible to everyone; a dealer sees all of their own.
drop policy if exists inventory_public_or_owner_select on public.inventory_items;
create policy inventory_public_or_owner_select on public.inventory_items
  for select using (
    (is_public = true and status = 'listed')
    or dealer_id in (
      select d.id from public.dealers d
      join public.profiles p on p.id = d.profile_id
      where p.user_id = auth.uid()
    )
  );

drop policy if exists inventory_write_own on public.inventory_items;
create policy inventory_write_own on public.inventory_items
  for all
  using (
    dealer_id in (
      select d.id from public.dealers d
      join public.profiles p on p.id = d.profile_id
      where p.user_id = auth.uid()
    )
  )
  with check (
    dealer_id in (
      select d.id from public.dealers d
      join public.profiles p on p.id = d.profile_id
      where p.user_id = auth.uid()
    )
  );

drop trigger if exists inventory_items_set_updated_at on public.inventory_items;
create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();

-- PRICING RULES (schema only; evaluation logic arrives in Session 3) -----
create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  kind text not null check (kind in ('spot_plus_pct','step_down','floor','match_guide')),
  params jsonb not null default '{}',
  is_active boolean not null default true,
  last_evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pricing_rules_item_idx on public.pricing_rules (inventory_item_id);

alter table public.pricing_rules enable row level security;

drop policy if exists pricing_rules_owner_all on public.pricing_rules;
create policy pricing_rules_owner_all on public.pricing_rules
  for all
  using (
    inventory_item_id in (
      select i.id from public.inventory_items i
      join public.dealers d on d.id = i.dealer_id
      join public.profiles p on p.id = d.profile_id
      where p.user_id = auth.uid()
    )
  )
  with check (
    inventory_item_id in (
      select i.id from public.inventory_items i
      join public.dealers d on d.id = i.dealer_id
      join public.profiles p on p.id = d.profile_id
      where p.user_id = auth.uid()
    )
  );

drop trigger if exists pricing_rules_set_updated_at on public.pricing_rules;
create trigger pricing_rules_set_updated_at
  before update on public.pricing_rules
  for each row execute function public.set_updated_at();

-- STORAGE: item photos --------------------------------------------------
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

drop policy if exists item_photos_public_read on storage.objects;
create policy item_photos_public_read on storage.objects
  for select using (bucket_id = 'item-photos');

drop policy if exists item_photos_auth_insert on storage.objects;
create policy item_photos_auth_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos');

drop policy if exists item_photos_owner_update on storage.objects;
create policy item_photos_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'item-photos' and owner = auth.uid());

drop policy if exists item_photos_owner_delete on storage.objects;
create policy item_photos_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos' and owner = auth.uid());
