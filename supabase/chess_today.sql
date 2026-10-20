-- Chess Trainer: lets the phone-reminder job see ONLY how many of today's 4 tasks are done (nothing else).
-- Run once in Supabase → SQL Editor → New query → paste → Run. It only reads the chess table; fitness tables are untouched.

create or replace function public.chess_today(day text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('n', coalesce((data -> 'day' -> day ->> 'n')::int, 0),
                            'left', coalesce(data -> 'day' -> day -> 'left', '[]'::jsonb))
  from public.chess_progress
  order by updated_at desc
  limit 1
$$;

revoke all on function public.chess_today(text) from public;
grant execute on function public.chess_today(text) to anon, authenticated;
