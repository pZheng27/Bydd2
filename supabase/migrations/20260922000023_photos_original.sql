-- Auto-enhanced coin photos.
--
-- `photos` becomes the *display* version of each image: the raw upload at first,
-- then replaced in place by the formatter's prettified version once it finishes
-- (see lib/enhance.ts, called after insert). `photos_original` remembers the raw
-- upload, index-aligned with `photos`, so the UI can offer a "view original"
-- toggle. A non-empty photos_original[i] means photos[i] is enhanced and
-- photos_original[i] is the pre-enhancement raw file; an empty string means
-- photos[i] is itself the raw upload (never enhanced, e.g. a slabbed coin).
--
-- Additive and idempotent: existing rows get '{}' and existing code is unaffected
-- until it starts reading the new column.

alter table public.inventory_items
  add column if not exists photos_original text[] not null default '{}';

alter table public.collection_items
  add column if not exists photos_original text[] not null default '{}';

comment on column public.inventory_items.photos_original is
  'Raw uploaded photo paths, index-aligned with photos. photos holds the display version (auto-enhanced when available); a non-empty photos_original[i] is the pre-enhancement original for the "view original" toggle.';

comment on column public.collection_items.photos_original is
  'See inventory_items.photos_original.';
