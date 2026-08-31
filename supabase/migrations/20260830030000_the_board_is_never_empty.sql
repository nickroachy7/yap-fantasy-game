-- The Compete board had nothing on it at all, and that is two bugs.
--
-- ---------------------------------------------------------------------------
-- WHAT IT LOOKED LIKE
-- ---------------------------------------------------------------------------
--
-- 2026-08-30. Preseason week 4's last kickoff was 22:00 the previous evening,
-- `slate_in_play`'s twelve-hour tail expired at 10:00, and `lineup_slate()`
-- rolled forward to regular-season week 1 — whose first game is ELEVEN DAYS
-- away. The board went to: "Starting lineup 0/8 FILLED", eight empty slots, no
-- card above them, no run rail, no lobby tile. Nothing naming the week, nothing
-- saying what had just happened, and — because the carousel is the only route
-- to the lobby — no way to enter anything either.
--
-- ---------------------------------------------------------------------------
-- BUG ONE: THE FREE CONTEST ONLY EXISTED ONCE YOU HAD FILED IN IT
-- ---------------------------------------------------------------------------
--
-- `my_contest_cards` required `l.id is not null` — a LINEUP ROW — and the
-- lineup row is created by the first `set_lineup`. So for the several days
-- between a week rolling over and you getting round to picking, the contest you
-- are in by default and cannot leave had no card.
--
-- That inverted the whole point of the free contest. It is the one nobody chose
-- to be in, the only one with the season riding on it, and the only one that is
-- there before you have done anything — and it was the one that disappeared
-- until you had done something. The lineup row is where the PICKS live; it was
-- never what entry means. So the slate's free contest is now always a card,
-- with `lineup_id` null and `filled` 0, which is the state
-- `MyContest.lineupId` has documented as "being composed" since
-- `20260825080000`.
--
-- ---------------------------------------------------------------------------
-- BUG TWO: A FINISHED WEEK VANISHED THE INSTANT THE SLATE MOVED
-- ---------------------------------------------------------------------------
--
-- Both RPCs join `lineup_slate()`, so at 10:00 that morning four entries, two
-- results, a heart and a payout stopped existing on screen — at exactly the
-- moment somebody would open the app to find out how they did.
--
-- `recap_slate()` is the window, and it is deliberately NOT a duration. "Show
-- it for 24 hours" would have gone blank on day two of an eleven-day gap, which
-- is the case that produced this bug. The honest rule is: YOUR LAST RESULT
-- STAYS UNTIL THERE IS NEW FOOTBALL. In season that is Tuesday through
-- Thursday and self-limiting; between preseason and week 1 it is eleven days,
-- and eleven days of "here is how you finished" beats eleven days of an empty
-- screen.
--
-- It costs nothing to turn off: the moment `current_slate()` and
-- `lineup_slate()` agree — which is from an hour before the next kickoff until
-- that week's tail expires — the window is empty and the recap rows are gone.

-- The week the board has already moved on from.
--
-- `current_slate()` is the most recent week to have kicked off, whether or not
-- it is over; `lineup_slate()` is the week the board is about. They are the
-- same week while one is being played, and they diverge in the gap between
-- weeks. That divergence IS the recap window — no interval, no constant, and
-- nothing to tune.
create or replace function public.recap_slate()
returns table (season integer, season_type smallint, week integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.season, p.season_type, p.week
    from public.current_slate() p
   where not exists (
     select 1 from public.lineup_slate() s
      where s.season = p.season
        and s.season_type = p.season_type
        and s.week = p.week
   );
$$;

grant execute on function public.recap_slate() to authenticated;
revoke execute on function public.recap_slate() from public, anon;

comment on function public.recap_slate() is
  'The most recently kicked-off week, when the lineup board has already moved past it. Empty while a week is in play — the gap between the two is the recap window.';

-- -------------------------------------------------------------------- lobby

-- The lobby, plus the contests you are still being shown a result for.
--
-- `recap` is what tells them apart, and the LIST FILTERS ON IT — a finished
-- contest must never appear among the ones you can enter. It is carried at all
-- because `contest/[code]` looks a contest up here: without these rows, tapping
-- last week's card would open a page reading "That contest is no longer open".
drop function if exists public.contest_lobby();

create function public.contest_lobby()
returns table(
  id uuid, code text, kind public.contest_kind, name text,
  format_code text, format_name text, slot_count smallint,
  entry_fee_gems integer, max_entrants integer, entrants integer,
  season integer, season_type smallint, week integer,
  my_lineup_id uuid, my_filled integer, affordable boolean,
  win_condition public.contest_win_condition, win_rank integer,
  hearts_at_risk smallint, hearts_on_win smallint,
  my_hearts smallint,
  prize_pool_bps smallint, prize_pool integer,
  recap boolean
)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  with slate as (select * from public.lineup_slate() limit 1),
  past as (select * from public.recap_slate() limit 1),
  wallet as (
    select coalesce((select balance from public.gem_balances where user_id = auth.uid()), 0) as balance
  ),
  run as (
    select hearts from public.runs where user_id = auth.uid() and ended_at is null
  ),
  -- The slate's contests, all of them, and the recap week's — but there only
  -- the ones you actually entered. A contest you never played has no result to
  -- read and would be a dead row in a list that is otherwise all live offers.
  rows as (
    select c.*, false as recap
      from public.contests c
      join slate s
        on s.season = c.season and s.season_type = c.season_type and s.week = c.week
    union all
    select c.*, true
      from public.contests c
      join past p
        on p.season = c.season and p.season_type = c.season_type and p.week = c.week
     where exists (
       select 1 from public.lineups l
        where l.contest_id = c.id and l.user_id = auth.uid()
     )
  )
  select c.id, c.code, c.kind, c.name,
         c.format_code, f.name, f.slot_count,
         c.entry_fee_gems, c.max_entrants,
         public.contest_entrants(c.id),
         c.season, c.season_type, c.week,
         l.id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = l.id), 0),
         (l.id is not null or (select balance from wallet) >= c.entry_fee_gems),
         c.win_condition, c.win_rank,
         c.hearts_at_risk, c.hearts_on_win,
         (select hearts from run),
         c.prize_pool_bps,
         public.contest_prize_pool(c.id),
         c.recap
    from rows c
    join public.contest_formats f on f.code = c.format_code
    left join public.lineups l
           on l.contest_id = c.id and l.user_id = auth.uid()
   -- Free first, then by what it costs you: gems, then hearts. A row that can
   -- end the run should never be the first thing under the thumb. Anything
   -- being recapped sorts last, behind every contest still open.
   order by c.recap, c.kind, c.hearts_at_risk, c.entry_fee_gems, c.name;
$$;

grant execute on function public.contest_lobby() to authenticated;
revoke execute on function public.contest_lobby() from public, anon;

-- --------------------------------------------------------------- my cards

-- The cards on the board: the free contest always, everything you have entered,
-- the one you are composing, and last week's results until there is new
-- football.
drop function if exists public.my_contest_cards(text);

create function public.my_contest_cards(p_include text default null)
returns table(
  contest_id uuid, code text, kind public.contest_kind, name text,
  format_code text, format_name text, slot_count smallint,
  entry_fee_gems integer, season integer, season_type smallint, week integer,
  lineup_id uuid, filled integer,
  entrants bigint, low numeric, median numeric, average numeric, high numeric,
  final boolean, my_points numeric, my_rank bigint, ahead bigint, result text,
  hearts_at_risk smallint, hearts_on_win smallint,
  win_condition public.contest_win_condition, win_rank integer, cut numeric,
  prize_pool integer, my_prize integer,
  recap boolean
)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  with slate as (select * from public.lineup_slate() limit 1),
  past as (select * from public.recap_slate() limit 1),
  mine as (
    -- THE FREE CONTEST IS UNCONDITIONAL. See the header: it is the one you are
    -- in by default, and requiring a lineup row made it the one that was
    -- missing until you had picked. `lineup_id` stays null and the client
    -- draws the composing state it already has for an entry being built.
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
  entries as (
    select l.contest_id, l.user_id, l.total_points as pts
      from public.lineups l
      join mine m on m.id = l.contest_id
     where exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select e.contest_id,
           count(*) as entrants,
           min(e.pts) as low,
           round((percentile_cont(0.5) within group (order by e.pts::double precision))::numeric, 2) as median,
           round(avg(e.pts), 2) as average,
           max(e.pts) as high
      from entries e
     group by e.contest_id
  ),
  ranked as (
    select e.contest_id, e.user_id, e.pts,
           rank() over (partition by e.contest_id order by e.pts desc) as rnk
      from entries e
  ),
  -- The lowest score still inside the paying places. `min` rather than a
  -- window pick because `rank()` shares places on ties, so the Nth place may
  -- be occupied by two lineups or by none.
  cutline as (
    select r.contest_id, min(r.pts) as cut
      from ranked r
      join mine m on m.id = r.contest_id
     where m.win_condition = 'top_n' and r.rnk <= m.win_rank
     group by r.contest_id
  )
  select m.id, m.code, m.kind, m.name,
         m.format_code, f.name, f.slot_count, m.entry_fee_gems,
         m.season, m.season_type, m.week,
         m.lineup_id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = m.lineup_id), 0),
         coalesce(fl.entrants, 0), fl.low, fl.median, fl.average, fl.high,
         -- FINALITY IS PER CONTEST, not per slate, and that is not a tidy-up:
         -- a recap row belongs to a week the slate has left, so asking the
         -- slate would have reported last week's finished contest as unplayed
         -- and the card would have drawn a countdown over a settled result.
         coalesce(fin.final, false),
         m.my_points,
         r.rnk,
         case when r.pts is null then null
              else (select count(*) from entries x where x.contest_id = m.id and x.pts < r.pts) end,
         -- ONE ANSWER TO "DID I WIN", and it is settlement's.
         cr.result,
         m.hearts_at_risk, m.hearts_on_win,
         m.win_condition, m.win_rank, cl.cut,
         public.contest_prize_pool(m.id),
         -- Null until the week is final and the places are decided. A running
         -- "you would win 60" is a projection, and this codebase does not sell
         -- projections it cannot stand behind.
         cp.gems,
         m.recap
    from mine m
    join public.contest_formats f on f.code = m.format_code
    left join field   fl on fl.contest_id = m.id
    left join ranked  r  on r.contest_id = m.id and r.user_id = auth.uid()
    left join cutline cl on cl.contest_id = m.id
    left join lateral (
      select bool_and(lower(coalesce(g.status_state, '')) in ('final','complete','completed')) as final
        from public.games g
       where g.season = m.season and g.season_type = m.season_type and g.week = m.week
    ) fin on true
    left join lateral (
      select res.result from public.contest_results(m.id) res
       where res.user_id = auth.uid()
    ) cr on true
    left join lateral (
      select pay.gems from public.contest_payouts(m.id) pay
       where pay.user_id = auth.uid()
    ) cp on true
   -- This week before last week, and the free contest first inside each. The
   -- carousel opens on page one, so page one has to be the thing you can still
   -- act on.
   order by m.recap, m.kind, m.entry_fee_gems, m.name;
$$;

grant execute on function public.my_contest_cards(text) to authenticated;
revoke execute on function public.my_contest_cards(text) from public, anon;
