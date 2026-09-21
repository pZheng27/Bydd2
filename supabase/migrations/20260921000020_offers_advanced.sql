-- Session 7a: advanced offer plumbing — parallel-group clearing, counter
-- offers, and a cancel reason. Builds on the S2 offers schema (which already has
-- parallel_group_id, counter_of_offer_id, and a 48h expires_at default).
-- Idempotent.

alter table public.offers add column if not exists cancel_reason text;

-- Accept an offer (v2): mark accepted, create the (simulated) order, mark the
-- item sold, then CLEAR the losers — other pending offers on the same item, and
-- the rest of the parallel group (first acceptance wins). Also fills the linked
-- want, if the offer came from one.
create or replace function public.accept_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
  v_offer offers;
  v_order uuid;
  v_seller uuid;
  v_buyer uuid;
  v_item_status text;
begin
  select id into v_me from profiles where user_id = auth.uid();
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into v_offer from offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer not found'; end if;
  if v_offer.to_profile_id <> v_me then raise exception 'not authorized'; end if;
  if v_offer.status <> 'pending' then raise exception 'offer is not pending'; end if;

  -- Derive the real seller from the item's owner and the buyer as the other
  -- party. This is correct for a normal offer (buyer→seller) AND a counter
  -- (seller→buyer), where from/to are reversed.
  select d.profile_id, i.status into v_seller, v_item_status
    from inventory_items i join dealers d on d.id = i.dealer_id
    where i.id = v_offer.inventory_item_id for update;
  if v_seller is null then raise exception 'item not found'; end if;
  if v_item_status = 'sold' then raise exception 'item already sold'; end if;
  v_buyer := case
    when v_offer.from_profile_id = v_seller then v_offer.to_profile_id
    else v_offer.from_profile_id
  end;

  update offers set status = 'accepted' where id = p_offer_id;

  insert into orders (offer_id, inventory_item_id, buyer_profile_id, seller_profile_id,
                      amount_cents, kind, status, note)
  values (p_offer_id, v_offer.inventory_item_id, v_buyer, v_seller,
          v_offer.price_cents, 'offer', 'completed', 'SIMULATED — no funds moved')
  returning id into v_order;

  update inventory_items set status = 'sold', is_public = false
    where id = v_offer.inventory_item_id;

  -- Other pending offers on the same item: it's sold.
  update offers set status = 'cancelled', cancel_reason = 'sold'
    where inventory_item_id = v_offer.inventory_item_id
      and status = 'pending' and id <> p_offer_id;

  -- Parallel group: the buyer's other simultaneous offers lose (first one wins).
  if v_offer.parallel_group_id is not null then
    update offers set status = 'cancelled', cancel_reason = 'filled_elsewhere'
      where parallel_group_id = v_offer.parallel_group_id
        and status = 'pending' and id <> p_offer_id;
  end if;

  -- If the offer came from a want, that want is now filled.
  if v_offer.want_id is not null then
    update wants set status = 'filled' where id = v_offer.want_id;
  end if;

  return v_order;
end;
$$;
grant execute on function public.accept_offer(uuid) to authenticated;

-- Counter an offer: the recipient proposes a new price. Marks the original
-- 'countered' and creates a new pending offer back the other way (fresh 48h
-- clock via the table default), linked via counter_of_offer_id.
create or replace function public.counter_offer(
  p_offer_id uuid,
  p_price_cents integer,
  p_message text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
  v_offer offers;
  v_new uuid;
begin
  select id into v_me from profiles where user_id = auth.uid();
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into v_offer from offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer not found'; end if;
  if v_offer.to_profile_id <> v_me then raise exception 'not authorized'; end if;
  if v_offer.status <> 'pending' then raise exception 'offer is not pending'; end if;
  if p_price_cents is null or p_price_cents <= 0 then raise exception 'invalid price'; end if;

  update offers set status = 'countered' where id = p_offer_id;

  insert into offers (want_id, request_id, inventory_item_id, from_profile_id,
                      to_profile_id, price_cents, message, status, counter_of_offer_id)
  values (v_offer.want_id, v_offer.request_id, v_offer.inventory_item_id, v_me,
          v_offer.from_profile_id, p_price_cents, p_message, 'pending', p_offer_id)
  returning id into v_new;

  return v_new;
end;
$$;
grant execute on function public.counter_offer(uuid, integer, text) to authenticated;

-- Buy-now (v2): same as before, but tag the cancelled offers with a reason.
create or replace function public.purchase_item(p_item_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_buyer uuid;
  v_seller uuid;
  v_price integer;
  v_status text;
  v_order uuid;
begin
  select id into v_buyer from profiles where user_id = auth.uid();
  if v_buyer is null then raise exception 'not authenticated'; end if;

  select i.price_cents, i.status, d.profile_id
    into v_price, v_status, v_seller
    from inventory_items i join dealers d on d.id = i.dealer_id
    where i.id = p_item_id for update;

  if v_seller is null then raise exception 'item not found'; end if;
  if v_status <> 'listed' then raise exception 'item is not available'; end if;

  insert into orders (inventory_item_id, buyer_profile_id, seller_profile_id,
                      amount_cents, kind, status, note)
  values (p_item_id, v_buyer, v_seller, v_price, 'buy_now', 'completed',
          'SIMULATED — no funds moved')
  returning id into v_order;

  update inventory_items set status = 'sold', is_public = false where id = p_item_id;
  update offers set status = 'cancelled', cancel_reason = 'sold'
    where inventory_item_id = p_item_id and status = 'pending';

  return v_order;
end;
$$;
grant execute on function public.purchase_item(uuid) to authenticated;
