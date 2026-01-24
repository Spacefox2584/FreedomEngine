-- FE.01.A2.R5 — Live World MVP
-- Tables:
--   fe_worlds: a shared "world" id (later maps to business/org)
--   fe_lanes: lanes for C-Deck (shared)
--   fe_cards: cards for C-Deck (notes stored as JSON)
--
-- This migration is designed to be idempotent.

create table if not exists fe_worlds (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system'
);

create table if not exists fe_lanes (
  id text primary key,
  world_id uuid not null references fe_worlds(id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'unknown',
  updated_device text not null default 'unknown'
);

create index if not exists idx_fe_lanes_world on fe_lanes(world_id);

create table if not exists fe_cards (
  id uuid primary key,
  world_id uuid not null references fe_worlds(id) on delete cascade,
  lane_id text not null default '0',
  sort_order numeric not null default 0,
  title text not null default '',
  body text not null default '',
  status text not null default 'active',
  priority text not null default 'normal',
  channel text,
  summary text,
  next_action text,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'unknown',
  updated_device text not null default 'unknown'
);

create index if not exists idx_fe_cards_world on fe_cards(world_id);
create index if not exists idx_fe_cards_world_lane on fe_cards(world_id, lane_id);

create or replace function fe_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_fe_worlds_updated_at on fe_worlds;
create trigger trg_fe_worlds_updated_at
before update on fe_worlds
for each row execute function fe_set_updated_at();

drop trigger if exists trg_fe_lanes_updated_at on fe_lanes;
create trigger trg_fe_lanes_updated_at
before update on fe_lanes
for each row execute function fe_set_updated_at();

drop trigger if exists trg_fe_cards_updated_at on fe_cards;
create trigger trg_fe_cards_updated_at
before update on fe_cards
for each row execute function fe_set_updated_at();

-- Realtime:
-- Enable publication for these tables in Supabase UI (Database -> Replication).
