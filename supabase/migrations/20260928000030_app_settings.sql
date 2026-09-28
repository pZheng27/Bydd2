-- Global app settings, one row. Currently just the launch mode: when
-- marketplace_enabled is false, the app shows only the Collections / photo
-- editor product (Collections + Collector); the marketplace areas are hidden
-- and blocked. Admins flip this from the header. Everyone may read it (the nav
-- needs it, even signed-out); only the service role / admins write it.
create table if not exists public.app_settings (
  id boolean primary key default true,
  marketplace_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = true)
);

-- Seed the single row (id is always true, so there is only ever one).
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Anyone (including signed-out visitors) can read the launch mode.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select using (true);

-- Writes go through the service-role admin client after an is_admin check in
-- the server action, so no client-side write policy is granted here.
