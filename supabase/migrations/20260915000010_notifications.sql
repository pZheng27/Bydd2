-- Session 3.5 Part D: notifications/alerts. A single inbox per user for offers,
-- sales, messages, and AI pricing updates. Rows are created by DB triggers on
-- the source tables (SECURITY DEFINER, so they can notify the OTHER party), so
-- this works no matter which code path caused the event. Idempotent.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade, -- recipient
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_profile_idx
  on public.notifications (profile_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (profile_id) where read_at is null;

alter table public.notifications enable row level security;
-- Recipient can read and mark-read their own. No insert policy: only the
-- SECURITY DEFINER triggers below create notifications.
drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select on public.notifications for select
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));
drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications for update
  using (profile_id in (select id from public.profiles where user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where user_id = auth.uid()));

-- Format helper: cents -> "$1,234.00"
create or replace function public.fmt_usd(cents bigint)
returns text language sql immutable as $$
  select '$' || to_char(cents / 100.0, 'FM999G999G990D00');
$$;

-- Offer received -> notify the seller.
create or replace function public.notify_offer_received()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (profile_id, kind, title, body, link)
  values (new.to_profile_id, 'offer_received', 'New offer received',
          'A buyer offered ' || fmt_usd(new.price_cents) || '.', '/dealer/offers');
  return new;
end; $$;
drop trigger if exists offers_notify_received on public.offers;
create trigger offers_notify_received after insert on public.offers
  for each row execute function public.notify_offer_received();

-- Offer accepted/declined -> notify the buyer who sent it.
create or replace function public.notify_offer_resolved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('accepted','declined') then
    insert into notifications (profile_id, kind, title, body, link)
    values (new.from_profile_id, 'offer_' || new.status,
            case when new.status = 'accepted' then 'Offer accepted' else 'Offer declined' end,
            'Your offer of ' || fmt_usd(new.price_cents) || ' was ' || new.status || '.',
            '/offers');
  end if;
  return new;
end; $$;
drop trigger if exists offers_notify_resolved on public.offers;
create trigger offers_notify_resolved after update on public.offers
  for each row execute function public.notify_offer_resolved();

-- Sale (order created) -> notify the seller.
create or replace function public.notify_order_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (profile_id, kind, title, body, link)
  values (new.seller_profile_id, 'sale', 'Your item sold',
          'Sold for ' || fmt_usd(new.amount_cents) || '.',
          '/dealer/inventory/' || new.inventory_item_id);
  return new;
end; $$;
drop trigger if exists orders_notify_created on public.orders;
create trigger orders_notify_created after insert on public.orders
  for each row execute function public.notify_order_created();

-- New message -> notify the recipient.
create or replace function public.notify_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (profile_id, kind, title, body, link)
  values (new.recipient_profile_id, 'message', 'New message',
          left(new.body, 120), '/messages');
  return new;
end; $$;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_message();

-- AI reprice (agent_events kind='repriced') -> notify the item's seller.
create or replace function public.notify_reprice()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seller uuid;
begin
  if new.kind <> 'repriced' then return new; end if;
  select d.profile_id into v_seller
    from inventory_items i join dealers d on d.id = i.dealer_id
    where i.id = new.inventory_item_id;
  if v_seller is not null then
    insert into notifications (profile_id, kind, title, body, link)
    values (v_seller, 'reprice', 'AI price update', new.summary,
            '/dealer/inventory/' || new.inventory_item_id);
  end if;
  return new;
end; $$;
drop trigger if exists agent_events_notify on public.agent_events;
create trigger agent_events_notify after insert on public.agent_events
  for each row execute function public.notify_reprice();
