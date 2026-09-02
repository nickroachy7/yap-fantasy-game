-- A lobby worth opening: eight rows, four shapes of contest, three sizes of
-- roster, and a table that makes the ninth one a row rather than a migration.
--
-- ---------------------------------------------------------------------------
-- WHAT THE LOBBY WAS
-- ---------------------------------------------------------------------------
--
--   Week N        8 cards   free    beat the median      risk 1 heart
--   Flex Three    3 cards   40      beat the median      risk 1 heart
--   WR Room       3 cards   40      top 3                risk 1, win 1
--
-- Two paid rows at the same price, one field-relative rule between them, and a
-- roster of thirty cards asked to find six. Twenty-two cards had nowhere to go,
-- which is the hoard `20260825010000` built contests to argue with — and the
-- argument was being made by two rows.
--
-- It is also, read as a menu, almost the same row twice. Both cost 40, both
-- risk a heart, both are three cards. The only choice on offer was whether you
-- would rather beat half the field or three of it.
--
-- ---------------------------------------------------------------------------
-- AND EVERY LOBBY ROW WAS BENCH-SIZED
-- ---------------------------------------------------------------------------
--
-- Three cards, against a free contest that fields eight. So the contest a
-- player actually cares about was the one they could not pay to enter, and
-- everything they could choose was a fragment. A lobby of nothing but small
-- contests reads as a side activity next to the real one, whatever the prizes
-- on it.
--
-- The slate below is a LADDER of sizes — five rows at three cards, two at six,
-- one at seven — so that "how much of my roster am I putting in" is a decision
-- the lobby offers rather than a constant it imposes.
--
-- ---------------------------------------------------------------------------
-- WHY THE BIG ROWS HAVE NO KICKER, WHICH IS THE WHOLE TRICK
-- ---------------------------------------------------------------------------
--
-- `20260825010000` refused eight-slot lobby formats and it was right to, for a
-- reason that is worth restating with the numbers behind it. One card plays one
-- contest a week, so a second full-roster contest wants a SECOND of every
-- scarce position. Measured against the live pool and the live rosters:
--
--   position   cards in the 2026 pool      held per player (7 accounts)
--   WR                            402      3 – 12
--   TE                            209      1 – 7
--   RB                            203      2 – 9
--   QB                            121      1 – 7      (median 5)
--   PK                             41      1 – 3      (median 2, three hold 1)
--
-- KICKER IS THE BOTTLENECK AND NOTHING ELSE IS CLOSE. It is 4% of the pool, and
-- three of seven accounts hold exactly one — the one already committed to the
-- free contest. A second contest with a K slot in it is a contest half the beta
-- cannot enter, and they would not be told why: the slot would simply have
-- nothing eligible to put in it.
--
-- So the marquee row is the free contest MINUS THE KICKER — `roster7`, at
-- QB / RB / RB / WR / WR / TE / FLEX. It is the real weekly shape, it asks for a
-- second quarterback (a genuine decision at a median of five held), and it asks
-- for nothing anybody has to go shopping for. The kicker stays exactly where it
-- is: in the free contest, once, where everyone has one.
--
-- The two six-card rows go further and gate on nothing at all — `flex6` is any
-- six of RB, WR or TE, which is the deepest part of every roster measured
-- above. A big contest does not have to be a demanding one.
--
-- ---------------------------------------------------------------------------
-- THE SHAPE OF THE NEW SLATE
-- ---------------------------------------------------------------------------
--
-- Daily fantasy has settled on four kinds of contest and they are distinguished
-- by their PAYOUT, not by their roster:
--
--   the free roll     no fee, a fixed bar, something to win
--   the cash game     a soft line, flat pay — 50/50s and double-ups. You are
--                     playing not to lose.
--   the tournament    a hard line, steep pay. You are playing to be first.
--   the duel          one opponent, the whole pot.
--
-- All four are now expressible: `20260901020000` made the payout curve a column
-- and `20260901030000` made the line a percentage or a number. So the slate is
--
--   The Warm-Up    3 cards    free    beat 30.0            risk 0   win 1 heart
--   Flex Three     3 cards      40    beat the median      risk 1
--   WR Room        3 cards      50    top 3, steep         risk 1   win 1
--   RB Room        3 cards      50    top 3, steep         risk 1   win 1
--   Superflex      3 cards      50    top 33%, linear      risk 1   win 1
--   Double Up      6 cards      90    top 50%, flat        risk 1
--   The Duel       6 cards     110    one on one, all      risk 2   win 2
--   The Main Event 7 cards     120    top 20%, steep       risk 2   win 2
--
-- ---------------------------------------------------------------------------
-- THE FEES SIT IN A BAND, AND BOTH EDGES ARE SOMEBODY ELSE'S RULE
-- ---------------------------------------------------------------------------
--
-- `20260825050000` derived 40 for a three-card contest from two constraints,
-- and they generalise to any size once written per slot:
--
--   FLOOR — a lobby entry is filled from the BENCH, ~6.5 fantasy points a card,
--     and `score_rate()` pays 1.5 a point. So an entry earns about **10 coins a
--     slot** whatever else happens. A fee under that means LOSING still prints
--     coins, and the contest becomes an arbitrage you run with your worst
--     cards. This is the constraint `20260901020000` moved the anti-arbitrage
--     job onto when it raised the pool to 90%, so it now carries all of it.
--
--   CEILING — a Standard Pack is 100 coins for five cards, so a card off the
--     shelf costs **20 coins**. A fee above that per slot makes buying new
--     cards cheaper than playing the ones you own, which inverts the entire
--     point of the lobby.
--
--       10 x slots  <  fee  <  20 x slots
--
--   three cards   30 <  40, 50  <  60
--   six cards     60 <  90, 110 < 120
--   seven cards   70 <  120     < 140
--
-- SUPERFLEX IS THE TIGHTEST ROW and it is worth knowing which one is. Its
-- quarterback outscores a bench flex, so its floor is higher than three slots
-- suggests — a backup QB at ~12 points plus two flex at ~7 is ~39 coins against
-- a 50 coin fee. It has the least headroom of anything here, and it is the row
-- to look at first if entries ever start looking free.
--
-- THE STAKES DO NOT COME FROM THE FEE. They come from the POOL, which is now
-- 90% of everything collected. Five entries in The Main Event is a 540 coin
-- pool paid on a steep curve to a top 20% that rounds to one place — more than
-- a Pro Pack, to one player, out of a 120 coin buy-in. That is the shape the
-- fee band is deliberately narrow to allow: a contest gets BIG by being
-- popular, not by being expensive.
--
-- ---------------------------------------------------------------------------
-- THE ROSTER CANNOT COVER IT, AND THAT IS THE DESIGN
-- ---------------------------------------------------------------------------
--
-- 34 cards across the lobby plus 8 in the free contest is 42, against a roster
-- cap of 30. One card plays one contest a week (`20260825010000`), so the slate
-- is deliberately larger than any roster can enter. Every week is a choice
-- about where your bench is best spent rather than a checklist — which is the
-- only version of "more contests" that fights the hoard instead of housing it.
--
-- A full week for a well-stocked account is about three lobby rows: the free
-- eight, The Main Event's seven, a six, and a three is 24 of 30.
--
-- ---------------------------------------------------------------------------
-- THE WARM-UP IS THE MOST IMPORTANT ROW HERE
-- ---------------------------------------------------------------------------
--
-- Free, three cards, beat 30.0 points, and it heals a heart.
--
-- It is the only row a player with no coins can enter, the only place a heart
-- can be won without first risking one, and — because a target needs no field
-- (`20260901040000`) — the only row that resolves for a single entrant. A new
-- account on a quiet week can still play a contest, clear a bar, and be paid
-- for it. Nothing is minted: the reward is a heart the run already owns a
-- ceiling for, plus the per-point baseline every start earns anyway.
--
-- 30.0 is three skill cards at about ten points each — a median bench, near
-- enough that clearing it is a real question every week.
--
-- It is also the row that keeps the smallest account playing. The account
-- holding eight cards in the survey above cannot field a seven-card contest;
-- this is the one it can always enter.
--
-- ---------------------------------------------------------------------------
-- WHY SUPERFLEX, AND WHY ONLY ONE QB-HUNGRY ROW BESIDES THE MARQUEE
-- ---------------------------------------------------------------------------
--
-- QB, FLEX, SUPERFLEX. It is the format the season-long game moved to because
-- it makes the quarterback a decision instead of a formality, and it does the
-- same thing here for a sharper reason: the free contest already wants your
-- best quarterback, and one card plays one contest.
--
-- With The Main Event also wanting one, a player entering all three is spending
-- three quarterbacks — which the median account (five) can do and the thin one
-- cannot. That is the intended ceiling on how much of the lobby is reachable at
-- once, and QB is the right position to put it on: 121 cards deep, so it is a
-- decision rather than a wall. Every other row is skill positions.
--
-- ---------------------------------------------------------------------------
-- WHY A TEMPLATE TABLE
-- ---------------------------------------------------------------------------
--
-- Every contest that exists was inserted by a migration, with a hardcoded
-- `select distinct season, season_type, week from games where season = 2026`.
-- Two consequences, both bad:
--
--   * A WEEK THAT ARRIVES LATER GETS NOTHING. `ensure_free_contest` creates the
--     free contest lazily, so the free row self-heals and the lobby does not.
--     A week added by a schedule change has one contest on it and no reason
--     given.
--   * TUNING A ROW IS A MIGRATION. Changing the Flex Three fee means an UPDATE
--     against contests that may already have people in them, hand-guarded.
--
-- `contest_templates` is the row's terms held once; `ensure_week_contests`
-- stamps them onto a week. Adding a contest is an INSERT and retiring one is
-- `is_active = false`, which leaves every week already played exactly as it was.
--
-- The template carries the SAME check constraints as `contests` — a template
-- that could not be materialised into a legal contest is a seed that looks
-- configured and is not, which is the failure `20260825130000` built its
-- constraint to prevent.
--
-- ---------------------------------------------------------------------------
-- RE-TERMING EXISTING CONTESTS: ONLY WHERE NO BALL HAS BEEN THROWN
-- ---------------------------------------------------------------------------
--
-- The Flex Three and WR Room rows already exist on every 2026 week at 40 coins
-- under the old terms. The new terms are applied to the weeks THAT HAVE NOT
-- BEEN PLAYED, and to no others.
--
-- Not "no entries", which was the first rule tried and is wrong here. Regular
-- season week 1 already holds a handful of entries filed early by testers, and
-- under an entries test the launch week would be the one week left on the old
-- economics. Not "future weeks" either, which needs a clock and gets it wrong
-- around a slate boundary.
--
-- A KICKOFF is the honest line — `week_has_started`, from `20260901020000` —
-- and it is the same one that migration draws for the same reason: a week being
-- played is a week whose result is already being decided, and re-tuning
-- underneath that is the one thing this migration must not do. A week where no
-- ball has been thrown has decided nothing.
--
-- WHAT THAT DOES TO AN ENTRY ALREADY FILED AT THE OLD FEE. Nothing is charged
-- retroactively and nothing is refunded: `contest_prize_pool` reads what the
-- LEDGER actually collected (`20260826020000`), so an entry filed at 40 into a
-- row now priced at 50 contributes the 40 it paid and the pool stays exactly as
-- honest as it was. The stake cannot move under them either — the two rows that
-- already have entries keep the hearts they had.
--
-- As of this migration that is three entries across two contests in regular
-- season week 1, all of them better off: a bigger pool out of the same fees.

-- ------------------------------------------------------------------ formats

-- THE THREE SIZES. `flex3` and `wr_room` already exist; these are the rest.
--
-- Slot names are scoped to a format — the primary key is (format_code, slot) —
-- so `roster7` reusing QB / RB1 / WR1 / TE / FLEX is not a collision with the
-- `main` format that the free contest runs on. It is deliberately the same
-- vocabulary: it is the same shape of team, one slot shorter.
insert into public.contest_formats (code, name, slot_count, description) values
  ('superflex', 'Superflex',   3, 'A quarterback, a flex, and a second slot that can be either. The format that makes the QB a decision.'),
  ('rb_room',   'RB Room',     3, 'Three running backs.'),
  ('flex6',     'Flex Six',    6, 'Six cards, any of RB, WR or TE. A big contest with no positional gate at all.'),
  ('roster7',   'Full Squad',  7, 'The weekly shape without the kicker: a quarterback, two backs, two receivers, a tight end and a flex.')
on conflict (code) do update
  set name        = excluded.name,
      slot_count  = excluded.slot_count,
      description = excluded.description;

insert into public.contest_format_slots (format_code, slot, eligible_positions, display_order) values
  ('superflex', 'QB',    array['QB'],                 1),
  ('superflex', 'FLEX',  array['RB','WR','TE'],       2),
  ('superflex', 'SFLEX', array['QB','RB','WR','TE'],  3),
  ('rb_room',   'RB1',   array['RB'],                 1),
  ('rb_room',   'RB2',   array['RB'],                 2),
  ('rb_room',   'RB3',   array['RB'],                 3),
  ('flex6',     'FLEX1', array['RB','WR','TE'],       1),
  ('flex6',     'FLEX2', array['RB','WR','TE'],       2),
  ('flex6',     'FLEX3', array['RB','WR','TE'],       3),
  ('flex6',     'FLEX4', array['RB','WR','TE'],       4),
  ('flex6',     'FLEX5', array['RB','WR','TE'],       5),
  ('flex6',     'FLEX6', array['RB','WR','TE'],       6),
  ('roster7',   'QB',    array['QB'],                 1),
  ('roster7',   'RB1',   array['RB'],                 2),
  ('roster7',   'RB2',   array['RB'],                 3),
  ('roster7',   'WR1',   array['WR'],                 4),
  ('roster7',   'WR2',   array['WR'],                 5),
  ('roster7',   'TE',    array['TE'],                 6),
  ('roster7',   'FLEX',  array['RB','WR','TE'],       7)
on conflict (format_code, slot) do update
  set eligible_positions = excluded.eligible_positions,
      display_order      = excluded.display_order;

-- NO KICKER SLOT OUTSIDE THE `main` FORMAT, asserted rather than remembered.
-- This is the constraint the whole slate is shaped around (see the header), and
-- it is one word in an array away from being broken by a future seed that looks
-- perfectly reasonable.
do $$
declare v_bad text;
begin
  select string_agg(format('%s.%s', format_code, slot), ', ') into v_bad
    from public.contest_format_slots
   where format_code <> 'main'
     and 'PK' = any (eligible_positions);
  if v_bad is not null then
    raise exception
      'a lobby format wants a kicker, which three of seven rosters cannot supply: %', v_bad;
  end if;
end $$;

-- `20260825010000`'s assertion, re-run: a format whose seeded slots disagree
-- with its own `slot_count` fails here rather than in a lobby.
do $$
declare v_bad text;
begin
  select string_agg(f.code, ', ') into v_bad
    from public.contest_formats f
    left join public.contest_format_slots s on s.format_code = f.code
   group by f.code, f.slot_count
  having count(s.slot) <> f.slot_count;
  if v_bad is not null then
    raise exception 'format slot_count disagrees with seeded slots: %', v_bad;
  end if;
end $$;

-- ---------------------------------------------------------------- templates

-- `if not exists` for the reason `20260901040000` drops its constraint the same
-- way: `supabase db push` runs without a transaction, so a migration that fails
-- below this line stays half-applied and the re-run has to get past it.
create table if not exists public.contest_templates (
  code            text primary key,
  name            text not null,
  format_code     text not null references public.contest_formats,
  entry_fee_coins integer not null default 0 check (entry_fee_coins >= 0),
  max_entrants    integer check (max_entrants is null or max_entrants > 1),
  win_condition   public.contest_win_condition not null,
  win_rank        integer  check (win_rank is null or win_rank > 0),
  win_pct         smallint check (win_pct is null or win_pct between 1 and 99),
  target_points   numeric(6,2) check (target_points is null or target_points > 0),
  payout_curve    public.contest_payout_curve not null default 'flat',
  hearts_at_risk  smallint not null default 0 check (hearts_at_risk >= 0),
  hearts_on_win   smallint not null default 0 check (hearts_on_win  >= 0),
  prize_pool_bps  smallint not null default 0 check (prize_pool_bps between 0 and 10000),
  -- One sentence for the contest sheet, in the row's own voice.
  blurb           text,
  sort_order      smallint not null,
  is_active       boolean not null default true,

  -- The same three rules `contests` enforces, so a template cannot describe a
  -- contest that would be refused at insert.
  constraint contest_templates_win_parameter_matches_condition check (
    case win_condition
      when 'top_n'   then win_rank is not null and win_pct is null     and target_points is null
      when 'top_pct' then win_pct  is not null and win_rank is null    and target_points is null
      when 'target'  then target_points is not null and win_rank is null and win_pct is null
      else                win_rank is null and win_pct is null and target_points is null
    end
  ),
  constraint contest_templates_paid_contests_pay_out
    check (entry_fee_coins = 0 or prize_pool_bps > 0),
  -- A free row has no fees to redistribute, so a pool on it could only be
  -- minted — the one thing `20260825050000` forbids outright.
  constraint contest_templates_free_pays_no_prize
    check (entry_fee_coins > 0 or prize_pool_bps = 0)
);

alter table public.contest_templates enable row level security;

-- Readable so the lobby can explain a row the player has not entered yet.
drop policy if exists "contest templates are readable" on public.contest_templates;
create policy "contest templates are readable"
  on public.contest_templates for select to authenticated using (true);

comment on table public.contest_templates is
  'The lobby''s catalogue: one row per contest the game offers every week. ensure_week_contests() stamps these onto a slate. Adding a contest is an insert; retiring one is is_active = false, which leaves every week already played untouched.';

-- ------------------------------------------------------------- the catalogue

-- Ordered small to large, cheap to dear, which is the order `contest_lobby`
-- draws them in. `sort_order` is spaced by ten so a row can be slid between two
-- others without renumbering the rest.
insert into public.contest_templates
  (code, name, format_code, entry_fee_coins, max_entrants,
   win_condition, win_rank, win_pct, target_points, payout_curve,
   hearts_at_risk, hearts_on_win, prize_pool_bps, sort_order, blurb)
values
  ('warmup', 'The Warm-Up', 'flex3', 0, null,
   'target', null, null, 30.00, 'flat',
   0, 1, 0, 10,
   'Three cards, thirty points, no entry fee. Clear the bar and the run gets a heart back — the only place in the game one is free, and the only contest that settles even if you are the only entry.'),

  ('flex3', 'Flex Three', 'flex3', 40, null,
   'median', null, null, null, 'flat',
   1, 0, 9000, 20,
   'Even money on three bench cards. Beat the middle of the field and split the pool with everyone else who did.'),

  ('wr_room', 'WR Room', 'wr_room', 50, null,
   'top_n', 3, null, null, 'steep',
   1, 1, 9000, 30,
   'Three receivers, three places, and most of the field goes home. First place takes the biggest share of the pool.'),

  ('rb_room', 'RB Room', 'rb_room', 50, null,
   'top_n', 3, null, null, 'steep',
   1, 1, 9000, 40,
   'The same hard room, one position over. Three backs, three places paid steeply.'),

  ('superflex', 'Superflex', 'superflex', 50, null,
   'top_pct', null, 33, null, 'linear',
   1, 1, 9000, 50,
   'A quarterback, a flex, and one slot that can be either. Your best QB is already in the free contest, so this one costs you a decision as well as coins.'),

  ('double_up', 'Double Up', 'flex6', 90, null,
   'top_pct', null, 50, null, 'flat',
   1, 0, 9000, 60,
   'Six cards, any of RB, WR or TE, and the top half wins. Every winner takes the same — squeaking in pays exactly what running away with it pays.'),

  ('duel', 'The Duel', 'flex6', 110, 2,
   'top_n', 1, null, null, 'winner_take_all',
   2, 2, 9000, 70,
   'Two managers, six cards each, and the whole pool to whoever scores more. Two hearts on the table both ways. Only two seats.'),

  ('main_event', 'The Main Event', 'roster7', 120, null,
   'top_pct', null, 20, null, 'steep',
   2, 2, 9000, 80,
   'The week''s tournament, at the size of a real team: a quarterback, two backs, two receivers, a tight end and a flex. The top fifth are paid on a steep curve, and first place takes most of it.')
on conflict (code) do update
  set name            = excluded.name,
      format_code     = excluded.format_code,
      entry_fee_coins = excluded.entry_fee_coins,
      max_entrants    = excluded.max_entrants,
      win_condition   = excluded.win_condition,
      win_rank        = excluded.win_rank,
      win_pct         = excluded.win_pct,
      target_points   = excluded.target_points,
      payout_curve    = excluded.payout_curve,
      hearts_at_risk  = excluded.hearts_at_risk,
      hearts_on_win   = excluded.hearts_on_win,
      prize_pool_bps  = excluded.prize_pool_bps,
      blurb           = excluded.blurb,
      sort_order      = excluded.sort_order,
      is_active       = excluded.is_active;

-- EVERY PAID ROW SITS INSIDE THE FEE BAND, checked rather than trusted. Both
-- edges are derived in the header: below 10 a slot, losing still prints coins;
-- above 20 a slot, buying cards off the shelf beats playing the ones you own.
-- A future row tuned outside the band fails here, at push time, with the
-- arithmetic in the message.
do $$
declare r record;
begin
  for r in
    select t.code, t.entry_fee_coins as fee, f.slot_count as slots
      from public.contest_templates t
      join public.contest_formats f on f.code = t.format_code
     where t.is_active and t.entry_fee_coins > 0
  loop
    if r.fee <= r.slots * 10 then
      raise exception
        '% charges % for % slots, at or under the %-coin floor: losing would still earn coins',
        r.code, r.fee, r.slots, r.slots * 10;
    end if;
    if r.fee >= r.slots * 20 then
      raise exception
        '% charges % for % slots, at or over the %-coin ceiling: a Standard Pack is cheaper per card',
        r.code, r.fee, r.slots, r.slots * 20;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------ materialising

-- Every contest a week should have, created if it is missing.
--
-- Idempotent and safe to call repeatedly, like `ensure_free_contest` — which it
-- calls first, so one function is now the whole answer to "does this week have
-- its contests". `on conflict (code) do nothing` means an existing contest is
-- never re-termed here: changing a live row's deal is a decision, and it is
-- made explicitly at the bottom of this migration rather than silently on every
-- sweep.
create or replace function public.ensure_week_contests(
  p_season      integer,
  p_season_type smallint,
  p_week        integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_made integer;
begin
  perform public.ensure_free_contest(p_season, p_season_type, p_week);

  with made as (
    insert into public.contests
      (code, kind, format_code, season, season_type, week, name,
       entry_fee_coins, max_entrants, win_condition, win_rank, win_pct,
       target_points, payout_curve, hearts_at_risk, hearts_on_win, prize_pool_bps)
    select format('%s:%s:%s:%s', t.code, p_season, p_season_type, p_week),
           'lobby', t.format_code, p_season, p_season_type, p_week, t.name,
           t.entry_fee_coins, t.max_entrants, t.win_condition, t.win_rank, t.win_pct,
           t.target_points, t.payout_curve, t.hearts_at_risk, t.hearts_on_win,
           t.prize_pool_bps
      from public.contest_templates t
     where t.is_active
    on conflict (code) do nothing
    returning 1
  )
  select count(*)::integer into v_made from made;

  return v_made;
end;
$$;

revoke execute on function public.ensure_week_contests(integer, smallint, integer)
  from public, anon, authenticated;

comment on function public.ensure_week_contests(integer, smallint, integer) is
  'Creates the free contest and every active template''s contest for one week. Idempotent; never re-terms a contest that already exists.';

-- Every week the game holds fixtures for. The season is already synced, so this
-- one call populates the whole of 2026; a week added later needs this run
-- again — see the cron block in supabase/cron_setup.sql.
create or replace function public.ensure_all_contests()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record; v_made integer := 0;
begin
  for r in
    -- WEEKS THAT HAVE NOT STARTED, and no others. The `games` table holds 2024,
    -- 2025 and a 2025 postseason as well as this year, and an unscoped sweep
    -- built 452 contests across four seasons — none of them reachable (the
    -- lobby joins `lineup_slate()`) and all of them noise in every count of
    -- what the game offers. A lobby row on a week that has already kicked off
    -- cannot be entered in time to matter either.
    select distinct g.season, g.season_type, g.week
      from public.games g
     where g.week is not null
       and not public.week_has_started(g.season, g.season_type::smallint, g.week)
  loop
    v_made := v_made + public.ensure_week_contests(r.season, r.season_type::smallint, r.week);
  end loop;
  return v_made;
end;
$$;

revoke execute on function public.ensure_all_contests() from public, anon, authenticated;

comment on function public.ensure_all_contests() is
  'ensure_week_contests over every week the game holds fixtures for. Idempotent. Run after a schedule sync so a newly-slated week gets its lobby.';

-- ------------------------------------------------------- re-terming the old

-- The pre-existing Flex Three and WR Room rows, brought onto the new terms —
-- but ONLY where nobody has entered. See the header: a contest with a lineup in
-- it has somebody who paid a fee under the old deal.
update public.contests c
   set name            = t.name,
       format_code     = t.format_code,
       entry_fee_coins = t.entry_fee_coins,
       max_entrants    = t.max_entrants,
       win_condition   = t.win_condition,
       win_rank        = t.win_rank,
       win_pct         = t.win_pct,
       target_points   = t.target_points,
       payout_curve    = t.payout_curve,
       hearts_at_risk  = t.hearts_at_risk,
       hearts_on_win   = t.hearts_on_win,
       prize_pool_bps  = t.prize_pool_bps
  from public.contest_templates t
 where c.kind = 'lobby'
   and c.code like t.code || ':%'
   and t.is_active
   and not public.week_has_started(c.season, c.season_type, c.week);

-- And the rest of the catalogue onto every week that has fixtures.
select public.ensure_all_contests();

-- ------------------------------------------------------------ the seat cap
--
-- The Duel sets `max_entrants = 2`, the first contest ever to set one. Nothing
-- new is needed to hold it: `set_lineup` already counts entrants against the
-- cap INSIDE the wallet lock it takes to charge the fee, which is a stronger
-- guarantee than a trigger of its own could give — two players racing for the
-- last seat are already serialised by the lock that stops the contest being
-- oversold, and the refusal is ordered after affordability so the commoner
-- error wins.
--
-- So this migration adds no enforcement. It is worth writing down that the
-- check was looked for and found rather than assumed, because a cap the lobby
-- draws and the database ignores would settle a head-to-head as a five-way.
