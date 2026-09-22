-- Pokrenuti jednom u Supabase SQL Editor-u nakon schema.sql.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'employee');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop policy if exists "Authenticated staff can add tyres" on public.tyres;
create policy "Staff can add tyres" on public.tyres for insert to authenticated with check (created_by = auth.uid());

-- Nakon što napraviš prvi nalog, pokreni:
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'tvoj@email.com');
