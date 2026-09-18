-- Session 4 Part B: wants — coins a collector is looking for (manual-first;
-- coin_type_id + set-gap linkage arrive in Session 5). Idempotent.
create table if not exists public.wants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  coin_type_id uuid,                       -- linked to the catalog later (S5)
  title text,
  series text,
  year integer,
  mintmark text,
  variety text,
  metal text check (metal in ('gold','silver','copper','nickel','clad','other')),
  grade_min integer check (grade_min between 1 and 70),
  grade_max integer check (grade_max between 1 and 70),
  budget_cents integer,
  notes text,
  status text not null default 'open' check (status in ('open','filled','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wants_profile_idx on public.wants (profile_id, created_at desc);

alter table public.wants enable row level security;

drop policy if exists wants_owner_all on public.wants;
create policy wants_owner_all on public.wants
  for all
  using (profile_id in (select id from public.profiles where user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where user_id = auth.uid()));

drop trigger if exists wants_set_updated_at on public.wants;
create trigger wants_set_updated_at
  before update on public.wants
  for each row execute function public.set_updated_at();
