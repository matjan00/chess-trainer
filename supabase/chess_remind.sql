-- Chess Trainer: phone reminders at 9:00, 18:00 and 21:00 Warsaw time, run by the database itself (pg_cron + pg_net),
-- skipped once Today's 4 tasks are done. Reads only public.chess_progress (through chess_today); fitness tables untouched.
-- Run once in Supabase → SQL Editor. Replace YOUR-NTFY-TOPIC with your ntfy topic first (it is not stored in this repo).
-- Test: select public.chess_remind(true);   Stop: select cron.unschedule('chess-reminder');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.chess_remind(test boolean default false)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  local_now timestamp := now() at time zone 'Europe/Warsaw';
  h int := extract(hour from local_now);
  s jsonb := public.chess_today(to_char(local_now, 'YYYY-MM-DD'));
  n int := coalesce((s ->> 'n')::int, 0);
  rest text;
  title text;
begin
  if not test and (h not in (9, 18, 21) or n >= 4) then return; end if;
  select coalesce(string_agg(x, ', '), 'all 4 tasks') into rest from jsonb_array_elements_text(coalesce(s -> 'left', '[]'::jsonb)) x;
  title := case when test then 'Chess trainer: test' when h = 9 then 'Today''s chess training'
                when h = 18 then 'Chess: still to do today' else 'Last call for today''s chess' end;
  perform net.http_post(
    url := 'https://ntfy.sh/',
    body := jsonb_build_object('topic', 'YOUR-NTFY-TOPIC', 'title', title, 'message', n || '/4 done. Left: ' || rest || '.',
                               'click', 'https://matjan00.github.io/chess-trainer/', 'tags', jsonb_build_array('chess_pawn'), 'priority', 4));
end
$$;

revoke all on function public.chess_remind(boolean) from public, anon, authenticated;

-- every hour on the hour (UTC); the function itself only sends at 9, 18 and 21 Warsaw time, so summer/winter time just works
select cron.schedule('chess-reminder', '0 * * * *', 'select public.chess_remind()');
