-- Galerija slika: pokrenuti nakon 006_sales_reservations_and_delivery.sql.
-- Postojeća glavna slika se bezbedno prebacuje u galeriju.

create table if not exists public.tyre_images (
  id uuid primary key default gen_random_uuid(),
  tyre_id uuid not null references public.tyres(id) on delete cascade,
  path text not null unique,
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index if not exists tyre_images_tyre_id_sort_order_idx
  on public.tyre_images (tyre_id, sort_order, created_at);

insert into public.tyre_images (tyre_id, path, sort_order)
select id, photo_path, 0
from public.tyres
where photo_path is not null
on conflict (path) do nothing;

alter table public.tyre_images enable row level security;

drop policy if exists "Staff can view tyre images" on public.tyre_images;
create policy "Staff can view tyre images"
on public.tyre_images for select to authenticated using (true);

drop policy if exists "Staff can add tyre images" on public.tyre_images;
create policy "Staff can add tyre images"
on public.tyre_images for insert to authenticated with check (true);

drop policy if exists "Staff can remove tyre images" on public.tyre_images;
create policy "Staff can remove tyre images"
on public.tyre_images for delete to authenticated using (true);

-- Omogućava uklanjanje slike iz galerije kroz aplikaciju.
drop policy if exists "Staff can remove tyre image files" on storage.objects;
create policy "Staff can remove tyre image files"
on storage.objects for delete to authenticated
using (bucket_id = 'tyre-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Pri prodaji briše se svaka slika iz Storage-a i galerije, ali osnovni podaci o gumi ostaju.
create or replace function public.clear_sold_tyre_photo()
returns trigger language plpgsql security definer set search_path = public, storage
as $$
begin
  if new.status = 'sold' and old.status is distinct from 'sold' then
    delete from storage.objects
    where bucket_id = 'tyre-images'
      and (
        name = old.photo_path
        or name in (select path from public.tyre_images where tyre_id = old.id)
      );

    delete from public.tyre_images where tyre_id = old.id;
    new.photo_path := null;
    new.sold_at := coalesce(new.sold_at, now());
  end if;
  if new.status = 'reserved' and old.status is distinct from 'reserved' then
    new.reserved_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists clear_sold_tyre_photo on public.tyres;
create trigger clear_sold_tyre_photo before update on public.tyres
for each row execute procedure public.clear_sold_tyre_photo();
