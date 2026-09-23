-- Omogućava adminu brisanje lokacije iz šifarnika magacina.
-- Lokacija je tekst na postojećim gumama, pa istorijski podaci ostaju sačuvani.

drop policy if exists "Admins can delete warehouse locations" on public.warehouse_locations;
create policy "Admins can delete warehouse locations"
on public.warehouse_locations for delete to authenticated
using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
