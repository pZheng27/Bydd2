-- Buyer-facing "How this price moves" note. pricing_rules is owner-only (it
-- holds the dealer's %, floor, thresholds), so buyers can't read it. This
-- SECURITY DEFINER function returns only a SAFE, number-free description — and
-- only when the seller has turned on rule_visible for a public listed item.
create or replace function public.price_explainer(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_visible boolean;
  v_params jsonb;
  v_kind text;
begin
  select rule_visible into v_visible
    from inventory_items
    where id = p_item_id and is_public = true and status = 'listed';
  if v_visible is not true then
    return null;
  end if;

  select params, kind into v_params, v_kind
    from pricing_rules
    where inventory_item_id = p_item_id and is_active = true
    order by updated_at desc
    limit 1;
  if v_params is null then
    return null;
  end if;

  return jsonb_build_object(
    'metal', coalesce(v_params->>'metal', 'gold'),
    'spot_linked', (v_kind = 'spot_plus_pct'),
    'uses_comp', coalesce((v_params->>'use_comp')::boolean, false),
    'demand_bump', (coalesce((v_params->>'demand_bump_pct')::numeric, 0) <> 0)
  );
end;
$$;
grant execute on function public.price_explainer(uuid) to anon, authenticated;
