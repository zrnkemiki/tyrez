-- Opcione podrazumevane dimenzije za brži unos guma.

alter table public.workshop_settings
  add column if not exists default_season text not null default 'summer'
    check (default_season in ('summer', 'winter', 'all_season')),
  add column if not exists default_width smallint,
  add column if not exists default_profile smallint,
  add column if not exists default_diameter smallint;
