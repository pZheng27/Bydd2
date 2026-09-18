-- Session 5 Part B: custom collection sets. A collector builds their own named
-- "sets" (checklists of catalog coins), toggles between them on /collection, and
-- sees which slots they own vs. still need (gaps). Slots reference catalog
-- coin_types; "owned" is computed from collection_items sharing the coin_type_id,
-- so a set fills in automatically as coins are linked to the catalog.
-- Owner-only RLS (mirrors collection_items). Idempotent — safe to re-run.

create table if not exists public.collection_sets (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  name text not null,
  source_set_id uuid references public.sets (id) on delete set null, -- catalog template it was seeded from, if any
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists collection_sets_collection_idx
  on public.collection_sets (collection_id, created_at);

-- The coin slots that make up a collector's set (each references a catalog coin).
create table if not exists public.collection_set_members (
  id uuid primary key default gen_random_uuid(),
  collection_set_id uuid not null references public.collection_sets (id) on delete cascade,
  coin_type_id uuid not null references public.coin_types (id) on delete cascade,
  sort_order integer,
  unique (collection_set_id, coin_type_id)
);
create index if not exists collection_set_members_set_idx
  on public.collection_set_members (collection_set_id, sort_order);

-- Only the collector who owns the collection may read/write their sets.
alter table public.collection_sets enable row level security;
drop policy if exists collection_sets_owner_all on public.collection_sets;
create policy collection_sets_owner_all on public.collection_sets
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

alter table public.collection_set_members enable row level security;
drop policy if exists collection_set_members_owner_all on public.collection_set_members;
create policy collection_set_members_owner_all on public.collection_set_members
  for all
  using (
    collection_set_id in (
      select cs.id from public.collection_sets cs
      join public.collections c on c.id = cs.collection_id
      join public.profiles p on p.id = c.profile_id
      where p.user_id = auth.uid()
    )
  )
  with check (
    collection_set_id in (
      select cs.id from public.collection_sets cs
      join public.collections c on c.id = cs.collection_id
      join public.profiles p on p.id = c.profile_id
      where p.user_id = auth.uid()
    )
  );

drop trigger if exists collection_sets_set_updated_at on public.collection_sets;
create trigger collection_sets_set_updated_at
  before update on public.collection_sets
  for each row execute function public.set_updated_at();
