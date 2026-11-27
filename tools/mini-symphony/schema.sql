-- Bootstrap ONLY on a dedicated Symphony database. Run as database owner.
-- This is not a migration of the Helios citizen database.
begin;
create schema if not exists mini_symphony;
revoke all on schema mini_symphony from public;
create table if not exists mini_symphony.settings (
  singleton boolean primary key default true check (singleton),
  max_agents integer not null default 20 check (max_agents between 1 and 50)
);
insert into mini_symphony.settings(singleton) values(true) on conflict do nothing;
create table if not exists mini_symphony.jobs (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'),
  prompt text not null check (length(prompt) between 1 and 50000),
  state text not null default 'queued' check (state in ('queued','running','needs_review','draft_created','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  attempt integer not null default 0,
  worker_id text,
  lease_token uuid,
  lease_until timestamptz,
  result jsonb,
  check ((state = 'running') = (lease_token is not null and lease_until is not null and worker_id is not null))
);
create index if not exists symphony_job_queue on mini_symphony.jobs(state,created_at,id);
alter table mini_symphony.settings enable row level security;
alter table mini_symphony.jobs enable row level security;
revoke all on all tables in schema mini_symphony from public;
-- For a dedicated NOINHERIT login named symphony_runner, provision the login
-- separately with a strong password (never commit it), then run:
-- grant usage on schema mini_symphony to symphony_runner;
-- grant select, update on mini_symphony.settings to symphony_runner;
-- grant select, insert, update on mini_symphony.jobs to symphony_runner;
-- create policy symphony_settings on mini_symphony.settings for all to symphony_runner using (true) with check (true);
-- create policy symphony_jobs on mini_symphony.jobs for all to symphony_runner using (true) with check (true);
commit;
