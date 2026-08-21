-- The sweep moves to once a minute while a game is being played.
--
-- ---------------------------------------------------------------------------
-- WHAT FIVE MINUTES ACTUALLY COSTS
-- ---------------------------------------------------------------------------
--
-- The five-minute cadence was chosen when nothing rendered the result. Now that
-- a row shows a player's points as they land, the cadence IS the feature: five
-- minutes is the worst-case delay between a touchdown and the number moving,
-- and the client adds its own poll interval on top. A reader who watches the
-- game and the app side by side sees the app lag by up to eight minutes, which
-- does not read as "slightly behind" — it reads as broken.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS SAFE TO DO BLUNTLY
-- ---------------------------------------------------------------------------
--
-- `gameday_sweep()` already short-circuits on `slate_is_live()` before it makes
-- any HTTP call, so an idle tick is one indexed query and an insert. The
-- schedule can therefore be raised without any conditional scheduling: the
-- function decides, the cron just asks more often. 20260818040000 built it that
-- way on purpose ("an idle tick costs one cheap query and no HTTP call") and
-- last night's log confirms it — 480 stood-down ticks, none of them touching
-- the provider.
--
-- Budget, at the new rate and while live: one /games call plus one or two
-- /stats calls per tick, so ~3 per minute against a 600/minute ceiling. The
-- headroom is two orders of magnitude.
--
-- sweep_log grows from 288 rows a day to 1440. Over a full season that is
-- roughly 200k rows in a table with one index, which is nothing, and the
-- density is the point: a hole in a once-a-minute log localises a missed
-- scheduler to the minute instead of to a five-minute window.

select cron.unschedule('gameday-sweep')
where exists (select 1 from cron.job where jobname = 'gameday-sweep');

select cron.schedule(
  'gameday-sweep',
  '* * * * *',
  $cron$ select public.gameday_sweep(); $cron$
);
