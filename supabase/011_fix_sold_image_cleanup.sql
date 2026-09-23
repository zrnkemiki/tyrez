-- Ispravka za Supabase Storage: brisanje fajlova mora ići kroz Storage API aplikacije,
-- ne direktnim DELETE upitom nad storage.objects.

create or replace function public.clear_sold_tyre_photo()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'sold' and old.status is distinct from 'sold' then
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

-- Zaposleni već mogu da menjaju status gume, pa moraju moći da uklone njene slike pri prodaji.
drop policy if exists "Staff can remove tyre image files" on storage.objects;
create policy "Staff can remove tyre image files"
on storage.objects for delete to authenticated
using (bucket_id = 'tyre-images');
