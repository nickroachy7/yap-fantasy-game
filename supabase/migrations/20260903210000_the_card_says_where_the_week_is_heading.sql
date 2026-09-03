-- The card says where the week is heading
--
-- ---------------------------------------------------------------------------
-- THE PRE-GAME CARD WAS BLANK, AND IT WAS BLANK ON PURPOSE
-- ---------------------------------------------------------------------------
--
-- `ContestCard`'s scoring band is the point of the whole card: your total, the
-- total you have to beat, and one rail placing the two. Every one of those
-- inputs comes from scores that have been PLAYED, so on the Tuesday a week
-- opens the band reads
--
--     YOU            VS            TO BEAT
--     0.0            —                  —
--     PROJ —                       PROJ —
--
-- and stays that way until Sunday afternoon. The one moment a manager is
-- actually making a decision — which lineup to file, which contest to spend a
-- heart on — is the one moment the card can tell them nothing at all.
--
-- `20260903010000` removed the reason. Every player in the regular season has a
-- provider projection for every week, in the same PPR currency the settled
-- result is taken under (`20260903020000`), so a lineup can be totalled forward
-- exactly the way it is totalled backward. This adds six columns that do it.
--
-- ---------------------------------------------------------------------------
-- A FORECAST IS A LINEUP TOTAL WITH THE FUTURE FILLED IN
-- ---------------------------------------------------------------------------
--
-- Per slot: if the player's game has kicked off, take what the slot has BANKED
-- (`lineup_slots.points`, which the gameday sweep keeps current); otherwise
-- take the projection. So the same expression is
--
--   pre-game   pure projection
--   Sunday     what has happened, plus what is still expected
--   final      identical to `total_points`, because nothing is left to project
--
-- which is the property that makes it safe to draw beside a real score: the two
-- converge rather than disagreeing at the whistle.
--
-- NOTHING IS INVENTED WHERE THERE IS NO PROJECTION. A lineup with no projected
-- player at all (the whole preseason, where the provider publishes none)
-- produces no forecast row and every column below stays null — the dash the
-- card has drawn for its entire life. A lineup with SOME projections keeps
-- going: a missing row means a player the provider is not expecting to play,
-- which projects at nothing, and that is a truer contribution than refusing to
-- answer.
--
-- ---------------------------------------------------------------------------
-- THE FIELD'S FORECAST IS ALL OR NOTHING — `fc_full`
-- ---------------------------------------------------------------------------
--
-- `my_projected` is yours and needs nobody else. The other five columns place
-- you IN a field, and a distribution computed over some of the entrants is
-- worse than no distribution: a cut taken at third place over the three
-- entrants who happen to be forecast, in a contest of twenty-four, is a number
-- with the shape of a threshold and none of the meaning. So the field's
-- forecast is published only where EVERY entry in it has one, and is null
-- otherwise. Half a comparison is not a cheaper comparison.
--
-- ---------------------------------------------------------------------------
-- THE SAME ARITHMETIC AS THE REAL FIELD, DELIBERATELY
-- ---------------------------------------------------------------------------
--
-- `fc_field`, `fc_ranked`, `fc_places`, `fc_cutline` and `fc_sololine` are the
-- existing `field`, `ranked`, `places`, `cutline` and `sololine` with one
-- substitution: the forecast total in place of the played one. They are written
-- out rather than parameterised because the pair has to be legible AS a pair —
-- if the projected cut is ever taken at a different place from the real cut,
-- the card draws a threshold on Saturday that settlement does not honour on
-- Monday, and the difference has to be visible in the diff. Change one, change
-- both.
--
-- `sololine`'s reason carries over unchanged: a one-place contest has no cut,
-- so the line is the best score that is not yours. The Duel is the only such
-- format.

drop function if exists public.my_contest_cards(text);

CREATE OR REPLACE FUNCTION public.my_contest_cards(p_include text DEFAULT NULL::text)
 RETURNS TABLE(contest_id uuid, code text, kind contest_kind, name text, format_code text, format_name text, slot_count smallint, entry_fee_coins integer, season integer, season_type smallint, week integer, lineup_id uuid, filled integer, entrants bigint, low numeric, median numeric, average numeric, high numeric, final boolean, my_points numeric, my_rank bigint, ahead bigint, result text, hearts_at_risk smallint, hearts_on_win smallint, win_condition contest_win_condition, win_rank integer, cut numeric, prize_pool integer, my_prize integer, my_coins integer, recap boolean, payout_curve contest_payout_curve, win_pct smallint, target_points numeric, score_rate numeric, podium_coins integer, podium_places smallint, my_podium integer, my_projected numeric, proj_low numeric, proj_median numeric, proj_high numeric, proj_cut numeric, proj_rank bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with slate as (select * from public.lineup_slate() limit 1),
  past as (select * from public.recap_slate() limit 1),
  mine as (
    select c.*, l.id as lineup_id, l.total_points as my_points, false as recap
      from public.contests c
      join slate s on s.season = c.season and s.season_type = c.season_type and s.week = c.week
      left join public.lineups l on l.contest_id = c.id and l.user_id = auth.uid()
     where l.id is not null or c.code = p_include or c.kind = 'free'
    union all
    select c.*, l.id, l.total_points, true
      from public.contests c
      join past p on p.season = c.season and p.season_type = c.season_type and p.week = c.week
      join public.lineups l on l.contest_id = c.id and l.user_id = auth.uid()
  ),
  -- THE LINEUP'S OWN ID AND WEEK TRAVEL WITH THE ENTRY NOW, so the forecast
  -- below can reach its slots and its fixtures without joining `lineups` a
  -- second time. Nothing else reads them.
  entries as (
    select l.contest_id, l.user_id, l.id as lineup_id,
           l.season, l.season_type, l.week, l.total_points as pts
      from public.lineups l
      join mine m on m.id = l.contest_id
     where exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select e.contest_id, count(*) as entrants, min(e.pts) as low,
           round((percentile_cont(0.5) within group (order by e.pts::double precision))::numeric, 2) as median,
           round(avg(e.pts), 2) as average, max(e.pts) as high
      from entries e group by e.contest_id
  ),
  ranked as (
    select e.contest_id, e.user_id, e.pts,
           rank() over (partition by e.contest_id order by e.pts desc) as rnk
      from entries e
  ),
  -- The last paying place, however this contest decides how many there are.
  -- Same floor-and-at-least-one as `contest_results`, deliberately the same
  -- arithmetic rather than the same constant.
  places as (
    select m.id as contest_id,
           case m.win_condition
             when 'top_n'   then m.win_rank::bigint
             when 'top_pct' then greatest(1, floor(coalesce(fl.entrants, 0) * m.win_pct / 100.0))::bigint
           end as cut_rank
      from mine m
      left join field fl on fl.contest_id = m.id
  ),
  cutline as (
    select r.contest_id, min(r.pts) as cut
      from ranked r
      join places p on p.contest_id = r.contest_id
     where p.cut_rank is not null and r.rnk <= p.cut_rank
     group by r.contest_id
  ),
  -- A ONE-PLACE CONTEST HAS NO CUT TO SPEAK OF, and taking one degenerates.
  --
  -- `cutline` is "the lowest score still inside the paying places", which is
  -- exactly right at three places and nonsense at one: the only score inside
  -- the places is the leader's, so the leader is drawn against THEMSELVES —
  -- their own total on both sides of the scoreboard and a margin of zero. The
  -- Duel (`20260901050000`) is the first contest to pay one place, so this has
  -- never fired before.
  --
  -- The honest line where one place pays is the best score that is not yours.
  -- Second sees the leader they have to catch; the leader sees the runner-up
  -- they have to stay above. Both are the number that decides it, which is what
  -- this column is for.
  sololine as (
    select r.contest_id, max(r.pts) as cut
      from ranked r
      join places p on p.contest_id = r.contest_id
     where p.cut_rank = 1
       and r.user_id is distinct from auth.uid()
     group by r.contest_id
  ),

  -- ------------------------------------------------------------------ forecast
  --
  -- The same five CTEs again, on the total each entry is HEADING for rather
  -- than the one it has. See the header for why they are written twice.
  forecast as (
    select e.contest_id, e.user_id,
           round(sum(case
                       when coalesce(public.game_has_started(g.status_state, g.starts_at), false)
                       then ls.points
                       else coalesce(pr.projected_points, 0)
                     end), 2) as pts
      from entries e
      join public.lineup_slots ls on ls.lineup_id = e.lineup_id
      join public.card_instances ci on ci.id = ls.card_instance_id
      join public.cards cd on cd.id = ci.card_id
      join public.players p on p.id = cd.player_id
      -- A player with no fixture this week is on a bye and has not started, so
      -- the projection stands — which is what the provider's own row for them
      -- says. Same join as `contest_lineup`.
      left join public.games g
             on g.season = e.season and g.season_type = e.season_type and g.week = e.week
            and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
      left join public.projections pr
             on pr.player_id = p.id and pr.season = e.season
            and pr.season_type = e.season_type and pr.week = e.week
     group by e.contest_id, e.user_id
    -- NOT ONE PROJECTED PLAYER IS NOT A FORECAST OF NOUGHT, it is the absence
    -- of a forecast — the whole preseason, where the provider publishes none.
    -- Dropping the row is what leaves every column below null and the card
    -- drawing the dash it always drew.
    having count(pr.projected_points) > 0
  ),
  -- EVERY ENTRY FORECAST, OR NONE OF THEM COUNTED. See the header.
  fc_full as (
    select f.contest_id, count(*) as entrants
      from forecast f
     group by f.contest_id
    having count(*) = (select count(*) from entries e where e.contest_id = f.contest_id)
  ),
  fc_field as (
    select f.contest_id, min(f.pts) as low,
           round((percentile_cont(0.5) within group (order by f.pts::double precision))::numeric, 2) as median,
           max(f.pts) as high
      from forecast f
      join fc_full u on u.contest_id = f.contest_id
     group by f.contest_id
  ),
  fc_ranked as (
    select f.contest_id, f.user_id, f.pts,
           rank() over (partition by f.contest_id order by f.pts desc) as rnk
      from forecast f
      join fc_full u on u.contest_id = f.contest_id
  ),
  fc_places as (
    select m.id as contest_id,
           case m.win_condition
             when 'top_n'   then m.win_rank::bigint
             when 'top_pct' then greatest(1, floor(u.entrants * m.win_pct / 100.0))::bigint
           end as cut_rank
      from mine m
      join fc_full u on u.contest_id = m.id
  ),
  fc_cutline as (
    select r.contest_id, min(r.pts) as cut
      from fc_ranked r
      join fc_places p on p.contest_id = r.contest_id
     where p.cut_rank is not null and r.rnk <= p.cut_rank
     group by r.contest_id
  ),
  fc_sololine as (
    select r.contest_id, max(r.pts) as cut
      from fc_ranked r
      join fc_places p on p.contest_id = r.contest_id
     where p.cut_rank = 1
       and r.user_id is distinct from auth.uid()
     group by r.contest_id
  )
  select m.id, m.code, m.kind, m.name,
         m.format_code, f.name, f.slot_count, m.entry_fee_coins,
         m.season, m.season_type, m.week, m.lineup_id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = m.lineup_id), 0),
         coalesce(fl.entrants, 0), fl.low, fl.median, fl.average, fl.high,
         coalesce(fin.final, false), m.my_points, r.rnk,
         case when r.pts is null then null
              else (select count(*) from entries x where x.contest_id = m.id and x.pts < r.pts) end,
         cr.result, m.hearts_at_risk, m.hearts_on_win,
         m.win_condition, m.win_rank,
         -- A target is known before a ball is thrown; a cut is not known until
         -- the field has scored. Both are "the number to beat".
         case when m.win_condition = 'target' then m.target_points
              else coalesce(sl.cut, cl.cut) end,
         public.contest_prize_pool(m.id),
         cp.coins,
         (select sum(coalesce(ls.coins_awarded, 0) + coalesce(ls.bonus_coins, 0))::integer
            from public.lineup_slots ls
           where ls.lineup_id = m.lineup_id and ls.coins_awarded is not null),
         m.recap,
         m.payout_curve, m.win_pct, m.target_points, public.score_rate(),
         m.podium_coins, m.podium_places, pod.coins,
         -- WHERE THIS ENTRY IS HEADING, and where the field around it is.
         -- `my_projected` needs only your own lineup; the four after it need
         -- the whole field forecast, and are null together where it is not.
         fcm.pts,
         fcf.low, fcf.median, fcf.high,
         -- The projected line to beat, taken at the same place the real one is.
         -- A target does not move, so it is its own forecast.
         case when m.win_condition = 'target' then m.target_points
              else coalesce(fcsl.cut, fccl.cut) end,
         fcr.rnk
    from mine m
    join public.contest_formats f on f.code = m.format_code
    left join field fl on fl.contest_id = m.id
    left join ranked r on r.contest_id = m.id and r.user_id = auth.uid()
    left join cutline cl on cl.contest_id = m.id
    left join sololine sl on sl.contest_id = m.id
    left join forecast    fcm  on fcm.contest_id  = m.id and fcm.user_id = auth.uid()
    left join fc_field    fcf  on fcf.contest_id  = m.id
    left join fc_ranked   fcr  on fcr.contest_id  = m.id and fcr.user_id = auth.uid()
    left join fc_cutline  fccl on fccl.contest_id = m.id
    left join fc_sololine fcsl on fcsl.contest_id = m.id
    left join lateral (
      select bool_and(lower(coalesce(g.status_state, '')) in ('final','complete','completed')) as final
        from public.games g
       where g.season = m.season and g.season_type = m.season_type and g.week = m.week
    ) fin on true
    left join lateral (
      select res.result from public.contest_results(m.id) res where res.user_id = auth.uid()
    ) cr on true
    left join lateral (
      select pay.coins from public.contest_payouts(m.id) pay where pay.user_id = auth.uid()
    ) cp on true
    left join lateral (
      select p.coins from public.contest_podium_payouts(m.id) p where p.user_id = auth.uid()
    ) pod on true
   order by m.recap, m.kind, m.entry_fee_coins, m.name;
$function$;

-- THE DROP TOOK THE ACL WITH IT, and a function with no ACL is executable by
-- PUBLIC — which on PostgREST means `anon`. Restored in the same breath as the
-- definition, every time, for exactly that reason.
revoke execute on function public.my_contest_cards(text) from public, anon;
grant  execute on function public.my_contest_cards(text) to authenticated;
