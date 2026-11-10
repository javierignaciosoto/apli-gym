-- Esquema de Apli-Gym en Supabase.
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo este archivo → Run.
-- Se puede ejecutar más de una vez sin problemas.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table if not exists public.entries (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  exercise    text not null,
  equipment   text not null check (equipment in ('barra', 'mancuernas', 'peso_corporal')),
  weight      numeric not null default 0 check (weight >= 0),
  sets        integer not null check (sets >= 1),
  reps        integer not null check (reps >= 1),
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),  -- último cambio (lo pone la app)
  deleted     boolean not null default false,       -- borrado suave
  synced_at   timestamptz not null default now()    -- lo pone el servidor; sirve para bajar solo lo nuevo
);

create table if not exists public.goals (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise    text not null,
  equipment   text not null check (equipment in ('barra', 'mancuernas', 'peso_corporal')),
  metric      text not null check (metric in ('weight', 'e1rm', 'reps')),
  target      numeric not null check (target > 0),
  deadline    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false,
  synced_at   timestamptz not null default now()
);

create index if not exists entries_user_synced_idx on public.entries (user_id, synced_at);
create index if not exists goals_user_synced_idx   on public.goals   (user_id, synced_at);

-- ---------------------------------------------------------------------------
-- synced_at siempre lo fija el servidor (no se confía en el reloj del celular)
-- y user_id no se puede cambiar.
-- ---------------------------------------------------------------------------
create or replace function public.apligym_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.synced_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before insert or update on public.entries
  for each row execute function public.apligym_touch();

drop trigger if exists goals_touch on public.goals;
create trigger goals_touch before insert or update on public.goals
  for each row execute function public.apligym_touch();

-- ---------------------------------------------------------------------------
-- Seguridad: cada usuario solo ve y modifica sus propios datos.
-- No hay política de DELETE: los borrados son "suaves" (deleted = true).
-- ---------------------------------------------------------------------------
alter table public.entries enable row level security;
alter table public.goals   enable row level security;

drop policy if exists "entries: ver propios"        on public.entries;
drop policy if exists "entries: insertar propios"   on public.entries;
drop policy if exists "entries: actualizar propios" on public.entries;
create policy "entries: ver propios"        on public.entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "entries: insertar propios"   on public.entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "entries: actualizar propios" on public.entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "goals: ver propios"        on public.goals;
drop policy if exists "goals: insertar propios"   on public.goals;
drop policy if exists "goals: actualizar propios" on public.goals;
create policy "goals: ver propios"        on public.goals for select to authenticated using ((select auth.uid()) = user_id);
create policy "goals: insertar propios"   on public.goals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "goals: actualizar propios" on public.goals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on public.entries to authenticated;
grant select, insert, update on public.goals   to authenticated;
