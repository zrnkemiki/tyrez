-- Demo podaci za testiranje. Pokrenuti nakon 006_sales_reservations_and_delivery.sql.
-- Skripta briše samo prethodno ubačene DEMO artikle i DEMO lokacije, ne dira stvarne gume.

delete from public.tyres where dot like 'DEMO-%';
delete from public.warehouse_locations where code like 'DEMO-%';

insert into public.warehouse_locations (code, name)
values
  ('DEMO-A1', 'Demo magacin - polica A1'),
  ('DEMO-A2', 'Demo magacin - polica A2'),
  ('DEMO-DV', 'Demo magacin - dvorište')
on conflict (code) do update set name = excluded.name, active = true;

-- Kao autora koristi prvi admin profil; ako admin ne postoji, koristi prvi korisnički profil.
with author as (
  select id
  from public.profiles
  order by (role = 'admin') desc, created_at
  limit 1
)
insert into public.tyres (
  brand, model, width, profile, diameter, is_commercial, season,
  tread_depth_mm, dot, quantity, purchase_price, sale_price, status,
  location, customer_name, customer_phone, customer_address,
  shipment_required, reserved_at, sold_at, created_by
)
select
  d.brand, d.model, d.width, d.profile, d.diameter, d.is_commercial, d.season,
  d.tread_depth_mm, d.dot, d.quantity, d.purchase_price, d.sale_price,
  d.status::public.tyre_status, d.location, d.customer_name, d.customer_phone,
  d.customer_address, d.shipment_required, d.reserved_at, d.sold_at, author.id
from author
cross join (
  values
    ('Michelin', 'Pilot Sport 5', 225::smallint, 45::smallint, 17::smallint, false, 'summer', 6.5::numeric, 'DEMO-001', 4::smallint, 55.00::numeric, 85.00::numeric, 'available', 'DEMO-A1', null, null, null, false, null::timestamptz, null::timestamptz),
    ('Continental', 'PremiumContact 6', 205::smallint, 55::smallint, 16::smallint, false, 'summer', 5.8::numeric, 'DEMO-002', 2::smallint, 42.00::numeric, 70.00::numeric, 'available', 'DEMO-A1', null, null, null, false, null::timestamptz, null::timestamptz),
    ('Goodyear', 'UltraGrip Performance+', 225::smallint, 50::smallint, 17::smallint, false, 'winter', 7.2::numeric, 'DEMO-003', 4::smallint, 65.00::numeric, 105.00::numeric, 'available', 'DEMO-A2', null, null, null, false, null::timestamptz, null::timestamptz),
    ('Bridgestone', 'Blizzak LM005', 195::smallint, 65::smallint, 15::smallint, false, 'winter', 6.9::numeric, 'DEMO-004', 4::smallint, 38.00::numeric, 62.00::numeric, 'available', 'DEMO-A2', null, null, null, false, null::timestamptz, null::timestamptz),
    ('Pirelli', 'Cinturato All Season', 215::smallint, 60::smallint, 16::smallint, false, 'all_season', 6.0::numeric, 'DEMO-005', 4::smallint, 45.00::numeric, 78.00::numeric, 'reserved', 'DEMO-DV', 'Marko Marković', '064 123 4567', null, false, now() - interval '1 hour', null::timestamptz),
    ('Hankook', 'Vantra LT', 195::smallint, 75::smallint, 16::smallint, true, 'summer', 7.0::numeric, 'DEMO-006', 2::smallint, 58.00::numeric, 92.00::numeric, 'reserved', 'DEMO-DV', 'Jelena Jovanović', '065 987 6543', 'Bulevar oslobođenja 12, Novi Sad', true, now() - interval '2 hours', null::timestamptz),
    ('Kleber', 'Transpro 4S', 215::smallint, 65::smallint, 16::smallint, true, 'all_season', 5.5::numeric, 'DEMO-007', 2::smallint, 49.00::numeric, 82.00::numeric, 'available', 'DEMO-A1', null, null, null, false, null::timestamptz, null::timestamptz),
    ('Dunlop', 'Sport BluResponse', 205::smallint, 55::smallint, 16::smallint, false, 'summer', 5.9::numeric, 'DEMO-008', 4::smallint, 40.00::numeric, 68.00::numeric, 'sold', 'DEMO-A2', 'Petar Petrović', '063 555 444', 'Kralja Petra 8, Beograd', false, null::timestamptz, now() - interval '2 days'),
    ('Tigar', 'Wintera', 185::smallint, 65::smallint, 15::smallint, false, 'winter', 6.3::numeric, 'DEMO-009', 4::smallint, 30.00::numeric, 48.00::numeric, 'sold', 'DEMO-DV', null, null, null, false, null::timestamptz, now() - interval '7 days'),
    ('Nexen', 'N Blue 4Season', 195::smallint, 55::smallint, 16::smallint, false, 'all_season', 6.4::numeric, 'DEMO-010', 4::smallint, 43.00::numeric, 72.00::numeric, 'available', 'DEMO-A1', null, null, null, false, null::timestamptz, null::timestamptz)
) as d(
  brand, model, width, profile, diameter, is_commercial, season,
  tread_depth_mm, dot, quantity, purchase_price, sale_price, status,
  location, customer_name, customer_phone, customer_address,
  shipment_required, reserved_at, sold_at
);
