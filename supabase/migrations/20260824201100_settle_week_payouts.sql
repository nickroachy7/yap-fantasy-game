-- One payday, and something that actually calls it.
--
-- ---------------------------------------------------------------------------
-- THE FAUCET WAS NEVER WIRED
-- ---------------------------------------------------------------------------
--
-- `grant_weekly_gems` and `award_score_gems` have existed since the gem faucet
-- shipped and `gems_ledger` contains ZERO rows from either of them. Nothing
-- scheduled them and nothing called them. Every gem in the game so far came
-- from the signup bonus, selling a card, or committing one to a set — which is
-- to say the entire play-to-earn half of this economy has been dark since it
-- was written, and a player who concluded that packs were the only thing worth
-- doing was reading the game accurately.
--
-- The functions were fine. This is the missing caller.
--
-- ---------------------------------------------------------------------------
-- WHY ALL THREE PAY AT THE SAME MOMENT
-- ---------------------------------------------------------------------------
--
-- The flat grant could just as easily land on a Tuesday, and the first draft
-- had it there. Paying it on WEEK COMPLETION instead means every gem a player
-- earns for a week arrives in one event, which is the event `week_recap` draws.
-- A grant that turned up separately would be a second, unexplained balance
-- change with no screen attached to it, and the recap's own total would
-- reconcile with the wallet only by coincidence.
--
-- ---------------------------------------------------------------------------
-- IT IS A SWEEP, NOT AN EVENT HANDLER
-- ---------------------------------------------------------------------------
--
-- "A week completed" is not something this database is ever told. It is simply
-- true on some pass and was not on the one before — the same reasoning
-- `score_week` records for recomputing career_fp globally rather than for one
-- week. So this looks at every week that HAS games, asks which are complete,
-- and pays each one. Weeks already paid cost three no-op statements apiece
-- because every payout underneath is keyed and idempotent.
--
-- BOUNDED TO THE CURRENT SEASON so the sweep does not lengthen forever as
-- seasons accumulate. A week that somehow completes after its season has rolled
-- over is a backfill and should be run deliberately, by hand, with the figures
-- in front of somebody.

create or replace function public.settle_week_payouts(p_season integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season integer;
  v_week   record;
  v_paid   jsonb := '[]'::jsonb;
begin
  v_season := coalesce(p_season, (select max(season) from public.games));
  if v_season is null then
    return jsonb_build_object('settled', 0, 'reason', 'no games');
  end if;

  for v_week in
    select g.season, g.season_type, g.week
      from public.games g
     where g.season = v_season
       and g.week is not null
     group by g.season, g.season_type, g.week
    having count(*) filter (where g.status_state is distinct from 'final') = 0
     order by g.season_type, g.week
  loop
    -- Each is separately idempotent, so a week already paid falls straight
    -- through. Order matters only for readability: the two award functions
    -- refuse on their own if the week is somehow not complete after all.
    perform public.grant_weekly_gems(v_week.season, v_week.season_type::smallint, v_week.week);
    perform public.award_score_gems(v_week.season, v_week.season_type::smallint, v_week.week);
    perform public.award_position_bonuses(v_week.season, v_week.season_type::smallint, v_week.week);

    v_paid := v_paid || jsonb_build_array(
      jsonb_build_object('season_type', v_week.season_type, 'week', v_week.week));
  end loop;

  return jsonb_build_object('season', v_season, 'weeks', v_paid,
                            'settled', jsonb_array_length(v_paid));
end;
$$;

revoke execute on function public.settle_week_payouts(integer) from public, anon, authenticated;

comment on function public.settle_week_payouts(integer) is
  'Pays the weekly grant, the per-point award and the positional bonuses for every complete week of a season. Idempotent throughout: safe to run on a schedule and safe to re-run.';
