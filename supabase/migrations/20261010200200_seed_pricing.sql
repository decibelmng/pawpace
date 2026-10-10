-- Launch cities and the proposed tiers from the spec (admins can change them later)
insert into public.cities (id, name, timezone) values
  ('DC', 'Washington, DC', 'America/New_York'),
  ('DEN', 'Denver', 'America/Denver')
on conflict (id) do nothing;

insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

insert into public.pricing_tiers (city_id, code, label, minutes, miles, price_cents, sort) values
  ('DC',  'short',     'Short',     20, 2.0, 2200, 1),
  ('DC',  'standard',  'Standard',  30, 3.0, 2800, 2),
  ('DC',  'long',      'Long',      45, 5.0, 3600, 3),
  ('DC',  'endurance', 'Endurance', 60, 6.2, 4400, 4),
  ('DEN', 'short',     'Short',     20, 2.0, 2000, 1),
  ('DEN', 'standard',  'Standard',  30, 3.0, 2600, 2),
  ('DEN', 'long',      'Long',      45, 5.0, 3300, 3),
  ('DEN', 'endurance', 'Endurance', 60, 6.2, 4000, 4)
on conflict (city_id, code) do nothing;
