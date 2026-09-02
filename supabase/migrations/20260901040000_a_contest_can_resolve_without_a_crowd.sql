-- Teaching settlement, the lobby and the card what `target` and `top_pct` mean.
--
-- ---------------------------------------------------------------------------
-- THE BUG THIS IS REALLY ABOUT
-- ---------------------------------------------------------------------------
--
-- `contest_results` has three ways of returning NULL — no result, not a loss:
--
--     the week is not final           correct, and temporary
--     entrants < 2                    a field of one has no middle
--     top_n and entrants <= win_rank  no more entrants than places
--
-- The first is right. The other two are right as ARITHMETIC and wrong as a
-- product, because of how often they fire. The WR Room pays three. There are
-- four testers. Every week that three or fewer of them enter — which is most
-- weeks — the row settles as nothing at all: no prize, no heart moved, no W,
-- no L, and nothing on screen saying why. A player who filed a lineup, watched
-- it all Sunday and finished first gets a blank card on Tuesday.
--
-- That is not a beta-only problem, it is just loudest in a beta. Any new
-- contest starts with a thin field, so a lobby made only of field-relative
-- contests can never launch a row without it being dead on arrival.
--
-- `target` has no floor. One entrant is a contest, because the opponent is a
-- number rather than the people who happened to turn up. `top_pct` has a floor
-- of two and never a hollow one, because the places scale with whoever came.
--
-- ---------------------------------------------------------------------------
-- top_pct ROUNDS DOWN, AND KEEPS AT LEAST ONE PLACE
-- ---------------------------------------------------------------------------
--
--     places = greatest(1, floor(entrants × pct / 100))
--
-- FLOOR, not ceil, so a contest can never pay more than the share it advertised.
-- Top 50% of three is one place, not two; a player reading "top half" and
-- finishing second of three did not make the half, and rounding them in would
-- make the phrase mean something different at every field size — which is the
-- exact fault `top_n` has and this condition exists to fix.
--
-- GREATEST(1, …) so a small field still has a winner instead of paying nobody
-- and quietly keeping the pool.
--
-- And it is still refused where the answer would be "everyone wins": under two
-- entrants, or where the places reach the whole field. A contest nobody can
-- lose is not a contest, and it would hand every entrant 90% of their own fee
-- back, which is a rake dressed as a game.
--
-- ---------------------------------------------------------------------------
-- A TARGET IS AN OPPONENT, SO IT ARRIVES AS ONE
-- ---------------------------------------------------------------------------
--
-- `contest-model.ts` already models the right-hand side of the scoreboard as
-- one thing — "who am I playing" — with the median, the cut and (stubbed) a
-- person all answering it. A target is the easiest answer of the three: it is a
-- number, it is known before kickoff rather than after, and it never moves.
--
-- So `my_contest_cards` returns it in the `cut` column it already has. The card
-- draws you against a number either way and does not learn a fourth shape; only
-- the LABEL differs, which is a string in the client and belongs there.
--
-- That also means the cut is computed for `top_pct` — the lowest score still
-- inside the paying places. `my_contest_cards` computed it for `top_n` alone,
-- so a `top_pct` row would have drawn you against nothing.

-- ----------------------------------------------------------------- columns

alter table public.contests
  add column win_pct       smallint check (win_pct is null or win_pct between 1 and 99),
  -- Numeric because fantasy points are. A target of 30 and a total of 29.9 is a
  -- loss, and an integer column would round the answer into a win.
  add column target_points numeric(6,2) check (target_points is null or target_points > 0);

comment on column public.contests.win_pct is
  'For top_pct: the share of the field that wins, as a whole percent. Places are floor(entrants x pct / 100), at least one. Null on every other condition, enforced.';
comment on column public.contests.target_points is
  'For target: the score an entry must reach to win. Everyone who clears it wins and nobody else does, so the contest settles with a single entrant. Null on every other condition, enforced.';

-- Exactly one parameter is set, and it is the one the condition reads. The old
-- constraint said this for two conditions; it says it for four now, and a seed
-- that looks configured and is not still cannot be inserted.
-- `if exists` because `supabase db push` runs without a transaction: a
-- migration that fails after this line stays half-applied, and the re-run has
-- to get past it. The same reason every ensure_* function in this schema is
-- idempotent.
alter table public.contests drop constraint if exists contests_win_rank_matches_condition;

alter table public.contests add constraint contests_win_parameter_matches_condition
  check (
    case win_condition
      when 'top_n'   then win_rank is not null and win_pct is null     and target_points is null
      when 'top_pct' then win_pct  is not null and win_rank is null    and target_points is null
      when 'target'  then target_points is not null and win_rank is null and win_pct is null
      else                win_rank is null and win_pct is null and target_points is null
    end
  );

-- ----------------------------------------------------------------- results

-- Every entrant's result, under whichever of the four rules this contest uses.
--
-- The order of the branches is the point. `target` is answered BEFORE the
-- `entrants < 2` gate, because that gate is a fact about fields and a target
-- does not have one. Everything below the gate is field-relative and keeps it.
create or replace function public.contest_results(p_contest uuid)
returns table (
  user_id   uuid,
  lineup_id uuid,
  points    numeric,
  rnk       bigint,
  entrants  bigint,
  -- 'W' | 'L' | 'T' | null. Null is NO RESULT, never a loss.
  result    text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with c as (
    select id, season, season_type, week,
           win_condition, win_rank, win_pct, target_points
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
  -- How many places pay, where that is a function of the field. Floor and at
  -- least one — see the header.
  places as (
    select greatest(1, floor(f.entrants * c.win_pct / 100.0))::bigint as cut
      from field f cross join c
     where c.win_condition = 'top_pct'
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

           -- THE OPPONENT IS A NUMBER. No field required, so no field gate.
           when c.win_condition = 'target' then
             case when r.pts >= c.target_points then 'W' else 'L' end

           -- Everything past here is field-relative.
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

           when c.win_condition = 'top_pct' then
             -- A share that reaches the whole field is not a contest either.
             case when (select cut from places) >= f.entrants then null
                  when r.rnk <= (select cut from places) then 'W'
                  else 'L' end
         end as result
    from ranked r
   cross join field f
   cross join c
   order by r.rnk;
$fn$;

-- Settlement's function, not a screen's. The client reads its own result
-- through `my_contest_cards` and `my_run`; handing every authenticated user a
-- per-user score dump for an arbitrary contest is a wider door than anything
-- here needs. Restated after the replace because `20260830020000` exists
-- precisely because a redefinition regained anon execute once already.
revoke execute on function public.contest_results(uuid) from public, anon, authenticated;

comment on function public.contest_results(uuid) is
  'Every entrant''s result for one contest, under that contest''s own win condition. A target contest resolves with a single entrant; the field-relative conditions still need two. Null result means no result — not a loss.';

-- ------------------------------------------------------------------- lobby

-- The lobby grows three columns — the curve from `20260901020000` and the two
-- new win parameters — so a row can state its whole offer.
--
-- DROP AND CREATE, because `create or replace` cannot change a function's
-- return type. Which means the ACL has to be put back by hand: Postgres grants
-- EXECUTE to PUBLIC on create and this project's default privileges also grant
-- `anon`, so a bare create SILENTLY WIDENS a function that was locked to
-- authenticated. `20260830020000` is the migration that had to clean that up
-- last time.
drop function if exists public.contest_lobby();

create function public.contest_lobby()
returns table(
  id uuid, code text, kind public.contest_kind, name text,
  format_code text, format_name text, slot_count smallint,
  entry_fee_coins integer, max_entrants integer, entrants integer,
  season integer, season_type smallint, week integer,
  my_lineup_id uuid, my_filled integer, affordable boolean,
  win_condition public.contest_win_condition, win_rank integer,
  hearts_at_risk smallint, hearts_on_win smallint, my_hearts smallint,
  prize_pool_bps smallint, prize_pool integer, recap boolean,
  payout_curve public.contest_payout_curve,
  win_pct smallint, target_points numeric, score_rate numeric
)
language sql
stable security definer
set search_path = public, pg_temp
as $fn$
  with slate as (select * from public.lineup_slate() limit 1),
  past as (select * from public.recap_slate() limit 1),
  wallet as (
    select coalesce((select balance from public.coin_balances where user_id = auth.uid()), 0) as balance
  ),
  run as (
    select hearts from public.runs where user_id = auth.uid() and ended_at is null
  ),
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
         c.entry_fee_coins, c.max_entrants,
         public.contest_entrants(c.id),
         c.season, c.season_type, c.week,
         l.id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = l.id), 0),
         (l.id is not null or (select balance from wallet) >= c.entry_fee_coins),
         c.win_condition, c.win_rank,
         c.hearts_at_risk, c.hearts_on_win,
         (select hearts from run),
         c.prize_pool_bps,
         public.contest_prize_pool(c.id),
         c.recap,
         c.payout_curve,
         c.win_pct, c.target_points,
         -- The baseline, carried on every row so the reward column never has to
         -- hardcode it. Same number on every contest, which is the entire point
         -- — see `20260901010000`.
         public.score_rate()
    from rows c
    join public.contest_formats f on f.code = c.format_code
    left join public.lineups l
           on l.contest_id = c.id and l.user_id = auth.uid()
   -- Free first, then cheapest, then by name. The fee is the ladder a player
   -- reads the lobby down, so it leads once the free rows are past.
   order by c.recap, c.kind, c.entry_fee_coins, c.name;
$fn$;

revoke execute on function public.contest_lobby() from public, anon;
grant  execute on function public.contest_lobby() to authenticated;

-- --------------------------------------------------------------- my cards

-- The card over your lineup, with an opponent for every condition.
--
-- `cut` is the one column doing new work. It was the lowest score still inside
-- the paying places under `top_n` and null everywhere else; it is now that
-- under `top_pct` too, and the TARGET itself on a target contest — which is
-- what lets the scoreboard draw you against a number without learning a fourth
-- shape. See the header.
drop function if exists public.my_contest_cards(text);

create function public.my_contest_cards(p_include text default null)
returns table(
  contest_id uuid, code text, kind public.contest_kind, name text,
  format_code text, format_name text, slot_count smallint, entry_fee_coins integer,
  season integer, season_type smallint, week integer,
  lineup_id uuid, filled integer, entrants bigint,
  low numeric, median numeric, average numeric, high numeric, final boolean,
  my_points numeric, my_rank bigint, ahead bigint, result text,
  hearts_at_risk smallint, hearts_on_win smallint,
  win_condition public.contest_win_condition, win_rank integer,
  cut numeric, prize_pool integer, my_prize integer, my_coins integer, recap boolean,
  payout_curve public.contest_payout_curve,
  win_pct smallint, target_points numeric, score_rate numeric
)
language sql
stable security definer
set search_path = public, pg_temp
as $fn$
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
  entries as (
    select l.contest_id, l.user_id, l.total_points as pts
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
         m.payout_curve, m.win_pct, m.target_points, public.score_rate()
    from mine m
    join public.contest_formats f on f.code = m.format_code
    left join field fl on fl.contest_id = m.id
    left join ranked r on r.contest_id = m.id and r.user_id = auth.uid()
    left join cutline cl on cl.contest_id = m.id
    left join sololine sl on sl.contest_id = m.id
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
   order by m.recap, m.kind, m.entry_fee_coins, m.name;
$fn$;

revoke execute on function public.my_contest_cards(text) from public, anon;
grant  execute on function public.my_contest_cards(text) to authenticated;
