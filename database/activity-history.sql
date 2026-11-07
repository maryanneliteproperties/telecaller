-- Admin-only activity audit trail. Run after workspace-access.sql.
create table if not exists public.workspace_activity_history (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  actor_name text not null,
  actor_role text not null check (actor_role in ('admin','employee')),
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_label text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workspace_activity_history_created_at_idx
  on public.workspace_activity_history (created_at desc);
create index if not exists workspace_activity_history_entity_type_idx
  on public.workspace_activity_history (entity_type);
alter table public.workspace_activity_history enable row level security;
revoke all on public.workspace_activity_history from anon, authenticated;
grant all on public.workspace_activity_history to service_role;
