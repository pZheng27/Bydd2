-- Test helper: set the gold price to a specific value. Idempotent.
create or replace function public.set_spot(p_price_cents_per_oz integer)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  insert into spot_prices (metal, price_cents_per_oz, source)
  values ('gold', p_price_cents_per_oz, 'manual');
  return p_price_cents_per_oz;
end;
$$;
grant execute on function public.set_spot(integer) to authenticated;
