-- Yap Fantasy — runs suite (20260825110000 .. 20260903230000)
--
-- A RUN IS A SEASON RECORD. It was the roguelike layer — hearts on a contest, a
-- death at nought, a wipe that took the collection and the wallet, and a carry
-- that handed a few cards back. `20260903230000` removed all of that. What is
-- left is the half every other surface was already reading: a row per player,
-- a W or an L per settled contest in `run_contest_results`, and the counters on
-- `runs`.
--
-- SO THIS SUITE HAS TWO JOBS NOW, and the second is the reason it did not
-- shrink to nothing:
--
--   THE RECORD IS WRITTEN CORRECTLY. Every entry joins a run, a week settles in
--   one pass, settlement is exactly-once, and a contest with no result never
--   reaches the ledger. These are the old assertions with the hearts taken out
--   of them — the arithmetic they guard is the same arithmetic.
--
--   THE MECHANIC IS ACTUALLY OFF. A removal that leaves the machinery in place
--   is only as good as the thing stopping it from running, so section 5 asserts
--   the negatives directly: no heart moves, no run ends, no card is wiped, no
--   wallet is emptied, and nothing is advertised as riding. Section 6 asserts
--   the constraint that stops a stake coming back by the back door — which is
--   how a dormant mechanic normally returns: not by being switched on, but by
--   a seed or a template quietly setting a column nobody is watching.
--
-- WHAT WENT WITH THE MECHANIC, so it is a decision and not an omission: the
-- carry-ladder arithmetic, the drive to zero and the clamp on the way down, the
-- wipe stepping around set progress, the restore, and the rack's high-water
-- mark. `run_carry_slots` and `run_carry_ladder` still exist and still answer;
-- nothing reads them, so nothing here asserts them.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/runs.test.sql

begin;

-- Weeks 95-97 are far outside any real slate — same convention as `lineup_abuse`.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000001','authenticated','authenticated','r1@t.local','',now(),now(),now()),
       ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000002','authenticated','authenticated','r2@t.local','',now(),now(),now()),
       ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000003','authenticated','authenticated','r3@t.local','',now(),now(),now()),
       ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000004','authenticated','authenticated','r4@t.local','',now(),now(),now()),
       ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000005','authenticated','authenticated','r5@t.local','',now(),now(),now());

-- The suite's own pool, rather than the real one. Nine receivers, because A
-- CARD PLAYS ONE CONTEST A WEEK and every one of these has a job: three for the
-- median contest, three more for the top-three contest, one for the free
-- contest, one to be sold in the escrow assertion, and one committed to a set
-- to prove the wipe leaves set progress alone.
insert into public.teams (external_id, abbreviation, full_name)
values (9951, 'TST', 'Test Club') on conflict do nothing;

-- `full_name` is generated, so it is not written here.
insert into public.players (external_id, team_id, first_name, last_name, position, position_abbreviation)
select 99510 + g, t.id, 'Run', 'Tester' || g, 'Wide Receiver', 'WR'
  from generate_series(1,9) g, public.teams t where t.external_id = 9951;

insert into public.cards (player_id, season)
select p.id, 2026 from public.players p where p.external_id between 99511 and 99519;

insert into public.card_instances (user_id, card_id)
select '11111111-0000-0000-0000-000000000001', c.id
  from public.cards c join public.players p on p.id = c.player_id
 where p.external_id between 99511 and 99519;

-- Two cards each for the four rivals. A card plays ONE contest a week, so a
-- rival in both contests needs two — and the same pair is reused across weeks,
-- which the per-week constraint allows and which keeps the pool small.
insert into public.players (external_id, team_id, first_name, last_name, position, position_abbreviation)
select 99520 + g, t.id, 'Rival', 'Card' || g, 'Wide Receiver', 'WR'
  from generate_series(1,8) g, public.teams t where t.external_id = 9951;

insert into public.cards (player_id, season)
select p.id, 2026 from public.players p where p.external_id between 99521 and 99528;

insert into public.card_instances (user_id, card_id)
select u.id, c.id
  from (values ('11111111-0000-0000-0000-000000000002'::uuid, 1),
               ('11111111-0000-0000-0000-000000000003'::uuid, 2),
               ('11111111-0000-0000-0000-000000000004'::uuid, 3),
               ('11111111-0000-0000-0000-000000000005'::uuid, 4)) u(id, n)
  cross join generate_series(1,2) k
  join public.players p on p.external_id = 99520 + (u.n - 1) * 2 + k
  join public.cards   c on c.player_id = p.id;

insert into public.coin_balances (user_id, balance)
values ('11111111-0000-0000-0000-000000000001', 500)
on conflict (user_id) do update set balance = 500;

-- Three weeks of fixtures, all kicking off a week out so nothing is locked yet.
insert into public.games (external_id, season, week, season_type, starts_at, status_state)
values (995001, 2026, 95, 1, now() + interval '7 days', 'scheduled'),
       (996001, 2026, 96, 1, now() + interval '7 days', 'scheduled'),
       (997001, 2026, 97, 1, now() + interval '7 days', 'scheduled');

-- The two shapes of WIN CONDITION, which is all a contest stakes now. `median`
-- is even money; `top_n` loses most of its field. Both are seeded because a
-- 1-1 week is what section 4 needs, and the two conditions are the cheapest way
-- to arrange one.
--
-- BOTH COLUMNS ARE NOUGHT AND CANNOT BE ANYTHING ELSE. Two check constraints
-- hold them there — `hearts_on_win` since 20260902030000, `hearts_at_risk`
-- since the removal — and section 6 asserts the second one directly.
insert into public.contests (code, kind, format_code, season, season_type, week, name,
                             entry_fee_coins, win_condition, win_rank, hearts_at_risk, hearts_on_win)
select 'test:median:' || w, 'lobby'::public.contest_kind, 'flex3', 2026, 1, w::integer, 'Test Median', 0, 'median'::public.contest_win_condition, null::integer, 0::smallint, 0::smallint
  from unnest(array[95,96,97]) w
union all
select 'test:top3:' || w, 'lobby'::public.contest_kind, 'wr_room', 2026, 1, w::integer, 'Test Top Three', 0, 'top_n'::public.contest_win_condition, 3, 0::smallint, 0::smallint
  from unnest(array[95,96,97]) w;

-- ---------------------------------------------------------------------------
-- 1-2. AS THE PLAYER: the run, and what entering it stamps.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  a    constant uuid := '11111111-0000-0000-0000-000000000001';
  v_run  public.runs;
  v_run2 public.runs;
  v_med  uuid; v_top uuid; v_free uuid;
  ids    uuid[];
begin
  select array_agg(ci.id order by p.external_id) into ids
    from public.card_instances ci
    join public.cards c   on c.id = ci.card_id
    join public.players p on p.id = c.player_id
   where ci.user_id = a and p.external_id between 99511 and 99519;

  -- 1. A RUN IS CREATED ON FIRST ASK, and asking again returns the same one
  --    rather than minting a second. `set_lineup` now calls `current_run()`
  --    unconditionally, so this is on the path of every entry in the game and
  --    a second run would fork the record silently.
  v_run := public.current_run();
  v_run2 := public.current_run();
  if v_run2.id is distinct from v_run.id then
    raise exception 'FAIL: current_run minted a second live run';
  end if;
  if v_run.ended_at is not null then
    raise exception 'FAIL: a new run opened already ended';
  end if;

  -- 2. EVERY ENTRY JOINS THE RUN, whatever the contest is.
  --
  --    THIS IS THE ASSERTION THE REMOVAL TURNS ON. Both writers of
  --    `lineups.run_id` used to gate on hearts — `set_lineup` on
  --    `hearts_at_risk > 0`, the `lineup_joins_the_run` trigger on
  --    `hearts_on_win > 0`. With every stake at nought BOTH GATES CLOSE, and an
  --    entry with a null `run_id` is skipped by `settle_run_week` — so the
  --    season record would have stopped being written the day the stakes were
  --    zeroed, silently, with no error anywhere. A lobby contest and the free
  --    one are both checked because they arrive by different paths.
  v_med := public.set_lineup(2026, 1::smallint, 95,
    jsonb_build_array(
      jsonb_build_object('slot','FLEX1','card_instance_id', ids[1]),
      jsonb_build_object('slot','FLEX2','card_instance_id', ids[2]),
      jsonb_build_object('slot','FLEX3','card_instance_id', ids[3])),
    'test:median:95');
  if (select run_id from public.lineups where id = v_med) is distinct from v_run.id then
    raise exception 'FAIL: a lobby entry did not carry the run';
  end if;

  v_free := public.set_lineup(2026, 1::smallint, 95,
    jsonb_build_array(jsonb_build_object('slot','WR1','card_instance_id', ids[7])));
  if (select run_id from public.lineups where id = v_free) is distinct from v_run.id then
    raise exception 'FAIL: the free contest did not carry the run';
  end if;

  --    And the free contest is built without a stake. `ensure_free_contest`
  --    creates a fresh one every week, so a stake left in that constructor
  --    would arrive on week 5 rather than on this migration.
  if (select hearts_at_risk from public.contests
       where id = (select contest_id from public.lineups where id = v_free)) <> 0 then
    raise exception 'FAIL: ensure_free_contest built a contest with a stake';
  end if;

  -- 3. ENTERING DOES NOT LOCK THE COLLECTION (20260826050000), and what IS
  --    locked is the starter and only its own copy. Both rules predate the
  --    removal and neither depended on it: the sell refusal is about a lineup
  --    that has not been scored, which is still a thing that exists.
  perform public.sell_card(ids[6]);
  if (select sold_at from public.card_instances where id = ids[6]) is null then
    raise exception 'FAIL: a card that was not starting could not be sold mid-week';
  end if;
  --    A sale is not a wipe, and the card profile has to be able to tell them
  --    apart. Nothing can set `wiped_at` any more, which makes this the assertion
  --    that would catch `wipe_run` finding a caller again.
  if (select wiped_at from public.card_instances where id = ids[6]) is not null then
    raise exception 'FAIL: an ordinary sale set wiped_at';
  end if;

  begin
    perform public.sell_card(ids[1]);
    raise exception 'FAIL: a starter was sold out of an unscored lineup';
  exception when sqlstate '55006' then null;
  end;
  begin
    perform public.sell_card(ids[7]);
    raise exception 'FAIL: a starter in the free contest was sold';
  exception when sqlstate '55006' then null;
  end;

  -- 4. LEAVING TAKES THE ENTRY AND ITS SLOTS WITH IT, so a card that was
  --    starting there is an ordinary card again.
  perform public.leave_contest('test:median:95');
  if exists (
    select 1 from public.lineup_slots ls
      join public.lineups l on l.id = ls.lineup_id
     where ls.card_instance_id = ids[1] and l.scored_at is null
  ) then
    raise exception 'FAIL: leaving the contest left its starter in an unscored lineup';
  end if;

  -- Re-enter for the settlement assertions below.
  v_med := public.set_lineup(2026, 1::smallint, 95,
    jsonb_build_array(
      jsonb_build_object('slot','FLEX1','card_instance_id', ids[1]),
      jsonb_build_object('slot','FLEX2','card_instance_id', ids[2]),
      jsonb_build_object('slot','FLEX3','card_instance_id', ids[3])),
    'test:median:95');

  v_top := public.set_lineup(2026, 1::smallint, 95,
    jsonb_build_array(
      jsonb_build_object('slot','WR1','card_instance_id', ids[4]),
      jsonb_build_object('slot','WR2','card_instance_id', ids[5]),
      jsonb_build_object('slot','WR3','card_instance_id', ids[8])),
    'test:top3:95');

  if (select run_id from public.lineups where id = v_top) is distinct from v_run.id then
    raise exception 'FAIL: the second entry did not carry the same run';
  end if;

  raise notice 'runs suite: entry and the sell rules passed';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3-6. AS THE OWNER: settlement.
--
-- Rivals and scores are written directly because `lineups` has no insert
-- policy — every legitimate write goes through `set_lineup`, and these are
-- opponents rather than players.
-- ---------------------------------------------------------------------------

-- Four rivals in each contest, so both have a field big enough to have a
-- result: the median needs two, and top-three needs more entrants than places.
insert into public.lineups (user_id, season, season_type, week, contest_id, total_points)
select u.id, 2026, 1::smallint, 95, c.id,
       case when c.code like 'test:median%' then 20 + u.n else u.n end
  from public.contests c,
       (values ('11111111-0000-0000-0000-000000000002'::uuid, 1),
               ('11111111-0000-0000-0000-000000000003'::uuid, 2),
               ('11111111-0000-0000-0000-000000000004'::uuid, 3),
               ('11111111-0000-0000-0000-000000000005'::uuid, 4)) u(id, n)
 where c.code in ('test:median:95', 'test:top3:95');

-- Rivals need slots or they are not entrants — an empty lineup is "opened the
-- screen", not an entry, and `contest_results` will not count it.
--
-- Each entry takes a card of its OWNER'S, chosen by the contest so the two are
-- never the same copy: `card_plays_one_contest` is a trigger, and it fires on
-- these direct writes exactly as it does on `set_lineup`.
insert into public.lineup_slots (lineup_id, slot, card_instance_id)
select l.id, 'WR1', ci.id
  from public.lineups l
  join public.contests c on c.id = l.contest_id
  join lateral (
    select x.id from public.card_instances x
     where x.user_id = l.user_id and x.is_held
     order by x.id
    offset (case when c.win_condition = 'median' then 0 else 1 end)
     limit 1
  ) ci on true
 where c.code in ('test:median:95','test:top3:95')
   and not exists (select 1 from public.lineup_slots s where s.lineup_id = l.id);

-- The player LOSES the median (10 against a field of 21-24) and WINS the top
-- three (100 against 1-4). One heart out, one heart back.
update public.lineups set total_points = 10
 where user_id = '11111111-0000-0000-0000-000000000001'
   and contest_id = (select id from public.contests where code = 'test:median:95');
update public.lineups set total_points = 100
 where user_id = '11111111-0000-0000-0000-000000000001'
   and contest_id = (select id from public.contests where code = 'test:top3:95');

-- The player LOSES the median (10 against a field of 21-24) and WINS the top
-- three (100 against 1-4). A 1-1 week, which is the shape section 4 needs.
update public.lineups set total_points = 10
 where user_id = '11111111-0000-0000-0000-000000000001'
   and contest_id = (select id from public.contests where code = 'test:median:95');
update public.lineups set total_points = 100
 where user_id = '11111111-0000-0000-0000-000000000001'
   and contest_id = (select id from public.contests where code = 'test:top3:95');

do $$
declare
  a        constant uuid := '11111111-0000-0000-0000-000000000001';
  v_run    uuid;
  v_res    text;
  v_hearts smallint;
  v_peak   smallint;
  v_wins   integer;
  v_losses integer;
  v_held   integer;
  v_coins  integer;
  v_rows   integer;
begin
  select id, hearts, peak_hearts into v_run, v_hearts, v_peak
    from public.runs where user_id = a and ended_at is null;
  select count(*) into v_held from public.card_instances where user_id = a and is_held;
  select balance into v_coins from public.coin_balances where user_id = a;

  -- 5. NO RESULT UNTIL THE WEEK IS FINAL, and a settlement pass over a live
  --    week writes nothing. A score still moving is not a result, and a row in
  --    `run_contest_results` is permanent.
  select result into v_res
    from public.contest_results((select id from public.contests where code='test:median:95'))
   where user_id = a;
  if v_res is not null then
    raise exception 'FAIL: a result was returned for a week that is not final';
  end if;

  perform public.settle_run_week(2026, 1::smallint, 95);
  if exists (select 1 from public.run_contest_results where run_id = v_run) then
    raise exception 'FAIL: an unfinished week wrote a result';
  end if;

  --    The sweep runs mid-week and scores every lineup. That is not settlement
  --    and must not be mistaken for it — the distinction that cost a real bug
  --    in 20260825260000, when exposure was read off `scored_at` while the
  --    ledger moved days later.
  update public.lineups set scored_at = now()
   where user_id = a and season = 2026 and season_type = 1 and week = 95;
  perform public.settle_run_week(2026, 1::smallint, 95);
  if exists (select 1 from public.run_contest_results where run_id = v_run) then
    raise exception 'FAIL: the sweep scoring a lineup settled the week';
  end if;

  update public.games set status_state = 'final' where season = 2026 and week = 95;

  -- 6. THE RESULTS THEMSELVES, now the week is over.
  select result into v_res
    from public.contest_results((select id from public.contests where code='test:median:95'))
   where user_id = a;
  if v_res is distinct from 'L' then
    raise exception 'FAIL: below the median should be a loss, got %', coalesce(v_res,'null');
  end if;

  select result into v_res
    from public.contest_results((select id from public.contests where code='test:top3:95'))
   where user_id = a;
  if v_res is distinct from 'W' then
    raise exception 'FAIL: first of five in a top-three should be a win, got %', coalesce(v_res,'null');
  end if;

  -- 7. THE WEEK SETTLES AS ONE PASS. Both contests reach the ledger and both
  --    counters move — a 1-1 week is one win and one loss, not a net of
  --    nothing. Settling contest-by-contest would make the answer depend on
  --    sort order, which is what the `(run_id, contest_id)` primary key and the
  --    single aggregate exist to prevent.
  perform public.settle_run_week(2026, 1::smallint, 95);
  select wins, losses into v_wins, v_losses from public.runs where id = v_run;
  if v_wins <> 1 or v_losses <> 1 then
    raise exception 'FAIL: a 1-1 week recorded % wins and % losses', v_wins, v_losses;
  end if;

  -- 8. EXACTLY ONCE. Re-running settlement is routine on gameday, and a second
  --    pass must not record a second W. Idempotency is that the counters do not
  --    MOVE AGAIN, not that they never moved.
  perform public.settle_run_week(2026, 1::smallint, 95);
  perform public.settle_run_week(2026, 1::smallint, 95);
  select wins, losses into v_wins, v_losses from public.runs where id = v_run;
  if v_wins <> 1 or v_losses <> 1 then
    raise exception 'FAIL: settlement is not idempotent (% wins, % losses)', v_wins, v_losses;
  end if;
  select count(*) into v_rows from public.run_contest_results where run_id = v_run;
  if v_rows <> 2 then
    raise exception 'FAIL: four settlement passes wrote % rows, expected 2', v_rows;
  end if;

  -- 9. A FIELD OF ONE HAS NO RESULT. This suite's free contest has a single
  --    entrant, so it is its own median and there is no side of it to be on —
  --    null, and nothing recorded. It is the guard that stops a four-tester
  --    beta printing free wins, and it is the reason `settle_run_week` tests
  --    `r.result is not null` rather than trusting the join.
  if exists (
    select 1 from public.run_contest_results rr
      join public.contests c on c.id = rr.contest_id
     where rr.user_id = a and c.kind = 'free') then
    raise exception 'FAIL: a one-entrant contest produced a result';
  end if;

  -- ======================================================================
  -- 10. THE MECHANIC IS OFF — the negatives, asserted directly.
  -- ======================================================================
  --
  -- Every one of these was a thing settlement DID a migration ago, on exactly
  -- this input: a run that has just taken a loss. The machinery is all still in
  -- the database, so "it no longer happens" is a claim about wiring rather than
  -- about absence, and wiring is what regresses.

  --  NO HEART MOVES. `v_hearts` and `v_peak` were read before any of the four
  --  settlement passes above, one of which recorded a loss — which under the
  --  old code was a heart off the rack and a notch off nothing else.
  if (select hearts from public.runs where id = v_run) is distinct from v_hearts then
    raise exception 'FAIL: a settled loss moved the run from % hearts to %',
      v_hearts, (select hearts from public.runs where id = v_run);
  end if;
  if (select peak_hearts from public.runs where id = v_run) is distinct from v_peak then
    raise exception 'FAIL: settlement moved the rack from % to %',
      v_peak, (select peak_hearts from public.runs where id = v_run);
  end if;

  --  The delta on the record is written as nought rather than left to whatever
  --  the contest says, so a row in the ledger cannot imply a cost.
  if exists (select 1 from public.run_contest_results
              where run_id = v_run and coalesce(hearts_delta, 0) <> 0) then
    raise exception 'FAIL: settlement recorded a non-zero hearts_delta';
  end if;

  --  NO DEATH. The old code ended a run in the same statement it wiped it, so
  --  this one assertion covers both — but the wipe's own effects are checked
  --  below anyway, because they are the irreversible half.
  if (select ended_at from public.runs where id = v_run) is not null then
    raise exception 'FAIL: settlement ended a run';
  end if;
  if (select ended_reason from public.runs where id = v_run) is not null then
    raise exception 'FAIL: settlement gave a live run an ended_reason';
  end if;

  --  NOTHING WIPED. `wipe_run` sold every held card for nought, emptied the
  --  wallet and ledgered it as `run_wipe`. The collection here is one down from
  --  the sell in section 3 and must be exactly that.
  if (select count(*) from public.card_instances where user_id = a and is_held) <> v_held then
    raise exception 'FAIL: the collection changed across settlement, % -> %',
      v_held, (select count(*) from public.card_instances where user_id = a and is_held);
  end if;
  if exists (select 1 from public.card_instances where user_id = a and wiped_by_run is not null) then
    raise exception 'FAIL: a card was wiped';
  end if;
  if (select balance from public.coin_balances where user_id = a) <> v_coins then
    raise exception 'FAIL: the wallet moved across settlement';
  end if;
  if exists (select 1 from public.coins_ledger where user_id = a and reason = 'run_wipe') then
    raise exception 'FAIL: a run_wipe was ledgered';
  end if;

  --  AND NOTHING IS ADVERTISED AS RIDING. `wagered_entries` is the single
  --  definition of "exposed" and it reads `hearts_at_risk`, so with every stake
  --  at nought it must be empty for every week — including the live one, which
  --  is the window it existed for.
  if (select count(*) from public.wagered_entries(a)) <> 0 then
    raise exception 'FAIL: % entries are still counted as riding',
      (select count(*) from public.wagered_entries(a));
  end if;

  raise notice 'runs suite: settlement and the removal passed';
end $$;

-- ---------------------------------------------------------------------------
-- 11. THE STAKE CANNOT COME BACK BY THE BACK DOOR.
--
-- The assertions above all rest on `hearts_at_risk` being nought. A dormant
-- mechanic does not usually return by being switched on — it returns because a
-- seed, a template, or a hand-written UPDATE sets a column nobody is watching,
-- and everything downstream wakes up at once. The check constraint is what
-- makes that impossible rather than unlikely, and this is the only assertion in
-- the suite that tests the constraint rather than the behaviour.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    update public.contests set hearts_at_risk = 1 where code = 'test:median:95';
    raise exception 'FAIL: a contest was allowed to stake a heart';
  exception when check_violation then null;
  end;

  begin
    update public.contests set hearts_on_win = 1 where code = 'test:median:95';
    raise exception 'FAIL: a contest was allowed to heal a heart';
  exception when check_violation then null;
  end;

  -- The templates are the other door, and the one that would reach every future
  -- week at once: `ensure_week_contests` copies a template's terms onto the
  -- contests it creates.
  begin
    update public.contest_templates set hearts_at_risk = 1
     where code = (select code from public.contest_templates limit 1);
    raise exception 'FAIL: a template was allowed to stake a heart';
  exception when check_violation then null;
  end;

  raise notice 'runs suite: the stake cannot be restored by accident';
end $$;

rollback;
