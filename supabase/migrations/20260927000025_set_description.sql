-- An optional description a collector can add to a set (shown on the set's card
-- in the public Collections browse and on their public profile). Idempotent.
alter table public.collection_sets
  add column if not exists description text;
