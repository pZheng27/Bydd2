-- Session 5 Part C: freeform sets. Alongside "series" sets (built from a catalog
-- template, tracked as an owned/missing checklist), a collector can make a
-- freeform set and drop specific coins they own into it — coins that aren't part
-- of any series. Here membership is the owned coin itself (collection_items),
-- not a catalog slot. A set is treated as a series set when it has a
-- source_set_id, and freeform otherwise. Owner-only RLS. Idempotent.

create table if not exists public.collection_set_coins (
  id uuid primary key default gen_random_uuid(),
  collection_set_id uuid not null references public.collection_sets (id) on delete cascade,
  collection_item_id uuid not null references public.collection_items (id) on delete cascade,
  sort_order integer,
  created_at timestamptz not null default now(),
  unique (collection_set_id, collection_item_id)
);
create index if not exists collection_set_coins_set_idx
  on public.collection_set_coins (collection_set_id, sort_order);

alter table public.collection_set_coins enable row level security;
drop policy if exists collection_set_coins_owner_all on public.collection_set_coins;
create policy collection_set_coins_owner_all on public.collection_set_coins
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
