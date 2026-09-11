-- Session 2: buyer side (SPEC §5, §6.4). Idempotent — safe to re-run.
-- Tables: collections, saved_items, offers, orders.
-- Cross-owner transactions run through SECURITY DEFINER functions that validate
-- the caller (buyers can't otherwise write the seller's item, etc.).

-- COLLECTIONS (every buyer gets one) ------------------------------------
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null default 'My Collection',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.collections enable row level security;
drop policy if exists collections_owner_all on public.collections;
create policy collections_owner_all on public.collections for all
  using (profile_id in (select id from public.profiles where user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where user_id = auth.uid()));
drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

-- SAVED ITEMS (watchlist) ----------------------------------------------
create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, inventory_item_id)
);
alter table public.saved_items enable row level security;
drop policy if exists saved_items_owner_all on public.saved_items;
create policy saved_items_owner_all on public.saved_items for all
  using (profile_id in (select id from public.profiles where user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where user_id = auth.uid()));

-- OFFERS ---------------------------------------------------------------
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  want_id uuid,
  request_id uuid,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  from_profile_id uuid not null references public.profiles (id) on delete cascade,
  to_profile_id uuid not null references public.profiles (id) on delete cascade,
  price_cents integer not null,
  message text,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','countered','cancelled','expired')),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  parallel_group_id uuid,
  counter_of_offer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists offers_item_idx on public.offers (inventory_item_id);
create index if not exists offers_to_idx on public.offers (to_profile_id);
create index if not exists offers_from_idx on public.offers (from_profile_id);
alter table public.offers enable row level security;
drop policy if exists offers_party_select on public.offers;
create policy offers_party_select on public.offers for select using (
  from_profile_id in (select id from public.profiles where user_id = auth.uid())
  or to_profile_id in (select id from public.profiles where user_id = auth.uid())
);
drop policy if exists offers_buyer_insert on public.offers;
create policy offers_buyer_insert on public.offers for insert with check (
  from_profile_id in (select id from public.profiles where user_id = auth.uid())
);
drop policy if exists offers_party_update on public.offers;
create policy offers_party_update on public.offers for update using (
  from_profile_id in (select id from public.profiles where user_id = auth.uid())
  or to_profile_id in (select id from public.profiles where user_id = auth.uid())
) with check (
  from_profile_id in (select id from public.profiles where user_id = auth.uid())
  or to_profile_id in (select id from public.profiles where user_id = auth.uid())
);
drop trigger if exists offers_set_updated_at on public.offers;
create trigger offers_set_updated_at before update on public.offers
  for each row execute function public.set_updated_at();

-- ORDERS (simulated) ---------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references public.offers (id),
  inventory_item_id uuid not null references public.inventory_items (id),
  buyer_profile_id uuid not null references public.profiles (id),
  seller_profile_id uuid not null references public.profiles (id),
  amount_cents integer not null,
  kind text not null check (kind in ('buy_now','offer')),
  status text not null default 'completed',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_buyer_idx on public.orders (buyer_profile_id);
create index if not exists orders_seller_idx on public.orders (seller_profile_id);
alter table public.orders enable row level security;
-- rows are created by the SECURITY DEFINER functions below; parties can read.
drop policy if exists orders_party_select on public.orders;
create policy orders_party_select on public.orders for select using (
  buyer_profile_id in (select id from public.profiles where user_id = auth.uid())
  or seller_profile_id in (select id from public.profiles where user_id = auth.uid())
);

-- Let buyers/sellers still read an item they've transacted (after it's sold).
drop policy if exists inventory_select_via_order on public.inventory_items;
create policy inventory_select_via_order on public.inventory_items for select using (
  exists (
    select 1 from public.orders o
    where o.inventory_item_id = inventory_items.id
      and (
        o.buyer_profile_id in (select id from public.profiles where user_id = auth.uid())
        or o.seller_profile_id in (select id from public.profiles where user_id = auth.uid())
      )
  )
);

-- FUNCTIONS ------------------------------------------------------------
-- Buy now: create order, mark sold, cancel other pending offers.
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
  update offers set status = 'cancelled'
    where inventory_item_id = p_item_id and status = 'pending';

  return v_order;
end;
$$;
grant execute on function public.purchase_item(uuid) to authenticated;

-- Seller accepts an offer: mark accepted, create order, mark sold, cancel rest.
create or replace function public.accept_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
  v_offer offers;
  v_order uuid;
begin
  select id into v_me from profiles where user_id = auth.uid();
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into v_offer from offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer not found'; end if;
  if v_offer.to_profile_id <> v_me then raise exception 'not authorized'; end if;
  if v_offer.status <> 'pending' then raise exception 'offer is not pending'; end if;

  update offers set status = 'accepted' where id = p_offer_id;

  insert into orders (offer_id, inventory_item_id, buyer_profile_id, seller_profile_id,
                      amount_cents, kind, status, note)
  values (p_offer_id, v_offer.inventory_item_id, v_offer.from_profile_id,
          v_offer.to_profile_id, v_offer.price_cents, 'offer', 'completed',
          'SIMULATED — no funds moved')
  returning id into v_order;

  update inventory_items set status = 'sold', is_public = false
    where id = v_offer.inventory_item_id;
  update offers set status = 'cancelled'
    where inventory_item_id = v_offer.inventory_item_id
      and status = 'pending' and id <> p_offer_id;

  return v_order;
end;
$$;
grant execute on function public.accept_offer(uuid) to authenticated;

-- Count a marketplace view (listed public items only).
create or replace function public.increment_item_view(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update inventory_items set view_count = view_count + 1
    where id = p_item_id and is_public = true and status = 'listed';
end;
$$;
grant execute on function public.increment_item_view(uuid) to authenticated;

-- Give every new signup a collection too; backfill existing users.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_profile uuid;
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (user_id) do nothing;

  select id into v_profile from public.profiles where user_id = new.id;
  if v_profile is not null then
    insert into public.collections (profile_id) values (v_profile)
    on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;

insert into public.collections (profile_id)
select p.id from public.profiles p
where not exists (select 1 from public.collections c where c.profile_id = p.id);
