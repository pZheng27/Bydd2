-- Session 7c (demand): aggregate demand for a coin type, so a dealer can see
-- how wanted their coin is WITHOUT reading collectors' private wants. SECURITY
-- DEFINER returns only counts + a median budget (no PII). Idempotent.

create or replace function public.item_demand(p_coin_type_id uuid)
returns table (open_wants integer, listed_supply integer, median_budget_cents integer)
language sql security definer set search_path = public stable as $$
  select
    (select count(*)::int
       from public.wants w
       where w.coin_type_id = p_coin_type_id and w.status = 'open'),
    (select count(*)::int
       from public.inventory_items i
       where i.coin_type_id = p_coin_type_id
         and i.status = 'listed' and i.is_public = true),
    (select percentile_cont(0.5) within group (order by w.budget_cents)::int
       from public.wants w
       where w.coin_type_id = p_coin_type_id and w.status = 'open'
         and w.budget_cents is not null);
$$;
grant execute on function public.item_demand(uuid) to authenticated;
