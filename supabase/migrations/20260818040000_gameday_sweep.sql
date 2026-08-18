-- Live scoring sweep (build plan task 23).
--
-- Runs every 5 minutes. The plan's budget is ~10 API calls per sweep against a
-- 600/min ceiling, so there is no need to over-engineer caching — but there IS
-- a need not to hammer the provider on a Tuesday. gameday_sweep() short-circuits
-- when nothing is live, so an idle tick costs one cheap query and no HTTP call.

-- The slate we are currently playing: the most recent week to have kicked off.
create or replace function public.current_slate()
returns table (season integer, season_type smallint, week integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select w.season, w.season_type, w.week
    from (
      select g.season, g.season_type, g.week, min(g.starts_at) as first_kick
        from public.games g
       where g.week is not null
       group by g.season, g.season_type, g.week
    ) w
   where w.first_kick <= now() + interval '1 hour'
   order by w.first_kick desc
   limit 1;
$$;

-- True when a game in the current slate is in progress, or finished recently
-- enough that late stat corrections are still likely.
create or replace function public.slate_is_live()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.games g
      join public.current_slate() s
        on s.season = g.season and s.season_type = g.season_type and s.week = g.week
     where g.starts_at <= now()
       and (g.status_state is distinct from 'final'
            or g.starts_at > now() - interval '6 hours')
  );
$$;

-- One tick. Fires ingestion (pg_net is async, so the rows land before the next
-- tick) and rescores whatever is already ingested. score_week() is idempotent,
-- so the overlap between the two is harmless by design.
create or replace function public.gameday_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  s        record;
  v_live   boolean;
  v_score  jsonb;
  v_req    bigint;
begin
  select * into s from public.current_slate();
  if s is null then
    return jsonb_build_object('skipped', 'no slate');
  end if;

  select public.slate_is_live() into v_live;
  if not v_live then
    return jsonb_build_object('skipped', 'nothing live', 'season', s.season, 'week', s.week);
  end if;

  select net.http_post(
    url     := 'https://ygrmsleanavyewfbhlth.functions.supabase.co/ingest-stats',
    body    := jsonb_build_object('season', s.season, 'seasonType', s.season_type,
                                  'weeks', jsonb_build_array(s.week), 'finalOnly', false),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret')
    ),
    timeout_milliseconds := 120000
  ) into v_req;

  v_score := public.score_week(s.season, s.season_type, s.week);

  return jsonb_build_object(
    'season', s.season, 'season_type', s.season_type, 'week', s.week,
    'ingest_request', v_req, 'scored', v_score
  );
end;
$$;

revoke execute on function public.gameday_sweep() from public, anon, authenticated;

select cron.schedule(
  'gameday-sweep',
  '*/5 * * * *',
  $cron$ select public.gameday_sweep(); $cron$
);
