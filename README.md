# TyreZ

Početni MVP za evidenciju polovnih guma u vulkanizerskoj radionici.

## Pokretanje lokalno

1. Instalirajte pakete: `npm install`
2. Kopirajte `.env.example` u `.env.local` i kasnije dodajte Supabase podatke.
3. Pokrenite aplikaciju: `npm run dev`

## Supabase

Nakon kreiranja Supabase projekta, pokrenite sadržaj `supabase/schema.sql` u SQL Editor-u. U prvoj fazi aplikacija koristi prikazne podatke u interfejsu; sledeći korak je povezivanje prijave i stvarnih podataka iz Supabase-a.

## Deployment

Vercel može direktno da prepozna ovaj Vite projekat. Pri povezivanju repozitorijuma dodajte `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` kao Environment Variables.
