-- Who won a contest, under whatever condition that contest runs.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS NOT `median_record` WITH AN ARGUMENT
-- ---------------------------------------------------------------------------
--
-- `median_record` answers a question about the CALLER across a season: my
-- points, my rank, my W/L, week by week. It is a screen's function and it is
-- shaped like one. Settlement needs the transpose — every entrant's result for
-- one contest, at once — and needs it without `auth.uid()` in it, because the
-- cron that will call it is not a player.
--
-- The two stay separate. Collapsing them would mean either giving the screen a
-- function that returns every user's score, or giving settlement one that has
-- to be called once per player.
--
-- ---------------------------------------------------------------------------
-- WHY A RESULT CAN BE NULL, AND WHY THAT MATTERS MORE THAN IT LOOKS
-- ---------------------------------------------------------------------------
--
-- Null means NO RESULT, which is different from a loss and must never collapse
-- into one — a null costs no heart, and every case below is a case where
-- charging a heart would be charging it for something outside the player's
-- control:
--
--   * the week is not over yet
--   * you did not enter (no lineup, or a lineup with no cards in it)
--   * the field is too small to have a result at all
--
-- That last one is the one that bites in a four-tester beta. Under `top_n`,
-- a contest with no more entrants than the cutoff — top 3 of 3 — is not a
-- contest anybody can lose, and treating it as one everybody WON would be just
-- as wrong: it would print free wins straight into the carry ladder, and the
-- ladder is the only thing standing between a death and losing everything.
-- Under `median`, one entrant is their own median. Both resolve to null.

create or replace function public.contest_results(p_contest uuid)
returns table (
  user_id   uuid,
  lineup_id uuid,
  points    numeric,
  rnk       bigint,
  entrants  bigint,
  -- 'W' | 'L' | 'T' | null. See the header on null.
  result    text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with c as (
    select id, season, season_type, week, win_condition, win_rank
      from public.contests where id = p_contest
  ),
  -- A lineup row with no slots is not an entrant. `set_lineup` writes the row
  -- before the slots and an empty payload is legal, so "opened the screen"
  -- would otherwise be scored as a nought — which under `median` drags the
  -- middle down for everybody else, and under `top_n` is a free rung for
  -- anyone above it.
  entries as (
    select l.id, l.user_id, l.total_points as pts
      from public.lineups l
      join c on c.id = l.contest_id
     where exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select count(*) as entrants,
           round((percentile_cont(0.5) within group
                   (order by e.pts::double precision))::numeric, 2) as median
      from entries e
  ),
  ranked as (
    select e.id, e.user_id, e.pts,
           rank() over (order by e.pts desc) as rnk
      from entries e
  ),
  -- Same finality test the rest of the codebase uses: `status_state`, the
  -- three-value field, never `status`, which is a human string. A week with no
  -- fixtures produces no row and resolves to false rather than to null.
  finality as (
    select bool_and(lower(coalesce(g.status_state, '')) in ('final','complete','completed')) as final
      from public.games g, c
     where g.season = c.season and g.season_type = c.season_type and g.week = c.week
  )
  select r.user_id,
         r.id,
         r.pts,
         r.rnk,
         f.entrants,
         case
           when not coalesce((select final from finality), false) then null
           when f.entrants < 2 then null
           when c.win_condition = 'median' then
             case when r.pts > f.median then 'W'
                  when r.pts < f.median then 'L'
                  else 'T' end
           when c.win_condition = 'top_n' then
             -- No more entrants than places is not a contest. See the header.
             case when f.entrants <= c.win_rank then null
                  -- `rank()` ties share a place, so a tie ON the cutoff wins
                  -- for everybody in it and the contest pays more winners than
                  -- it advertised. That is the right way round: the alternative
                  -- is breaking a tie on something arbitrary and telling a
                  -- player they lost a heart to a tiebreak they never saw.
                  when r.rnk <= c.win_rank then 'W'
                  else 'L' end
         end as result
    from ranked r
   cross join field f
   cross join c
   order by r.rnk;
$fn$;

-- Settlement's function, not a screen's. The client reads its own result
-- through `median_record` and `my_run`; handing every authenticated user a
-- per-user score dump for an arbitrary contest is a wider door than anything
-- here needs.
revoke execute on function public.contest_results(uuid) from public, anon, authenticated;

comment on function public.contest_results(uuid) is
  'Every entrant''s result for one contest, under that contest''s own win condition. Null result means no result — not a loss. Pure read of lineup totals, so it is safe to call repeatedly.';
