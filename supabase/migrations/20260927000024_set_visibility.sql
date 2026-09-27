-- Shareable collector profiles. A collection set can appear on the owner's
-- public profile (/u/<profile-id>). Sets are visible by default; the owner can
-- flip any set to private on its Manage page.
--
-- The public profile reads its data server-side with the service-role client,
-- selecting only display-safe fields, so no public RLS is opened here — this
-- migration only adds the flag. Idempotent; safe to re-run.
alter table public.collection_sets
  add column if not exists is_public boolean not null default true;
