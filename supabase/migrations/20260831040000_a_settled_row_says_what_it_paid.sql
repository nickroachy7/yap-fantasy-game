-- A settled entry says what it PAID, card by card and in total.
--
-- ---------------------------------------------------------------------------
-- THE WEEK'S EARNINGS EXIST AND ARE DRAWN NOWHERE A CONTEST CAN SEE THEM
-- ---------------------------------------------------------------------------
--
-- `award_score_gems` has priced every slot in every lineup since the faucet
-- rework: `lineup_slots.gems_awarded` is what THAT CARD earned for its week,
-- at 1.5 a point times the tier multiplier it held going in, and
-- `lineup_slots.bonus_gems` is the position-finish bonus on top of it. Both
-- are stamped onto the slot rather than derived at read time, precisely so
-- that the wallet and any screen reporting it cannot disagree.
--
-- `week_recap` reads them. Nothing else does. So the recap screen can tell you
-- a card earned 42 gems, and the CONTEST that card played in — the screen a
-- player actually opens on a Tuesday, with the lineup and the result on it —
-- reported the same card's 9.8 points and stopped.
--
-- That is the same gap 20260831020000 closed for career FP one commit ago, and
-- it is the more important half of it. Career FP is what the card became; gems
-- are what the player got. A settled lineup row that reports the first and not
-- the second is a receipt with the total torn off.
--
--   gems         what this card was paid for its points        -> the earning
--   bonus_gems   the position-finish bonus, where it placed    -> the extra
--   awarded      the payout has RUN                            -> is this real
--
-- `awarded` IS NOT `gems > 0`, and the distinction is the one `week_recap`
-- already draws: a week that has been scored but not yet paid has null in both
-- money columns, and a card that scored nothing has a real, earned zero. Drawn
-- the same way, "not paid yet" reads as "earned nothing" — which is a lie told
-- about the state a settled week spends its first minutes in.
--
-- ---------------------------------------------------------------------------
-- IT IS DISCLOSED ON EVERYONE'S LINEUP, AND THAT IS THE DELIBERATE PART
-- ---------------------------------------------------------------------------
--
-- `contest_lineup` is `security definer` over other people's entries, so its
-- column list is its access control and every addition is a disclosure. These
-- three are safe for the reason the tier was: THEY ARE ALREADY DERIVABLE FROM
-- WHAT THE FUNCTION RETURNS. `gems_awarded` is `floor(points * 1.5 * mult)`
-- and the multiplier comes from the tier this same row already prints — a
-- reader with a calculator has had this number since 20260831020000.
--
-- And it is a fact about the CARD's week, not about its owner. What stays out
-- is unchanged and is the line that matters: nothing about the person — what
-- they hold, what they paid, what their balance is, what else they entered.
--
-- ---------------------------------------------------------------------------
-- AND ONE TOTAL, ON YOUR OWN CARD
-- ---------------------------------------------------------------------------
--
-- `my_contest_cards` gains `my_gems`: the sum of both money columns across the
-- slots of YOUR lineup in that contest. The contest card's third band is the
-- trade — what you risked against what you could win — and on a finished week
-- that band is written in the wrong tense. `my_prize` was the only past-tense
-- figure it had, and it is null on every free contest, which is the contest
-- every player is in. `my_gems` is what a finished free entry actually paid,
-- and it is the sum of the per-row figures directly underneath it.
--
-- Null, not zero, until the payout has run — same reason as `awarded` above,
-- and `sum()` over no awarded slots is null of its own accord.

-- -------------------------------------------------------------- one lineup

drop function if exists public.contest_lineup(uuid, uuid);

create function public.contest_lineup(p_contest uuid, p_user uuid)
returns table (
  slot            text,
  player_id       uuid,
  player_name     text,
  pos             text,
  team            text,
  tier            public.card_tier,
  points          numeric,
  started         boolean,
  career_fp       numeric,
  tier_floor_fp   numeric,
  next_tier_at    numeric,
  next_tier_label public.card_tier,
  gems            integer,
  bonus_gems      integer,
  awarded         boolean
)
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  v_exists boolean;
begin
  select true into v_exists
    from public.lineups l
   where l.contest_id = p_contest
     and l.user_id = p_user
   limit 1;

  if v_exists is null then
    raise exception 'that player is not in this contest' using errcode = '22023';
  end if;

  return query
    select ls.slot,
           p.id,
           p.full_name,
           -- THE ABBREVIATION, not `position`. The old peek drew `p.position`
           -- and rendered "Wide Receiver" into a row sized for "WR"; the
           -- lineup page this now feeds is the same shape as the owner's own
           -- board, where the code is what the eye reads.
           coalesce(p.position_abbreviation, p.position),
           t.abbreviation,
           ci.tier,
           ls.points,
           coalesce(public.game_has_started(g.status_state, g.starts_at), false),
           ci.career_fp,
           cur.min_career_fp,
           nxt.min_career_fp,
           nxt.tier,
           ls.gems_awarded,
           ls.bonus_gems,
           -- The SCORE award is what decides this, not the bonus. Bonuses are
           -- paid to a handful of slots a week (`award_position_bonuses` pays
           -- the top finishers at each position and nobody else), so keying
           -- off `bonus_gems` would report every ordinary card in a fully paid
           -- week as still waiting.
           ls.gems_awarded is not null
      from public.lineups l
      join public.contests  ct on ct.id = l.contest_id
      join public.lineup_slots  ls on ls.lineup_id = l.id
      join public.card_instances ci on ci.id = ls.card_instance_id
      join public.cards   cd on cd.id = ci.card_id
      join public.players p  on p.id  = cd.player_id
      left join public.teams t on t.id = p.team_id
      -- The ladder, exactly as `card_profile` reads it: the tier the card is
      -- standing on, and the one above it if there is one. `nxt` is a LEFT
      -- join because the top tier has nothing above it and must still return
      -- its row — a diamond card that vanished from a settled lineup would be
      -- the worst possible way to learn this join was inner.
      join public.tier_thresholds cur on cur.tier = ci.tier
      left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1
      left join public.contest_format_slots fs
             on fs.format_code = ct.format_code and fs.slot = ls.slot
      left join public.games g
             on g.season = l.season and g.season_type = l.season_type and g.week = l.week
            and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
     where l.contest_id = p_contest
       and l.user_id = p_user
     order by fs.display_order nulls last, ls.slot;
end;
$$;

-- Re-granted rather than inherited: a `drop`/`create` takes the old grants with
-- it, and 20260830020000 exists because this function was once reachable by
-- `anon`. Authenticated only, and nothing else, every time it is rewritten.
--
-- AND THE REVOKE, WHICH 20260831020000 LEFT OFF AND WHICH IS THE HALF THAT
-- MATTERS. A `grant` alone does not undo the default: Postgres gives EXECUTE on
-- a newly created function to PUBLIC, so a drop/create that only re-grants to
-- `authenticated` hands it straight back to everybody. Checked on the live
-- database before writing this — `contest_lineup` was carrying
--
--   {=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/…}
--
-- where `=X` is PUBLIC. That is precisely the state 20260830020000 was written
-- to end, on a `security definer` function that reads other people's lineups,
-- reintroduced one commit later by a rewrite that remembered the grant and not
-- the revoke. `my_contest_cards` and `contest_field` were both clean; only this
-- one had been rewritten since.
--
-- Both lines, together, every time this function is redefined. The grant on its
-- own has now been the wrong thing twice.
grant  execute on function public.contest_lineup(uuid, uuid) to authenticated;
revoke execute on function public.contest_lineup(uuid, uuid) from public, anon;
-- ------------------------------------------------------------- my cards

-- The cards on the board: the free contest always, everything you have entered,
-- the one you are composing, and last week's results until there is new
-- football.
--
-- Unchanged but for `my_gems` — see the header.
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
  prize_pool integer, my_prize integer, my_gems integer,
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
         -- WHAT THE CARDS THEMSELVES EARNED, which is a different payment from
         -- the prize above it and the only one a free contest ever makes.
         -- Null until `award_score_gems` has run: `sum()` over slots that are
         -- all null is null, which is exactly the reading wanted.
         (select sum(coalesce(ls.gems_awarded, 0) + coalesce(ls.bonus_gems, 0))::integer
            from public.lineup_slots ls
           where ls.lineup_id = m.lineup_id
             and ls.gems_awarded is not null),
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
