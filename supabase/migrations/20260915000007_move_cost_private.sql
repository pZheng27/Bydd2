-- Privacy fix: a dealer's COST (their margin) must never be visible to buyers.
-- inventory_items is readable by anyone for public listed coins (that's what
-- powers the marketplace), and Postgres row-level security can't hide a single
-- column — so cost_cents leaked through the raw API. Move it into an owner-only
-- companion table and drop the leaky column. Idempotent — safe to re-run.

create table if not exists public.inventory_costs (
  inventory_item_id uuid primary key
    references public.inventory_items (id) on delete cascade,
  cost_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_costs enable row level security;

-- Only the dealer who owns the item can read or write its cost.
drop policy if exists inventory_costs_owner_all on public.inventory_costs;
create policy inventory_costs_owner_all on public.inventory_costs
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

drop trigger if exists inventory_costs_set_updated_at on public.inventory_costs;
create trigger inventory_costs_set_updated_at
  before update on public.inventory_costs
  for each row execute function public.set_updated_at();

-- Backfill from the old column, then drop it — guarded so re-running is safe
-- even after the column is already gone.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_items'
      and column_name = 'cost_cents'
  ) then
    insert into public.inventory_costs (inventory_item_id, cost_cents)
    select id, cost_cents from public.inventory_items
    where cost_cents is not null
    on conflict (inventory_item_id) do nothing;

    alter table public.inventory_items drop column cost_cents;
  end if;
end $$;
