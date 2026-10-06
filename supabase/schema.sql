-- ============================================================================
-- SHD FIELD TOOLKIT — SUPABASE SCHEMA
-- Run ONCE in Supabase → SQL Editor → New query → paste all → Run.
-- Safe to re-run: everything is "if not exists" / "or replace".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

-- One row per dataset; the whole dataset is one JSON blob.
--   gear, gear-logo-map, talents, weapon-classes   → published, read by the public pages
--   ref-gearsets, ref-brandsets, ref-named          → unpublished, Build Creator only
create table if not exists public.datasets (
  key            text primary key,
  data           jsonb       not null,
  schema_version int         not null default 1,
  version        int         not null default 1,
  published      boolean     not null default true,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

-- One row per build. `data` is the build object exactly as the Builds page renders it.
create table if not exists public.builds (
  id          text primary key,
  category    text        not null check (category in ('dps','skill','tank','support','heal','hybrid')),
  status      text        not null default 'draft' check (status in ('draft','published','archived')),
  sort_order  int         not null default 100,
  data        jsonb       not null,
  version     int         not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Every previous version of every row above, written automatically on update/delete.
create table if not exists public.content_history (
  id          bigserial   primary key,
  table_name  text        not null,
  row_key     text        not null,
  version     int         not null,
  data        jsonb       not null,
  extra       jsonb,                        -- builds: status / category / sort_order at that version
  changed_at  timestamptz not null default now(),
  changed_by  text
);
-- Projects created from the first draft of the spec lack this column
alter table public.content_history add column if not exists extra jsonb;

create index if not exists content_history_lookup
  on public.content_history (table_name, row_key, version desc);

-- ---------------------------------------------------------------------------
-- 2. VERSIONING TRIGGER
--    On UPDATE: archive the old row, bump version, stamp updated_at.
--    On DELETE: archive the old row so a deleted build can be restored.
-- ---------------------------------------------------------------------------
create or replace function public.track_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_row jsonb := to_jsonb(old);
begin
  insert into public.content_history (table_name, row_key, version, data, extra, changed_by)
  values (
    tg_table_name,
    coalesce(old_row->>'key', old_row->>'id'),
    (old_row->>'version')::int,
    old_row->'data',
    case when tg_table_name = 'builds'
         then jsonb_build_object('status', old_row->'status',
                                 'category', old_row->'category',
                                 'sort_order', old_row->'sort_order')
    end,
    old_row->>'updated_by'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.version    := old.version + 1;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists datasets_track on public.datasets;
create trigger datasets_track
  before update or delete on public.datasets
  for each row execute function public.track_change();

drop trigger if exists builds_track on public.builds;
create trigger builds_track
  before update or delete on public.builds
  for each row execute function public.track_change();

-- ---------------------------------------------------------------------------
-- 3. SECURITY
--    The public (anon / publishable key) can only READ published rows.
--    Nobody but the server-side secret key can write anything.
--    The secret / service_role key bypasses RLS, so no write policies needed.
-- ---------------------------------------------------------------------------
alter table public.datasets        enable row level security;
alter table public.builds          enable row level security;
alter table public.content_history enable row level security;

drop policy if exists datasets_public_read on public.datasets;
create policy datasets_public_read on public.datasets
  for select to anon using (published);

drop policy if exists builds_public_read on public.builds;
create policy builds_public_read on public.builds
  for select to anon using (status = 'published');

-- content_history has RLS on and no policies → invisible to the public.

-- Belt and braces: anon may SELECT the two content tables and nothing else.
revoke all on public.datasets, public.builds, public.content_history from anon, authenticated;
grant select on public.datasets, public.builds to anon;
revoke all on sequence public.content_history_id_seq from anon, authenticated;
