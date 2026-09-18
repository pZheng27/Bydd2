-- Link a collection item to the inventory listing spawned from it ("Sell this
-- coin"), so the collection can show whether that coin is listed. Idempotent.
alter table public.collection_items
  add column if not exists inventory_item_id uuid
    references public.inventory_items (id) on delete set null;
