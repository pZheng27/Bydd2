-- Session 3b: apply a reprice + log it, atomically. Idempotent.
-- SECURITY DEFINER so the app can update the item price AND insert the agent
-- event together; validates the caller owns the item.
create or replace function public.record_reprice(
  p_item_id uuid,
  p_new_price_cents integer,
  p_summary text,
  p_payload jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from inventory_items i
    join dealers d on d.id = i.dealer_id
    join profiles p on p.id = d.profile_id
    where i.id = p_item_id and p.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update inventory_items set price_cents = p_new_price_cents where id = p_item_id;
  insert into agent_events (inventory_item_id, kind, summary, payload)
  values (p_item_id, 'repriced', p_summary, coalesce(p_payload, '{}'::jsonb));
  update pricing_rules set last_evaluated_at = now() where inventory_item_id = p_item_id;
end;
$$;
grant execute on function public.record_reprice(uuid, integer, text, jsonb) to authenticated;
