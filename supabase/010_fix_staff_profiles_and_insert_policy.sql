-- Jednokratna ispravka za postojeće zaposlene kreirane u Supabase Authentication-u.
-- Ne menja ulogu postojećih profila i ne dira podatke o gumama.

insert into public.profiles (id, full_name, role)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.email),
  'employee'::public.app_role
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- U projektu su kroz ranije korake postojala dva različita naziva iste politike.
-- Oba se uklanjaju i ostaje jedno jasno pravilo za sve prijavljene korisnike.
drop policy if exists "Staff can add tyres" on public.tyres;
drop policy if exists "Authenticated staff can add tyres" on public.tyres;

create policy "Authenticated staff can add tyres"
on public.tyres for insert to authenticated
with check (auth.uid() is not null);
