-- Ispravka RLS pravila: svaki prijavljeni korisnik sa profilom može da unese gumu.
-- Admin i zaposleni i dalje imaju različit prikaz podataka (nabavna cena je samo za admina).

drop policy if exists "Authenticated staff can add tyres" on public.tyres;
create policy "Authenticated staff can add tyres"
on public.tyres for insert to authenticated
with check (
  auth.uid() is not null
  and exists (select 1 from public.profiles where id = auth.uid())
);
