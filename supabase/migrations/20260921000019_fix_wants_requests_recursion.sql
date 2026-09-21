-- Fix: the requests migration made wants' RLS reference requests
-- (wants_routed_dealer_read) and requests' RLS reference wants
-- (requests_owner_read). RLS is recursive, so evaluating one triggers the other
-- forever → 42P17 "infinite recursion detected in policy for relation wants",
-- which broke ALL reads and inserts on wants (wants stopped saving/showing).
--
-- Break the cycle with SECURITY DEFINER helpers: each reads the OTHER table
-- with RLS bypassed, so the policies no longer call back into each other.
-- Idempotent.

create or replace function public.my_want_ids()
returns setof uuid language sql security definer set search_path = public stable as $$
  select w.id from public.wants w
  join public.profiles p on p.id = w.profile_id
  where p.user_id = auth.uid();
$$;
grant execute on function public.my_want_ids() to authenticated;

create or replace function public.my_dealer_request_want_ids()
returns setof uuid language sql security definer set search_path = public stable as $$
  select r.want_id from public.requests r
  join public.dealers d on d.id = r.dealer_id
  join public.profiles p on p.id = d.profile_id
  where p.user_id = auth.uid();
$$;
grant execute on function public.my_dealer_request_want_ids() to authenticated;

-- A collector can read requests for wants they own — via the helper (no wants RLS).
drop policy if exists requests_owner_read on public.requests;
create policy requests_owner_read on public.requests
  for select
  using (want_id in (select public.my_want_ids()));

-- A dealer can read a want they were routed — via the helper (no requests RLS).
drop policy if exists wants_routed_dealer_read on public.wants;
create policy wants_routed_dealer_read on public.wants
  for select
  using (id in (select public.my_dealer_request_want_ids()));
