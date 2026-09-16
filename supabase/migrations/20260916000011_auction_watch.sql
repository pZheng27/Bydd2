-- Session 3.5: automated weekly auction-watch. Per-coin opt-in; a weekly job
-- searches Numisbids for comparable UPCOMING lots and alerts the dealer.
alter table public.inventory_items
  add column if not exists watch_auctions boolean not null default false;
alter table public.inventory_items
  add column if not exists auctions_checked_at timestamptz;

create table if not exists public.auction_watch_hits (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  lot_title text not null,
  price_text text,
  auction_house text,
  sale_date_text text,
  url text not null,
  found_at timestamptz not null default now()
);
create index if not exists auction_watch_hits_item_idx
  on public.auction_watch_hits (inventory_item_id, found_at desc);

alter table public.auction_watch_hits enable row level security;
-- Owner (the dealer who owns the item) can read/write its hits. The weekly cron
-- writes with the secret key, which bypasses RLS.
drop policy if exists auction_watch_hits_owner_all on public.auction_watch_hits;
create policy auction_watch_hits_owner_all on public.auction_watch_hits
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
