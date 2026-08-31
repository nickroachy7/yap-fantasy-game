-- Yap Fantasy — runs suite (20260825110000 .. 20260825190000)
--
-- The roguelike layer: hearts on a contest, a week that nets out, a death, and
-- the carry that answers it. The assertions that matter most are the ones about
-- what a run CANNOT do, because every one of them is a way the wipe could have
-- been avoided or applied twice:
--
--   * a week settles as ONE delta, so a 1-1 slate cannot kill you by sort order
--   * settlement is exactly-once, so a re-run cannot take a second heart
--   * the collection cannot be liquidated while hearts are riding on a result
--   * a committed card is set progress and survives the wipe
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

insert into public.gem_balances (user_id, balance)
values ('11111111-0000-0000-0000-000000000001', 500)
on conflict (user_id) do update set balance = 500;

-- Three weeks of fixtures, all kicking off a week out so nothing is locked yet.
insert into public.games (external_id, season, week, season_type, starts_at, status_state)
values (995001, 2026, 95, 1, now() + interval '7 days', 'scheduled'),
       (996001, 2026, 96, 1, now() + interval '7 days', 'scheduled'),
       (997001, 2026, 97, 1, now() + interval '7 days', 'scheduled');

-- The two shapes of stake. `median` is even money; `top_n` loses most of its
-- field and pays a heart back for winning, which is the only heart faucet in
-- the game.
insert into public.contests (code, kind, format_code, season, season_type, week, name,
                             entry_fee_gems, win_condition, win_rank, hearts_at_risk, hearts_on_win)
select 'test:median:' || w, 'lobby'::public.contest_kind, 'flex3', 2026, 1, w::integer, 'Test Median', 0, 'median'::public.contest_win_condition, null::integer, 1::smallint, 0::smallint
  from unnest(array[95,96,97]) w
union all
select 'test:top3:' || w, 'lobby'::public.contest_kind, 'wr_room', 2026, 1, w::integer, 'Test Top Three', 0, 'top_n'::public.contest_win_condition, 3, 1::smallint, 1::smallint
  from unnest(array[95,96,97]) w;

-- ---------------------------------------------------------------------------
-- AS THE OWNER: the ladder, and the shape of a result.
-- ---------------------------------------------------------------------------
do $$
begin
  -- 1. THE CARRY LADDER. Highest rung at or below the win count, and zero
  --    below the first rung — a player who died at two wins keeps nothing.
  if public.run_carry_slots(0)  <> 0 then raise exception 'FAIL: 0 wins should carry nothing'; end if;
  if public.run_carry_slots(2)  <> 0 then raise exception 'FAIL: 2 wins is still below the first rung'; end if;
  if public.run_carry_slots(3)  <> 1 then raise exception 'FAIL: 3 wins should carry one card'; end if;
  if public.run_carry_slots(5)  <> 1 then raise exception 'FAIL: 5 wins should still be on the 3-win rung'; end if;
  if public.run_carry_slots(6)  <> 2 then raise exception 'FAIL: 6 wins should carry two'; end if;
  if public.run_carry_slots(10) <> 3 then raise exception 'FAIL: 10 wins should carry three'; end if;
  if public.run_carry_slots(99) <> 3 then raise exception 'FAIL: the top rung should not keep climbing'; end if;
  --    A negative win count is not reachable, but the ladder is read on a death
  --    screen and must never raise there.
  if public.run_carry_slots(-1) <> 0 then raise exception 'FAIL: a negative win count should floor at zero'; end if;

  raise notice 'runs suite: carry ladder passed';
end $$;

-- ---------------------------------------------------------------------------
-- AS THE PLAYER: entering, and what entering locks.
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

  -- 2. A RUN IS CREATED ON FIRST ASK, at the configured hearts, and asking
  --    again returns the same one rather than minting a second.
  v_run := public.current_run();
  if v_run.hearts <> public.game_config_value('run_starting_hearts', 3) then
    raise exception 'FAIL: a new run did not start on the configured hearts';
  end if;
  -- NOTHING IS BROKEN ON A NEW RUN. The rack is the starting hearts and not
  -- the ceiling, which is the whole of the bug 20260825250000 exists to
  -- prevent: a rack of `max_hearts` drew a fresh run as two losses down.
  if v_run.peak_hearts <> v_run.hearts then
    raise exception 'FAIL: a new run opened with % of % hearts — phantom damage',
      v_run.hearts, v_run.peak_hearts;
  end if;
  v_run2 := public.current_run();
  if v_run2.id is distinct from v_run.id then
    raise exception 'FAIL: current_run minted a second live run';
  end if;

  -- 3. ENTERING A CONTEST WITH HEARTS ON IT STAMPS THE RUN on the entry.
  --    Settlement reads this rather than looking up the live run, because by
  --    then the run may be dead — see 20260825150000.
  v_med := public.set_lineup(2026, 1::smallint, 95,
    jsonb_build_array(
      jsonb_build_object('slot','FLEX1','card_instance_id', ids[1]),
      jsonb_build_object('slot','FLEX2','card_instance_id', ids[2]),
      jsonb_build_object('slot','FLEX3','card_instance_id', ids[3])),
    'test:median:95');

  if (select run_id from public.lineups where id = v_med) is distinct from v_run.id then
    raise exception 'FAIL: an entry with hearts at risk did not carry the run';
  end if;

  -- 4. THE FREE CONTEST IS THE RUN NOW (20260825270000). It stakes a heart like
  --    any other, so its entry carries the run — the season record and the
  --    run's health are the same thing.
  v_free := public.set_lineup(2026, 1::smallint, 95,
    jsonb_build_array(jsonb_build_object('slot','WR1','card_instance_id', ids[7])));
  if (select run_id from public.lineups where id = v_free) is distinct from v_run.id then
    raise exception 'FAIL: the free contest did not carry the run';
  end if;
  if (select hearts_at_risk from public.contests
       where id = (select contest_id from public.lineups where id = v_free)) <> 1 then
    raise exception 'FAIL: a free contest was created without its stake — check ensure_free_contest';
  end if;

  -- 5. ENTERING A CONTEST DOES NOT LOCK THE COLLECTION (20260826050000). A copy
  --    that is not starting anywhere sells at full price while a lobby entry
  --    AND the free contest both have hearts riding on them. The escrow this
  --    replaces refused every sale in that state, which — with the free contest
  --    auto-entered and unleaveable — put quick sell out of reach for most of
  --    the week the moment a second contest was entered.
  perform public.sell_card(ids[6]);
  if (select sold_at from public.card_instances where id = ids[6]) is null then
    raise exception 'FAIL: a card that was not starting could not be sold mid-week';
  end if;
  --    A sale is not a wipe, and the card profile has to be able to tell them
  --    apart.
  if (select wiped_at from public.card_instances where id = ids[6]) is not null then
    raise exception 'FAIL: an ordinary sale set wiped_at';
  end if;

  -- 6. WHAT IS LOCKED IS THE STARTER, and only its own copy. ids[1] is in the
  --    lobby entry, ids[7] in the free one — and the free one is the reason the
  --    refusal has to be per-card rather than per-run: it cannot be left, so a
  --    rule that read it as "your collection is frozen" would never lift.
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

  -- 7. LEAVING TAKES THE ENTRY AND ITS SLOTS WITH IT, so a card that was
  --    starting there is an ordinary card again. Re-entered immediately below,
  --    which the settlement assertions need.
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
-- AS THE OWNER: settlement.
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

do $$
declare
  a       constant uuid := '11111111-0000-0000-0000-000000000001';
  v_run   uuid;
  v_res   text;
  v_before smallint;
  v_after  smallint;
  v_wins   integer;
begin
  select id, hearts into v_run, v_before from public.runs where user_id = a and ended_at is null;

  -- 7. NO RESULT UNTIL THE WEEK IS FINAL. Settling a live week would charge a
  --    heart for a score still moving.
  select result into v_res
    from public.contest_results((select id from public.contests where code='test:median:95'))
   where user_id = a;
  if v_res is not null then
    raise exception 'FAIL: a result was returned for a week that is not final';
  end if;

  perform public.settle_run_week(2026, 1::smallint, 95);
  if (select hearts from public.runs where id = v_run) <> v_before then
    raise exception 'FAIL: an unfinished week moved hearts';
  end if;

  -- 9. A HEART IS RIDING UNTIL SETTLEMENT SAYS OTHERWISE, not until the sweep
  --    does. `scored_at` is written by the gameday sweep as each lineup is
  --    scored; hearts only move once every fixture in the week is final, which
  --    on a real NFL week is days later. Reading exposure off `scored_at` meant
  --    the masthead said nothing was at stake while the lobby row it came from
  --    still advertised one.
  --
  --    Asserted here, with the week still in progress, because that is the
  --    whole window under test. Three entries stake a heart: the free contest
  --    and both lobby ones.
  if (select coalesce(sum(hearts_at_risk), 0) from public.wagered_entries(a)) <> 3 then
    raise exception 'FAIL: three entered heart contests should be three hearts riding, got %',
      (select coalesce(sum(hearts_at_risk), 0) from public.wagered_entries(a));
  end if;

  --    The sweep runs mid-week. Every entry is scored and every heart is still
  --    on the line, because nothing has settled them.
  update public.lineups set scored_at = now()
   where user_id = a and season = 2026 and season_type = 1 and week = 95;

  if (select coalesce(sum(hearts_at_risk), 0) from public.wagered_entries(a)) <> 3 then
    raise exception 'FAIL: hearts stopped riding when the sweep scored the lineup';
  end if;

  update public.games set status_state = 'final' where season = 2026 and week = 95;

  -- 8. THE RESULTS THEMSELVES, now the week is over.
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

  -- 10. THE WEEK NETS OUT AS ONE DELTA. A loss and a healing win on the same
  --     slate cancel; if these were settled one at a time the answer would
  --     depend on which row was processed first.
  perform public.settle_run_week(2026, 1::smallint, 95);
  select hearts, wins into v_after, v_wins from public.runs where id = v_run;
  if v_after <> v_before then
    raise exception 'FAIL: a 1-1 week changed hearts from % to %', v_before, v_after;
  end if;
  if v_wins <> 1 then
    raise exception 'FAIL: the win was not counted, wins = %', v_wins;
  end if;

  --     And nothing rides any more. The window closes on the result — or, for
  --     an entry whose field was too small to have one, on the week itself.
  --     Without that second clause a contest that can never produce a result
  --     would ride forever, which is routine in a four-tester beta.
  if (select count(*) from public.wagered_entries(a)) <> 0 then
    raise exception 'FAIL: a finished week is still counted as riding';
  end if;

  -- 11. EXACTLY ONCE. Re-running settlement is routine on gameday, and a second
  --     pass must not take a second heart.
  perform public.settle_run_week(2026, 1::smallint, 95);
  perform public.settle_run_week(2026, 1::smallint, 95);
  select hearts, wins into v_after, v_wins from public.runs where id = v_run;
  if v_after <> v_before or v_wins <> 1 then
    raise exception 'FAIL: settlement is not idempotent (hearts %, wins %)', v_after, v_wins;
  end if;

  -- 12. A FIELD OF ONE HAS NO RESULT, whatever the contest stakes. This suite's
  --     free contest has a single entrant, so it is the player's own median and
  --     there is no side of it to be on — null, and no heart moves. It is the
  --     same guard that stops a four-tester beta printing free wins.
  if exists (
    select 1 from public.run_contest_results rr
      join public.contests c on c.id = rr.contest_id
     where rr.user_id = a and c.kind = 'free') then
    raise exception 'FAIL: a one-entrant contest produced a result';
  end if;

  raise notice 'runs suite: settlement passed';
end $$;

-- ---------------------------------------------------------------------------
-- Set progress, established BEFORE the death, because the wipe now runs at
-- settlement and has to step around it there rather than later.
--
-- Both the forms it takes: a claimed milestone, and a card burnt into a set.
-- Neither may be touched.
-- ---------------------------------------------------------------------------

insert into public.card_sets (code, name, family, season, required_count, sort_order)
values ('test:set:runs', 'Test Set', 'team', 2026, 1, 1);

insert into public.set_milestone_claims (user_id, set_id, committed_at_claim, reward_gems, threshold_pct)
select '11111111-0000-0000-0000-000000000001', id, 1, 100, 10
  from public.card_sets where code = 'test:set:runs';

update public.card_instances
   set committed_at = now(), committed_for = 4,
       committed_to = (select id from public.card_sets where code = 'test:set:runs')
 where id = (select ci.id from public.card_instances ci
               join public.cards c on c.id = ci.card_id
               join public.players p on p.id = c.player_id
              where ci.user_id = '11111111-0000-0000-0000-000000000001'
                and p.external_id = 99519);

-- ---------------------------------------------------------------------------
-- Driving the run to zero, and the clamp on the way down.
-- ---------------------------------------------------------------------------

insert into public.lineups (user_id, season, season_type, week, contest_id, total_points, run_id)
select u.id, 2026, 1::smallint, w, c.id,
       case when u.id = '11111111-0000-0000-0000-000000000001' then 1 else 50 + u.n end,
       case when u.id = '11111111-0000-0000-0000-000000000001'
            then (select id from public.runs where user_id = '11111111-0000-0000-0000-000000000001' and ended_at is null)
       end
  from public.contests c,
       unnest(array[96,97]) w,
       (values ('11111111-0000-0000-0000-000000000001'::uuid, 0),
               ('11111111-0000-0000-0000-000000000002'::uuid, 1),
               ('11111111-0000-0000-0000-000000000003'::uuid, 2),
               ('11111111-0000-0000-0000-000000000004'::uuid, 3),
               ('11111111-0000-0000-0000-000000000005'::uuid, 4)) u(id, n)
 where c.code in ('test:median:' || w, 'test:top3:' || w);

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
 where (c.code like 'test:%:96' or c.code like 'test:%:97')
   and not exists (select 1 from public.lineup_slots s where s.lineup_id = l.id);

update public.games set status_state = 'final' where season = 2026 and week in (96, 97);

-- THE DEATH CHAIN IS PINNED TO THREE HEARTS, rather than inheriting whatever a
-- run happens to start with.
--
-- What is under test below is SETTLEMENT'S ARITHMETIC — two losses take two, a
-- balance of one clamps at zero rather than going negative, and a run at zero
-- ends — and none of that is a statement about `run_starting_hearts`. The
-- assertions were written when that config was 3 and read the number straight
-- out of the run, so the day it moved to 5 (`20260831010000`) the suite failed
-- with "two losses should leave one heart, got 3": the losses were applied
-- perfectly and the test was measuring the config.
--
-- A suite that asserts a number it did not set is asserting the config. This
-- sets it.
update public.runs
   set hearts = 3, peak_hearts = 3
 where user_id = '11111111-0000-0000-0000-000000000001' and ended_at is null;

do $$
declare
  a     constant uuid := '11111111-0000-0000-0000-000000000001';
  v_run uuid;
  r     public.runs;
begin
  select id into v_run from public.runs where user_id = a and ended_at is null;

  -- Week 96: last in both, so two hearts out of three. Survives on one.
  perform public.settle_run_week(2026, 1::smallint, 96);
  select * into r from public.runs where id = v_run;
  if r.hearts <> 1 then raise exception 'FAIL: two losses should leave one heart, got %', r.hearts; end if;
  if r.ended_at is not null then raise exception 'FAIL: the run died with a heart left'; end if;

  --     THE RACK DOES NOT SHRINK WITH THE DAMAGE. This is what makes a broken
  --     heart drawable: one held against a rack of three is two pips gone, and
  --     a rack that narrowed to match would hide the loss it exists to show.
  if r.peak_hearts <> 3 then
    raise exception 'FAIL: the rack narrowed as hearts fell, peak = %', r.peak_hearts;
  end if;

  -- Week 97: two more against one heart. The delta is -2 against a balance of
  -- 1, so the clamp is what stands between this and a constraint violation.
  perform public.settle_run_week(2026, 1::smallint, 97);
  select * into r from public.runs where id = v_run;
  if r.hearts <> 0 then raise exception 'FAIL: hearts should floor at zero, got %', r.hearts; end if;
  if r.ended_at is null then raise exception 'FAIL: a run at zero hearts is still live'; end if;
  if r.ended_reason is distinct from 'out_of_hearts' then
    raise exception 'FAIL: the run ended for the wrong reason: %', coalesce(r.ended_reason,'null');
  end if;

  -- 12. A DEAD RUN IS NOT REPLACED until its carry is answered. Handing out a
  --     fresh run here would silently forfeit the cards the ladder owes.
  if (select id from public.current_run()) is distinct from v_run then
    raise exception 'FAIL: current_run started a new run over an unanswered death';
  end if;

  -- 13. THE WIPE HAPPENED AT SETTLEMENT, not at the claim. This is the whole
  --     point of 20260825235000: while the taking waited on the player, the
  --     player could simply never arrive — die, never open the death screen,
  --     and keep everything forever.
  if exists (select 1 from public.card_instances
              where user_id = a and is_held and committed_at is null) then
    raise exception 'FAIL: a held card survived settlement — the wipe did not run';
  end if;
  if (select coalesce(balance, 0) from public.gem_balances where user_id = a) <> 0 then
    raise exception 'FAIL: gems survived settlement';
  end if;

  --     And every wiped copy is stamped with the run that took it, which is
  --     what makes it restorable by that run's claim and no other.
  if exists (select 1 from public.card_instances
              where user_id = a and wiped_at is not null and wiped_by_run is distinct from v_run) then
    raise exception 'FAIL: a wiped card is not attributable to the run that took it';
  end if;

  -- 14. SET PROGRESS OUTLIVED IT, in both forms. This is the promise the whole
  --     feature is sold on and it is now settlement's job to keep, not the
  --     claim's.
  if not exists (select 1 from public.set_milestone_claims where user_id = a) then
    raise exception 'FAIL: a claimed set milestone was wiped';
  end if;
  if not exists (select 1 from public.card_instances
                  where user_id = a and committed_at is not null and wiped_at is null) then
    raise exception 'FAIL: a card committed to a set was wiped';
  end if;

  -- 15. AND SETTLING AGAIN TAKES NOTHING MORE. The wipe rides on the
  --     transition to `ended_at`, so a re-run finds no run to end.
  perform public.settle_run_week(2026, 1::smallint, 97);
  if (select count(*) from public.gems_ledger
       where user_id = a and reason = 'run_wipe') <> 1 then
    raise exception 'FAIL: re-settling wiped a second time';
  end if;

  raise notice 'runs suite: death and wipe passed';
end $$;

-- ---------------------------------------------------------------------------
-- The carry, which is now a RESTORE.
-- ---------------------------------------------------------------------------

-- Six wins buys two cards. Set here rather than played out, because the rung is
-- what is under test and `run_carry_slots` above already proves the ladder.
update public.runs set wins = 6
 where user_id = '11111111-0000-0000-0000-000000000001' and ended_at is not null;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  a       constant uuid := '11111111-0000-0000-0000-000000000001';
  lost    uuid[];
  n_lost  integer;
  v_out   jsonb;
  v_new   uuid;
begin
  -- The pool a carry is chosen from is what the run TOOK, not what is held —
  -- nothing is held any more. `my_lost_cards` is the view the death screen
  -- reads; this is the same set.
  select array_agg(id order by id), count(*) into lost, n_lost
    from public.card_instances where user_id = a and wiped_by_run is not null;

  if n_lost < 3 then
    raise exception 'FAIL: fixture problem — only % cards were wiped', n_lost;
  end if;

  -- 16. THE ALLOWANCE IS A CEILING. Naming more than the ladder owes is
  --     refused rather than silently truncated to the first two.
  begin
    perform public.claim_carry(lost[1:3]);
    raise exception 'FAIL: three cards were restored on a two-card allowance';
  exception when sqlstate '22023' then null;
  end;

  -- 17. AND ONLY THIS RUN'S LOSSES CAN BE RESTORED. A card that was never
  --     yours, or one an earlier run took, is not in the pool however the id
  --     was come by.
  begin
    perform public.claim_carry(array[gen_random_uuid()]);
    raise exception 'FAIL: a card this run never took was restored';
  exception when sqlstate '42501' then null;
  end;

  --     A COMMITTED CARD IS NOT IN THE POOL EITHER. It was never wiped, so
  --     "restoring" it would spend a slot on something already safe.
  begin
    perform public.claim_carry(array[(select id from public.card_instances
                                       where user_id = a and committed_at is not null limit 1)]);
    raise exception 'FAIL: a committed card was spent as a carry slot';
  exception when sqlstate '42501' then null;
  end;

  v_out := public.claim_carry(lost[1:2]);

  -- 18. THE RESTORE. Two named copies are back in the collection; everything
  --     else the run took stays gone.
  if (select count(*) from public.card_instances
       where user_id = a and is_held and committed_at is null) <> 2 then
    raise exception 'FAIL: the restore left % cards held',
      (select count(*) from public.card_instances
        where user_id = a and is_held and committed_at is null);
  end if;
  if (v_out ->> 'restored')::int <> 2 then
    raise exception 'FAIL: restored disagrees with what came back';
  end if;
  if (v_out ->> 'cards_lost')::int <> n_lost - 2 then
    raise exception 'FAIL: cards_lost disagrees with what stayed gone';
  end if;

  --     A restored copy carries no trace of the wipe, or the card profile
  --     would go on describing it as lost.
  if exists (select 1 from unnest(lost[1:2]) x(id)
               join public.card_instances ci on ci.id = x.id
              where ci.wiped_at is not null or ci.sold_at is not null
                 or ci.wiped_by_run is not null) then
    raise exception 'FAIL: a restored card is still marked as wiped';
  end if;

  -- 19. GEMS DO NOT COME BACK. The ladder is denominated in card slots, and a
  --     wallet is not a card.
  if (select coalesce(balance, 0) from public.gem_balances where user_id = a) <> 0 then
    raise exception 'FAIL: the carry restored gems';
  end if;

  -- 20. A NEW RUN IS WAITING, on full hearts, and the old one is closed for
  --     good — claiming twice must not restore a second helping.
  v_new := (v_out ->> 'new_run')::uuid;
  if v_new is null then raise exception 'FAIL: no new run was started'; end if;
  if (select hearts from public.runs where id = v_new)
     <> public.game_config_value('run_starting_hearts', 3) then
    raise exception 'FAIL: the new run did not start on full hearts';
  end if;

  begin
    perform public.claim_carry('{}');
    raise exception 'FAIL: a settled death was claimed a second time';
  exception when sqlstate '22023' then null;
  end;

  if (select count(*) from public.card_instances
       where user_id = a and is_held and committed_at is null) <> 2 then
    raise exception 'FAIL: a second claim changed what was restored';
  end if;

  -- 21. THE LOST LIST EMPTIES ITSELF once the claim lands, so the death screen
  --     has nothing stale to guard against.
  if exists (select 1 from public.my_lost_cards) then
    raise exception 'FAIL: my_lost_cards still returns rows after the claim';
  end if;

  raise notice 'runs suite: carry and restore passed';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- THE RACK GROWS WHEN A RUN HEALS.
--
-- Run on the FRESH run `claim_carry` just opened, because that is the only
-- place in this suite where hearts can rise: every earlier week either nets to
-- zero or loses. Week 98 is a win in the healing contest and nothing else, so
-- three hearts become four and the rack has to widen to hold the fourth.
-- ---------------------------------------------------------------------------

insert into public.games (external_id, season, week, season_type, starts_at, status_state)
values (998001, 2026, 98, 1, now() - interval '1 day', 'final');

insert into public.contests (code, kind, format_code, season, season_type, week, name,
                             entry_fee_gems, win_condition, win_rank, hearts_at_risk, hearts_on_win)
values ('test:top3:98', 'lobby'::public.contest_kind, 'wr_room', 2026, 1, 98, 'Test Top Three',
        0, 'top_n'::public.contest_win_condition, 3, 1::smallint, 1::smallint);

insert into public.lineups (user_id, season, season_type, week, contest_id, total_points, run_id)
select u.id, 2026, 1::smallint, 98, c.id,
       case when u.id = '11111111-0000-0000-0000-000000000001' then 500 else u.n end,
       case when u.id = '11111111-0000-0000-0000-000000000001'
            then (select id from public.runs
                   where user_id = '11111111-0000-0000-0000-000000000001' and ended_at is null)
       end
  from public.contests c,
       (values ('11111111-0000-0000-0000-000000000001'::uuid, 0),
               ('11111111-0000-0000-0000-000000000002'::uuid, 1),
               ('11111111-0000-0000-0000-000000000003'::uuid, 2),
               ('11111111-0000-0000-0000-000000000004'::uuid, 3),
               ('11111111-0000-0000-0000-000000000005'::uuid, 4)) u(id, n)
 where c.code = 'test:top3:98';

insert into public.lineup_slots (lineup_id, slot, card_instance_id)
select l.id, 'WR1', ci.id
  from public.lineups l
  join public.contests c on c.id = l.contest_id
  join lateral (
    select x.id from public.card_instances x
     where x.user_id = l.user_id and x.is_held
     order by x.id limit 1
  ) ci on true
 where c.code = 'test:top3:98'
   and not exists (select 1 from public.lineup_slots s where s.lineup_id = l.id);

-- PINNED FOR THE SAME REASON THE DEATH CHAIN IS, and here it matters more: the
-- assertion below is that a heal WIDENS THE RACK, which can only be observed on
-- a run whose hearts and peak are equal and below the ceiling. A fresh run
-- satisfies that at any starting value, but the numbers it is checked against
-- are written down, so the fixture has to write the start down too.
update public.runs
   set hearts = 3, peak_hearts = 3
 where user_id = '11111111-0000-0000-0000-000000000001' and ended_at is null;

do $$
declare
  a     constant uuid := '11111111-0000-0000-0000-000000000001';
  r     public.runs;
begin
  select * into r from public.runs where user_id = a and ended_at is null;
  /* Now a check that the PIN took, rather than a check on `run_starting_hearts`
     wearing a fixture's clothes. */
  if r.hearts <> 3 or r.peak_hearts <> 3 then
    raise exception 'FAIL: fixture problem — new run is % of %', r.hearts, r.peak_hearts;
  end if;

  perform public.settle_run_week(2026, 1::smallint, 98);
  select * into r from public.runs where user_id = a and ended_at is null;

  -- 22. A WIN IN THE HEALING CONTEST ADDS A HEART...
  if r.hearts <> 4 then
    raise exception 'FAIL: a heal did not land, hearts = %', r.hearts;
  end if;
  -- 23. ...AND THE RACK WIDENS TO HOLD IT. Without this the fourth heart has
  --     nowhere to be drawn, which is the failure mode a fixed starting-hearts
  --     rack would have had.
  if r.peak_hearts <> 4 then
    raise exception 'FAIL: the rack did not grow with the heal, peak = %', r.peak_hearts;
  end if;

  raise notice 'runs suite: the rack passed';
end $$;

rollback;
