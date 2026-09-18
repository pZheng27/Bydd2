-- Session 4 Part A: collection_items — the coins a collector OWNS. Manual entry
-- for now; coin_type_id links to the catalog in Session 5. Mirrors the seller's
-- inventory_items but without the sale fields. Idempotent.
create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  coin_type_id uuid,                       -- linked to the catalog later (S5)
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
  title text,
  notes text,
  photos text[] not null default '{}',
  acquired_price_cents integer,
  acquired_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists collection_items_collection_idx
  on public.collection_items (collection_id);

alter table public.collection_items enable row level security;

-- Only the collector who owns the collection can read/write its items.
drop policy if exists collection_items_owner_all on public.collection_items;
create policy collection_items_owner_all on public.collection_items
  for all
  using (
    collection_id in (
      select c.id from public.collections c
      join public.profiles p on p.id = c.profile_id
      where p.user_id = auth.uid()
    )
  )
  with check (
    collection_id in (
      select c.id from public.collections c
      join public.profiles p on p.id = c.profile_id
      where p.user_id = auth.uid()
    )
  );

drop trigger if exists collection_items_set_updated_at on public.collection_items;
create trigger collection_items_set_updated_at
  before update on public.collection_items
  for each row execute function public.set_updated_at();
