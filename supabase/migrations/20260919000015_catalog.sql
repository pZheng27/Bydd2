-- Session 5 Part A: the coin catalog. Canonical coins (coin_types), sets, and
-- which coins compose a set (set_members). Public-read (it's a shared catalog);
-- rows are seeded via supabase/seed/. Idempotent — safe to re-run.

create table if not exists public.coin_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,          -- stable key for re-runnable seeds
  series text not null,               -- e.g. "Morgan Dollar"
  denomination text,                  -- e.g. "$1"
  year integer,
  mintmark text,                      -- 'CC','O','S','D'; null = Philadelphia
  variety text,                       -- e.g. a VAM or "8 Tail Feathers"
  metal text check (metal in ('gold','silver','copper','nickel','clad','other')),
  fine_weight_oz numeric,
  name text not null,                 -- display name, e.g. "1889-CC Morgan Dollar"
  guide_value_cents integer,          -- optional; grade-aware handling in Part F
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coin_types_series_idx on public.coin_types (series, year);

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,                 -- e.g. "Carson City Morgan Dollars"
  series text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.set_members (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets (id) on delete cascade,
  coin_type_id uuid not null references public.coin_types (id) on delete cascade,
  sort_order integer,
  unique (set_id, coin_type_id)
);
create index if not exists set_members_set_idx on public.set_members (set_id, sort_order);

-- The catalog is public reference data: anyone signed in (or not) may read it.
alter table public.coin_types enable row level security;
drop policy if exists coin_types_read on public.coin_types;
create policy coin_types_read on public.coin_types for select using (true);

alter table public.sets enable row level security;
drop policy if exists sets_read on public.sets;
create policy sets_read on public.sets for select using (true);

alter table public.set_members enable row level security;
drop policy if exists set_members_read on public.set_members;
create policy set_members_read on public.set_members for select using (true);

drop trigger if exists coin_types_set_updated_at on public.coin_types;
create trigger coin_types_set_updated_at before update on public.coin_types
  for each row execute function public.set_updated_at();
drop trigger if exists sets_set_updated_at on public.sets;
create trigger sets_set_updated_at before update on public.sets
  for each row execute function public.set_updated_at();
