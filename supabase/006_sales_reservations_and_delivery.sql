-- Statusi, podaci o kupcu i izveštaji prodaje/slanja.
alter table public.tyres
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_address text,
  add column if not exists shipment_required boolean not null default false,
  add column if not exists reserved_at timestamptz,
  add column if not exists sold_at timestamptz;

-- Zaposleni moraju dobiti i putanju fotografije, ali nikada nabavnu cenu.
drop function if exists public.employee_inventory();
create function public.employee_inventory()
returns table (
  id uuid, brand text, model text, width smallint, profile smallint, diameter smallint,
  is_commercial boolean, season text, tread_depth_mm numeric, dot text, quantity smallint,
  sale_price numeric, status public.tyre_status, location text, is_public boolean, created_at timestamptz,
  photo_path text, customer_name text, customer_phone text, customer_address text,
  shipment_required boolean, reserved_at timestamptz, sold_at timestamptz
)
language sql security definer set search_path = public
as $$
  select id, brand, model, width, profile, diameter, is_commercial, season, tread_depth_mm, dot,
    quantity, sale_price, status, location, is_public, created_at, photo_path, customer_name,
    customer_phone, customer_address, shipment_required, reserved_at, sold_at
  from public.tyres where exists (select 1 from public.profiles where id = auth.uid());
$$;
revoke all on function public.employee_inventory() from public;
grant execute on function public.employee_inventory() to authenticated;

-- Prodaja automatski uklanja sliku iz Storage-a i zadržava osnovne podatke kao izveštaj.
create or replace function public.clear_sold_tyre_photo()
returns trigger language plpgsql security definer set search_path = public, storage
as $$
begin
  if new.status = 'sold' and old.status is distinct from 'sold' then
    if old.photo_path is not null then
      delete from storage.objects where bucket_id = 'tyre-images' and name = old.photo_path;
      new.photo_path := null;
    end if;
    new.sold_at := coalesce(new.sold_at, now());
  end if;
  if new.status = 'reserved' and old.status is distinct from 'reserved' then new.reserved_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists clear_sold_tyre_photo on public.tyres;
create trigger clear_sold_tyre_photo before update on public.tyres
for each row execute procedure public.clear_sold_tyre_photo();

create policy "Admins can delete tyre records" on public.tyres for delete to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
