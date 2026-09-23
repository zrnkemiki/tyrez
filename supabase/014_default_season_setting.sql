-- Podrazumevana sezona koja se postavlja pri svakom novom unosu gume.

alter table public.workshop_settings
  add column if not exists default_season text not null default 'summer'
  check (default_season in ('summer', 'winter', 'all_season'));
