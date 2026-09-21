-- Session 6 (routing): a `requests` row is one routed want landing in one
-- dealer's inbox, with the score and its breakdown for the audit trail. Rows are
-- written by a SECURITY DEFINER function in 6b (like record_reprice); the dealer
-- can then accept/decline. Owner-only-ish RLS. Idempotent.

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  want_id uuid not null references public.wants (id) on delete cascade,
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  score integer not null default 0,
  breakdown jsonb not null default '{}', -- the score lines that applied
  status text not null default 'sent' check (status in ('sent','viewed','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (want_id, dealer_id)
);
create index if not exists requests_dealer_idx on public.requests (dealer_id, created_at desc);
create index if not exists requests_want_idx on public.requests (want_id);

alter table public.requests enable row level security;

-- The dealer a request went to can read it and act on it (accept/decline).
drop policy if exists requests_dealer_rw on public.requests;
create policy requests_dealer_rw on public.requests
  for all
  using (
    dealer_id in (
      select d.id from public.dealers d
      join public.profiles p on p.id = d.profile_id
      where p.user_id = auth.uid()
    )
  )
  with check (
    dealer_id in (
      select d.id from public.dealers d
      join public.profiles p on p.id = d.profile_id
      where p.user_id = auth.uid()
    )
  );

-- The collector who owns the want can see which dealers it was routed to.
drop policy if exists requests_owner_read on public.requests;
create policy requests_owner_read on public.requests
  for select
  using (
    want_id in (
      select w.id from public.wants w
      join public.profiles p on p.id = w.profile_id
      where p.user_id = auth.uid()
    )
  );

-- A dealer routed a request can read that want (for their inbox), even though
-- wants are otherwise owner-only. Adds to the existing owner policy (OR'd).
drop policy if exists wants_routed_dealer_read on public.wants;
create policy wants_routed_dealer_read on public.wants
  for select
  using (
    id in (
      select r.want_id from public.requests r
      join public.dealers d on d.id = r.dealer_id
      join public.profiles p on p.id = d.profile_id
      where p.user_id = auth.uid()
    )
  );

drop trigger if exists requests_set_updated_at on public.requests;
create trigger requests_set_updated_at
  before update on public.requests
  for each row execute function public.set_updated_at();
