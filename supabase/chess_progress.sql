-- Chess Trainer: progress sync table, in the fitness app's Supabase project.
-- Completely separate from the fitness app: its own table, its own rules. Nothing else is read or changed.
-- Run once in Supabase → SQL Editor → New query → paste → Run.

create table if not exists public.chess_progress (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,   -- the app's whole progress object
  updated_at timestamptz not null default now()
);

alter table public.chess_progress enable row level security;

-- Only a signed-in user, and only their own row. Visitors who are not signed in get nothing.
revoke all on public.chess_progress from anon;
grant select, insert, update on public.chess_progress to authenticated;

drop policy if exists "chess progress: read own"   on public.chess_progress;
drop policy if exists "chess progress: insert own" on public.chess_progress;
drop policy if exists "chess progress: update own" on public.chess_progress;

create policy "chess progress: read own"   on public.chess_progress for select to authenticated using (auth.uid() = user_id);
create policy "chess progress: insert own" on public.chess_progress for insert to authenticated with check (auth.uid() = user_id);
create policy "chess progress: update own" on public.chess_progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
