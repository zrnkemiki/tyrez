-- Šifarnik lokacija u magacinu: npr. MAG-A-01, POLICA-03 ili DVORISTE.
create table if not exists public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.warehouse_locations enable row level security;
create policy "Staff can view warehouse locations" on public.warehouse_locations for select to authenticated using (true);
create policy "Admins can add warehouse locations" on public.warehouse_locations for insert to authenticated with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Admins can update warehouse locations" on public.warehouse_locations for update to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
