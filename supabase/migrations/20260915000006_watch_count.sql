-- Count how many buyers are watching (saved) an item. SECURITY DEFINER so a
-- seller can see the tally without reading others' private watchlists.
create or replace function public.watch_count(p_item_id uuid)
returns integer language sql security definer set search_path = public stable as $$
  select count(*)::int from saved_items where inventory_item_id = p_item_id;
$$;
grant execute on function public.watch_count(uuid) to authenticated;
