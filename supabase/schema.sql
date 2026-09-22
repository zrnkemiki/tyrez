-- Pokrenuti u Supabase SQL Editor-u nakon kreiranja projekta.
create type public.app_role as enum ('admin', 'employee');
create type public.tyre_status as enum ('available', 'reserved', 'sold');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'employee',
  created_at timestamptz not null default now()
);

create table public.tyres (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text,
  width smallint not null check (width > 0),
  profile smallint not null check (profile > 0),
  diameter smallint not null check (diameter > 0),
  is_commercial boolean not null default false,
  season text not null check (season in ('summer', 'winter', 'all_season')),
  tread_depth_mm numeric(3,1),
  dot text,
  quantity smallint not null default 1 check (quantity >= 0),
  purchase_price numeric(10,2),
  sale_price numeric(10,2) not null check (sale_price >= 0),
  status public.tyre_status not null default 'available',
  location text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.profiles enable row level security;
alter table public.tyres enable row level security;

create policy "Users can see their own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Admins can read complete tyre records" on public.tyres for select to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Authenticated staff can add tyres" on public.tyres for insert to authenticated with check (true);
create policy "Authenticated staff can update tyres" on public.tyres for update to authenticated using (true) with check (true);

-- Zaposleni čitaju samo ovaj pogled: nabavna cena nikada nije izložena u browseru.
create or replace function public.employee_inventory()
returns table (
  id uuid, brand text, model text, width smallint, profile smallint, diameter smallint,
  is_commercial boolean, season text, tread_depth_mm numeric, dot text, quantity smallint,
  sale_price numeric, status public.tyre_status, location text, is_public boolean, created_at timestamptz
)
language sql security definer set search_path = public
as $$
  select id, brand, model, width, profile, diameter, is_commercial, season, tread_depth_mm, dot,
         quantity, sale_price, status, location, is_public, created_at
  from public.tyres
  where exists (select 1 from public.profiles where id = auth.uid());
$$;

revoke all on function public.employee_inventory() from public;
grant execute on function public.employee_inventory() to authenticated;
