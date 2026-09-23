-- Slobodna napomena uz gumu, npr. za manju manu ili specifičnost kompleta.

alter table public.tyres add column if not exists note text;

drop function if exists public.employee_inventory();
create function public.employee_inventory()
returns table (
  id uuid, brand text, model text, width smallint, profile smallint, diameter smallint,
  is_commercial boolean, season text, tread_depth_mm numeric, dot text, quantity smallint,
  sale_price numeric, status public.tyre_status, location text, is_public boolean, created_at timestamptz,
  photo_path text, customer_name text, customer_phone text, customer_address text,
  shipment_required boolean, reserved_at timestamptz, sold_at timestamptz, note text
)
language sql security definer set search_path = public
as $$
  select id, brand, model, width, profile, diameter, is_commercial, season, tread_depth_mm, dot,
    quantity, sale_price, status, location, is_public, created_at, photo_path, customer_name,
    customer_phone, customer_address, shipment_required, reserved_at, sold_at, note
  from public.tyres where exists (select 1 from public.profiles where id = auth.uid());
$$;
revoke all on function public.employee_inventory() from public;
grant execute on function public.employee_inventory() to authenticated;
