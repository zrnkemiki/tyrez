-- Pokrenuti jednom u Supabase SQL Editor-u nakon prethodnih migracija.
insert into storage.buckets (id, name, public)
values ('tyre-images', 'tyre-images', true)
on conflict (id) do update set public = true;

alter table public.tyres add column if not exists photo_path text;

create policy "Staff can upload tyre images"
on storage.objects for insert to authenticated
with check (bucket_id = 'tyre-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Anyone can view tyre images"
on storage.objects for select to public
using (bucket_id = 'tyre-images');
