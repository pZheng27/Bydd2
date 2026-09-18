-- Coin catalog seed (Session 5). Re-runnable: paste any time; conflicts are
-- skipped. Starter set = the 13 Carson City Morgan Dollars. Expand with the full
-- date/mintmark run or VAM varieties by adding rows here and re-running.

insert into public.coin_types
  (slug, series, denomination, year, mintmark, metal, fine_weight_oz, name)
values
  ('morgan-1878-cc', 'Morgan Dollar', '$1', 1878, 'CC', 'silver', 0.7734, '1878-CC Morgan Dollar'),
  ('morgan-1879-cc', 'Morgan Dollar', '$1', 1879, 'CC', 'silver', 0.7734, '1879-CC Morgan Dollar'),
  ('morgan-1880-cc', 'Morgan Dollar', '$1', 1880, 'CC', 'silver', 0.7734, '1880-CC Morgan Dollar'),
  ('morgan-1881-cc', 'Morgan Dollar', '$1', 1881, 'CC', 'silver', 0.7734, '1881-CC Morgan Dollar'),
  ('morgan-1882-cc', 'Morgan Dollar', '$1', 1882, 'CC', 'silver', 0.7734, '1882-CC Morgan Dollar'),
  ('morgan-1883-cc', 'Morgan Dollar', '$1', 1883, 'CC', 'silver', 0.7734, '1883-CC Morgan Dollar'),
  ('morgan-1884-cc', 'Morgan Dollar', '$1', 1884, 'CC', 'silver', 0.7734, '1884-CC Morgan Dollar'),
  ('morgan-1885-cc', 'Morgan Dollar', '$1', 1885, 'CC', 'silver', 0.7734, '1885-CC Morgan Dollar'),
  ('morgan-1889-cc', 'Morgan Dollar', '$1', 1889, 'CC', 'silver', 0.7734, '1889-CC Morgan Dollar'),
  ('morgan-1890-cc', 'Morgan Dollar', '$1', 1890, 'CC', 'silver', 0.7734, '1890-CC Morgan Dollar'),
  ('morgan-1891-cc', 'Morgan Dollar', '$1', 1891, 'CC', 'silver', 0.7734, '1891-CC Morgan Dollar'),
  ('morgan-1892-cc', 'Morgan Dollar', '$1', 1892, 'CC', 'silver', 0.7734, '1892-CC Morgan Dollar'),
  ('morgan-1893-cc', 'Morgan Dollar', '$1', 1893, 'CC', 'silver', 0.7734, '1893-CC Morgan Dollar')
on conflict (slug) do nothing;

insert into public.sets (slug, name, series, description)
values (
  'cc-morgan-dollars',
  'Carson City Morgan Dollars',
  'Morgan Dollar',
  'The 13 Morgan Dollars struck at the Carson City Mint (1878-1885, 1889-1893).'
)
on conflict (slug) do nothing;

insert into public.set_members (set_id, coin_type_id, sort_order)
select s.id, ct.id, ct.year
from public.sets s
join public.coin_types ct on ct.slug = any (
  array[
    'morgan-1878-cc','morgan-1879-cc','morgan-1880-cc','morgan-1881-cc',
    'morgan-1882-cc','morgan-1883-cc','morgan-1884-cc','morgan-1885-cc',
    'morgan-1889-cc','morgan-1890-cc','morgan-1891-cc','morgan-1892-cc',
    'morgan-1893-cc'
  ]
)
where s.slug = 'cc-morgan-dollars'
on conflict (set_id, coin_type_id) do nothing;
