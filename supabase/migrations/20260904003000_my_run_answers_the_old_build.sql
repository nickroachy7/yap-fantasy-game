-- `my_run` comes back as a shim, for as long as an old build can still ask.
--
-- ---------------------------------------------------------------------------
-- THE MISTAKE THIS FIXES, WHICH IS ABOUT ORDER AND NOT ABOUT HEARTS
-- ---------------------------------------------------------------------------
--
-- `20260903230000` dropped `my_run`, correctly: the client had stopped calling
-- it in the same commit, and a function returning a rack of hearts for a game
-- with no rack is worse than no function.
--
-- But a migration reaches EVERY INSTALL THE MOMENT IT IS APPLIED, and the
-- JavaScript that stopped calling it reaches an install on that install's next
-- two launches. In between, a tester on the previous build is running old JS
-- against a new database — and old `PlayerContext` calls `my_run()` in the same
-- `Promise.all` as the profile, the balance and the roster, then does:
--
--     const failure = profile.error ?? balance.error ?? rosterRow.error ?? runRow.error;
--     if (failure) return failure.message;
--
-- So `42883 function public.my_run() does not exist` does not degrade the heart
-- pill. IT FAILS THE WHOLE PLAYER CONTEXT — no name, no coin balance, no roster
-- count, an error in the masthead on every screen — until that tester happens to
-- relaunch twice. The app looks broken, and nothing in the app says why.
--
-- ---------------------------------------------------------------------------
-- THE RULE, STATED SO IT OUTLIVES THIS FUNCTION
-- ---------------------------------------------------------------------------
--
-- OVER-THE-AIR UPDATES MAKE EVERY SCHEMA CHANGE A ROLLING DEPLOY. The server
-- moves at once; the clients move over the following days. So a migration may
-- only remove something the CURRENT build does not read — never something the
-- PREVIOUS build still reads. Removing it is a second migration, after the
-- fleet has moved.
--
-- That applies to more than dropping a function: a narrowed return type, a
-- renamed key in a jsonb payload, and a new NOT NULL column are the same shape.
-- The tell is that the client change and the schema change are in one commit
-- and the client change is a DELETION.
--
-- ---------------------------------------------------------------------------
-- WHAT THE SHIM RETURNS, AND WHY THESE VALUES
-- ---------------------------------------------------------------------------
--
-- Exactly the keys the old `parseRun` reads, so nothing it does with the result
-- can throw. The values are chosen to make the old chrome tell the least
-- misleading story it is capable of telling:
--
--   `hearts` and `rack` are the STARTING count, so an old masthead draws a full
--   rack rather than a damaged one. It is a fiction either way — there is no
--   rack — and a full one is the fiction that does not tell somebody they have
--   lost something.
--
--   `wagered` is nought. Nothing is at stake, which is true.
--
--   `awaiting_carry` is FALSE, and this is the load-bearing one. It is what the
--   old `LobbyView` tests to draw its dead-run row and push `/run-over`, and
--   `20260903230000` revoked `claim_carry` from `authenticated` — so a true
--   here would route a tester to a screen whose only button now raises. False
--   makes that screen unreachable, which it should be: no run can end.
--
--   `carry_slots` and `next_rung` are nought and null, so the old lobby's
--   ladder line renders as nothing rather than promising a carry.
--
-- The real fields — `wins`, `losses`, `held_cards` — are read live, because the
-- record is still real and the old header prints it.
--
-- ---------------------------------------------------------------------------
-- DELETE THIS
-- ---------------------------------------------------------------------------
--
-- Once every tester is on a build published after 2026-09-04. There is no
-- automatic signal for that; check with Nick. `current_run()` is the real
-- function and is unaffected — this only exists for builds that predate the
-- removal, and the current client calls neither.
create or replace function public.my_run()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_run public.runs;
begin
  v_run := public.current_run();
  return jsonb_build_object(
    'id',             v_run.id,
    'started_at',     v_run.started_at,
    'hearts',         v_run.hearts,
    'max_hearts',     v_run.max_hearts,
    'rack',           v_run.hearts,
    'wagered',        0,
    'wagered_in',     0,
    'wins',           v_run.wins,
    'losses',         v_run.losses,
    'ended_at',       null,
    'ended_reason',   null,
    'awaiting_carry', false,
    'carry_slots',    0,
    'next_rung',      null,
    'held_cards',     (select count(*) from public.card_instances
                        where user_id = v_run.user_id and is_held),
    'lost_cards',     0
  );
end;
$function$;

-- The grant the drop took with it. `authenticated` only — an old build asks
-- this signed in, and `anon` never had it.
grant execute on function public.my_run() to authenticated;
