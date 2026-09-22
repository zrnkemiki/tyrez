-- Jedno white-label podešavanje za jednu radionicu u MVP verziji.
create table if not exists public.workshop_settings (
  id boolean primary key default true check (id),
  name text not null default 'TyreZ',
  logo_url text,
  updated_at timestamptz not null default now()
);

insert into public.workshop_settings (id, name) values (true, 'TyreZ') on conflict (id) do nothing;
alter table public.workshop_settings enable row level security;

drop policy if exists "Staff can view workshop settings" on public.workshop_settings;
drop policy if exists "Admins can update workshop settings" on public.workshop_settings;
create policy "Staff can view workshop settings" on public.workshop_settings for select to authenticated using (true);
create policy "Admins can update workshop settings" on public.workshop_settings for update to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
