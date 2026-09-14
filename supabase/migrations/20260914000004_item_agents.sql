-- Session 3a: item-agent foundations. Idempotent — safe to re-run.

-- SPOT PRICES ----------------------------------------------------------
create table if not exists public.spot_prices (
  id uuid primary key default gen_random_uuid(),
  metal text not null check (metal in ('gold','silver','copper','nickel','clad','other')),
  price_cents_per_oz bigint not null,
  source text,
  fetched_at timestamptz not null default now()
);
create index if not exists spot_prices_metal_fetched_idx
  on public.spot_prices (metal, fetched_at desc);
alter table public.spot_prices enable row level security;
drop policy if exists spot_prices_read on public.spot_prices;
create policy spot_prices_read on public.spot_prices for select using (true);

-- AGENT EVENTS (the activity feed) -------------------------------------
create table if not exists public.agent_events (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid references public.inventory_items (id) on delete cascade,
  want_id uuid,
  kind text not null check (kind in ('repriced','comp_seen','demand_update','routed',
    'recommendation','offer_sent','offer_received','rule_changed')),
  summary text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists agent_events_item_idx
  on public.agent_events (inventory_item_id, created_at desc);
alter table public.agent_events enable row level security;
-- Owner sees their item's events; anyone can see events for listed public items
-- (for the public price-history chart).
drop policy if exists agent_events_read on public.agent_events;
create policy agent_events_read on public.agent_events for select using (
  inventory_item_id in (
    select id from public.inventory_items where is_public = true and status = 'listed'
  )
  or inventory_item_id in (
    select i.id from public.inventory_items i
    join public.dealers d on d.id = i.dealer_id
    join public.profiles p on p.id = d.profile_id
    where p.user_id = auth.uid()
  )
);

-- SEEDED SPOT: advance the gold price by a small ±1% drift. -------------
-- SECURITY DEFINER so a signed-in user (or a cron) can trigger a tick
-- without inserting arbitrary values. Swap for a real metals API later.
create or replace function public.seed_spot()
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_last bigint;
  v_next bigint;
begin
  select price_cents_per_oz into v_last
    from spot_prices where metal = 'gold'
    order by fetched_at desc limit 1;
  if v_last is null then
    v_next := 264100; -- seed at ~$2,641/oz
  else
    v_next := round(v_last * (1 + ((random() - 0.5) * 0.02))); -- ±1% drift
  end if;
  insert into spot_prices (metal, price_cents_per_oz, source)
  values ('gold', v_next, 'seeded');
  return v_next;
end;
$$;
grant execute on function public.seed_spot() to authenticated;
