-- Yap Fantasy — contests suite (20260825010000, 20260825020000)
--
-- The rules a second contest introduces, and the one that is the whole point:
-- A CARD PLAYS IN ONE CONTEST A WEEK. Without that, an extra contest is another
-- place to park the same eight cards and the bench gets MORE comfortable, not
-- less. Every other assertion here is scaffolding around that one.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/contests.test.sql

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','cccccccc-0000-0000-0000-000000000001','authenticated','authenticated','c@t.local','',now(),now(),now());

-- Two receivers and a quarterback. The QB exists only to be REFUSED by the
-- three-card format, which is the check that proves slots are scoped to a
-- format rather than global.
insert into public.card_instances (user_id, card_id)
select 'cccccccc-0000-0000-0000-000000000001', ranked.id
from (
  select c.id, p.position_abbreviation as pos,
         row_number() over (partition by p.position_abbreviation order by c.id) as rn
  from public.cards c join public.players p on p.id = c.player_id
  where c.season = 2026 and p.position_abbreviation in ('QB','WR')
) ranked
where (ranked.pos = 'WR' and ranked.rn <= 2) or (ranked.pos = 'QB' and ranked.rn = 1);

-- A week of this suite's own, kicking off a week out so nothing is locked.
-- Week 94 is far outside any real slate — see the note in `lineup_abuse`.
insert into public.games (external_id, season, week, season_type, starts_at, status_state)
values (994001, 2026, 94, 1, now() + interval '7 days', 'scheduled');

-- The lobby contest this suite competes against the free one for cards. Three
-- flex slots, so no quarterback or kicker has to be found — the reason small
-- formats exist at all is that exclusivity plus an eight-card format would
-- ration entry by kicker depth.
--
-- `prize_pool_bps` is not optional on anything that charges: since
-- `20260826020000` the constraint `contests_paid_contests_pay_out` refuses a
-- paid contest with no pool, so that "if it costs gems it pays gems" is a
-- property of the schema rather than a thing every seed has to remember. This
-- suite was the first thing that constraint caught.
insert into public.contests (code, kind, format_code, season, season_type, week, name, entry_fee_gems, prize_pool_bps)
values ('test:lobby:94', 'lobby', 'flex3', 2026, 1, 94, 'Test Flex Three', 25, 2500);

-- Enough for one entry and change, but nowhere near the 999 contest below.
insert into public.gem_balances (user_id, balance)
values ('cccccccc-0000-0000-0000-000000000001', 60)
on conflict (user_id) do update set balance = 60;

-- Two more paid contests, each testing one refusal: `lobby2` is FULL (a rival
-- already holds its only seat) and `lobby3` is unaffordable.
insert into public.contests (code, kind, format_code, season, season_type, week, name, entry_fee_gems, max_entrants, prize_pool_bps)
values ('test:lobby2:94', 'lobby', 'flex3', 2026, 1, 94, 'Test Full House', 25, 2, 2500),
       ('test:lobby3:94', 'lobby', 'flex3', 2026, 1, 94, 'Test Rich Only', 999, null, 2500);

-- The rival, and the two seats of `lobby2` filled by them. Written here rather
-- than in the assertion block because `lineups` has no insert policy — see the
-- note on the first DO block.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','dddddddd-0000-0000-0000-000000000001','authenticated','authenticated','d@t.local','',now(),now(),now()),
       ('00000000-0000-0000-0000-000000000000','dddddddd-0000-0000-0000-000000000002','authenticated','authenticated','d2@t.local','',now(),now(),now());

insert into public.lineups (user_id, season, season_type, week, contest_id)
select u, 2026, 1::smallint, 94, c.id
  from public.contests c,
       unnest(array['dddddddd-0000-0000-0000-000000000001'::uuid,
                    'dddddddd-0000-0000-0000-000000000002'::uuid]) u
 where c.code = 'test:lobby2:94';

-- ---------------------------------------------------------------------------
-- AS THE OWNER: the assertions that write `lineups` directly.
--
-- `lineups` has no insert policy at all — every legitimate write goes through
-- `set_lineup` — so these cannot run as `authenticated`. That is not a gap
-- being worked around: it is the reason the trigger has to be the backstop
-- rather than the check, because the roles that CAN write the table are the
-- ones no policy is guarding.
-- ---------------------------------------------------------------------------
do $$
declare
  a   constant uuid := 'cccccccc-0000-0000-0000-000000000001';
  wk  constant int  := 94;
  v_free uuid; v_lineup uuid; v_contest uuid;
begin
  -- 1. THE FREE CONTEST IS CREATED ON DEMAND, so a week that has never been
  --    played still has one. Nothing seeds it; `set_lineup` asks for it.
  v_free := public.ensure_free_contest(2026, 1::smallint, wk);
  if v_free is null then
    raise exception 'FAIL: no free contest was created for the week';
  end if;

  --    And asking twice returns the same row rather than a second one. The
  --    unique index would catch a duplicate, but the function must not need it.
  if public.ensure_free_contest(2026, 1::smallint, wk) is distinct from v_free then
    raise exception 'FAIL: ensure_free_contest is not idempotent';
  end if;

  -- 2. A LINEUP THAT NAMES NO CONTEST IS IN THE FREE ONE (20260825020000).
  --    Every SQL fixture in this repo writes lineups this way, and so does any
  --    repair script — a slate is what a lineup used to BE.
  insert into public.lineups (user_id, season, season_type, week)
  values (a, 2026, 1::smallint, wk) returning id, contest_id into v_lineup, v_contest;

  if v_contest is distinct from v_free then
    raise exception 'FAIL: a lineup naming no contest did not land in the free one';
  end if;
  delete from public.lineups where id = v_lineup;

  -- 3. A LINEUP WHOSE SLATE DISAGREES WITH ITS CONTEST IS REFUSED. `score_week`
  --    reads the lineup's own season/week columns, so a row where the two
  --    disagree would be scored against a week its contest is not for.
  begin
    insert into public.lineups (user_id, season, season_type, week, contest_id)
    values (a, 2026, 1::smallint, wk + 1, v_free);
    raise exception 'FAIL: a lineup was filed against a contest for another week';
  exception when sqlstate '23514' then null;
  end;

  raise notice 'contests suite: schema assertions passed';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  a   constant uuid := 'cccccccc-0000-0000-0000-000000000001';
  wk  constant int  := 94;
  wr1 uuid; wr2 uuid; qb uuid; v_n int;
begin
  select ci.id into wr1 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='WR' order by ci.id limit 1;
  select ci.id into wr2 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='WR' order by ci.id offset 1 limit 1;
  select ci.id into qb  from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='QB' order by ci.id limit 1;

  if wr1 is null or wr2 is null or qb is null then
    raise exception 'FAIL: fixture needs two WR cards and a QB';
  end if;

  -- 4. AN UNKNOWN CONTEST CODE IS REFUSED rather than silently falling back to
  --    the free contest — a typo must not quietly file the wrong entry.
  begin
    perform public.set_lineup(2026, 1::smallint, wk,
      jsonb_build_array(jsonb_build_object('slot','FLEX1','card_instance_id',wr1)),
      'test:no-such-contest');
    raise exception 'FAIL: set_lineup accepted a contest code that does not exist';
  exception when sqlstate '22023' then null;
  end;

  -- 5. SLOTS ARE SCOPED TO THE FORMAT. 'QB' is a real slot in `main` and is not
  --    one in `flex3`; before contests the slot list was global and this could
  --    not be expressed.
  begin
    perform public.set_lineup(2026, 1::smallint, wk,
      jsonb_build_array(jsonb_build_object('slot','QB','card_instance_id',qb)),
      'test:lobby:94');
    raise exception 'FAIL: a three-card format accepted the QB slot';
  exception when sqlstate '22023' then null;
  end;

  --    And the main format still refuses a flex3 slot, which is the same rule
  --    read the other way round.
  begin
    perform public.set_lineup(2026, 1::smallint, wk,
      jsonb_build_array(jsonb_build_object('slot','FLEX1','card_instance_id',wr1)));
    raise exception 'FAIL: the main format accepted a flex3 slot';
  exception when sqlstate '22023' then null;
  end;

  -- 6. THE RULE. A card in the free contest cannot also play in the lobby.
  perform public.set_lineup(2026, 1::smallint, wk,
    jsonb_build_array(jsonb_build_object('slot','WR1','card_instance_id',wr1)));

  --    MATCHED ON THE MESSAGE, not only on the errcode. 55006 is also what the
  --    roster cap and the per-player lock raise, so a bare errcode check here
  --    would pass just as happily if the card were refused for being over the
  --    cap — and would keep passing if exclusivity were removed tomorrow.
  begin
    perform public.set_lineup(2026, 1::smallint, wk,
      jsonb_build_array(jsonb_build_object('slot','FLEX1','card_instance_id',wr1)),
      'test:lobby:94');
    raise exception 'FAIL: the same card played in two contests in one week';
  exception when sqlstate '55006' then
    if sqlerrm not like '%already playing elsewhere this week%' then
      raise exception 'FAIL: refused, but not for exclusivity: %', sqlerrm;
    end if;
    if sqlerrm not like '%your main lineup%' then
      raise exception 'FAIL: the refusal does not name where the card actually is: %', sqlerrm;
    end if;
  end;

  --    A DIFFERENT card is fine — the rule is about the copy, not the roster.
  perform public.set_lineup(2026, 1::smallint, wk,
    jsonb_build_array(jsonb_build_object('slot','FLEX1','card_instance_id',wr2)),
    'test:lobby:94');

  select count(*) into v_n
    from public.lineups l join public.contests c on c.id = l.contest_id
   where l.user_id = a and l.season = 2026 and l.season_type = 1 and l.week = wk;
  if v_n <> 2 then
    raise exception 'FAIL: expected two entries for the week, found %', v_n;
  end if;

  -- 8. TAKING THE CARD OUT OF THE FREE CONTEST FREES IT. The rule is a claim on
  --    the card for as long as it is playing, not a permanent assignment.
  perform public.set_lineup(2026, 1::smallint, wk, '[]'::jsonb);
  perform public.set_lineup(2026, 1::smallint, wk,
    jsonb_build_array(
      jsonb_build_object('slot','FLEX1','card_instance_id',wr2),
      jsonb_build_object('slot','FLEX2','card_instance_id',wr1)),
    'test:lobby:94');

  -- 9. THE FEE IS CHARGED ON ENTRY, ONCE.
  --
  --    Entering `test:lobby:94` above cost 25 of the 60 seeded, and the ledger
  --    line is keyed on the entry so no retry can double it.
  select balance into v_n from public.gem_balances where user_id = a;
  if v_n <> 35 then
    raise exception 'FAIL: expected 35 gems after one 25-gem entry, found %', v_n;
  end if;

  select count(*) into v_n from public.gems_ledger
   where user_id = a and reason = 'contest_entry';
  if v_n <> 1 then
    raise exception 'FAIL: expected one contest_entry ledger row, found %', v_n;
  end if;

  --    EDITING IS NOT ENTERING. The client autosaves on every swap, so a
  --    charge per write rather than per entry would empty a wallet in a
  --    sitting. This is the assertion that pins the charge to the transition.
  perform public.set_lineup(2026, 1::smallint, wk,
    jsonb_build_array(jsonb_build_object('slot','FLEX3','card_instance_id',wr2)),
    'test:lobby:94');

  select balance into v_n from public.gem_balances where user_id = a;
  if v_n <> 35 then
    raise exception 'FAIL: editing an entry charged again — balance is now %', v_n;
  end if;

  -- 10. A FULL CONTEST IS REFUSED. Both seats are taken by the rival, and A can
  --     comfortably afford it — so a pass here cannot be affordability wearing
  --     capacity's coat.
  begin
    perform public.set_lineup(2026, 1::smallint, wk,
      jsonb_build_array(jsonb_build_object('slot','FLEX1','card_instance_id',wr1)),
      'test:lobby2:94');
    raise exception 'FAIL: entered a contest that was already full';
  exception when sqlstate '55006' then
    if sqlerrm not like '%is full (2 of 2)%' then
      raise exception 'FAIL: refused, but not for capacity: %', sqlerrm;
    end if;
  end;

  -- 11. AN ENTRY YOU CANNOT AFFORD IS REFUSED, and nothing is written.
  begin
    perform public.set_lineup(2026, 1::smallint, wk,
      jsonb_build_array(jsonb_build_object('slot','FLEX1','card_instance_id',wr1)),
      'test:lobby3:94');
    raise exception 'FAIL: entered a contest with too few gems';
  exception when sqlstate '22023' then
    if sqlerrm not like '%costs 999 gems and you have 35%' then
      raise exception 'FAIL: refused, but not for affordability: %', sqlerrm;
    end if;
  end;

  if exists (select 1 from public.lineups l join public.contests c on c.id = l.contest_id
              where l.user_id = a and c.code = 'test:lobby3:94') then
    raise exception 'FAIL: a refused entry still created a lineup';
  end if;

  -- 12. AN EMPTY PAYLOAD DOES NOT BUY AN ENTRY. Checked before the wallet is
  --     even locked, which is why this fires on `lobby3` despite A being
  --     nowhere near able to afford it — the message is the proof of which
  --     refusal ran.
  begin
    perform public.set_lineup(2026, 1::smallint, wk, '[]'::jsonb, 'test:lobby3:94');
    raise exception 'FAIL: an empty payload bought a paid entry';
  exception when sqlstate '22023' then
    if sqlerrm not like '%name at least one card%' then
      raise exception 'FAIL: the empty payload was refused for the wrong reason: %', sqlerrm;
    end if;
  end;

  select balance into v_n from public.gem_balances where user_id = a;
  if v_n <> 35 then
    raise exception 'FAIL: a refused entry moved gems: %', v_n;
  end if;

  -- 13. THE FREE CONTEST IS STILL FREE. Every refusal above is a property of a
  --     PAID contest, and the one everybody is in must have gained none of them.
  perform public.set_lineup(2026, 1::smallint, wk,
    jsonb_build_array(jsonb_build_object('slot','WR2','card_instance_id',wr1)));
  select balance into v_n from public.gem_balances where user_id = a;
  if v_n <> 35 then
    raise exception 'FAIL: the free contest charged something: %', v_n;
  end if;

  -- 14. LEAVING GIVES THE GEMS BACK AND FREES THE CARDS.
  select balance into v_n from public.gem_balances where user_id = a;
  perform public.leave_contest('test:lobby:94');

  select balance into v_n from public.gem_balances where user_id = a;
  if v_n <> 60 then
    raise exception 'FAIL: leaving did not refund the entry — balance is %', v_n;
  end if;

  if exists (select 1 from public.lineups l join public.contests c on c.id = l.contest_id
              where l.user_id = a and c.code = 'test:lobby:94') then
    raise exception 'FAIL: the entry survived leaving';
  end if;

  -- 15. AND RE-ENTERING CHARGES AGAIN. The entry charge used to be keyed on
  --     (user, contest), which cannot tell a retry from a re-entry — so this
  --     call failed on a ledger constraint rather than taking the gems.
  perform public.set_lineup(2026, 1::smallint, wk,
    jsonb_build_array(jsonb_build_object('slot','FLEX1','card_instance_id',wr2)),
    'test:lobby:94');

  select balance into v_n from public.gem_balances where user_id = a;
  if v_n <> 35 then
    raise exception 'FAIL: re-entering did not charge again — balance is %', v_n;
  end if;

  -- 16. THE FREE CONTEST CANNOT BE LEFT. Everybody is in it, and a `leave`
  --     that emptied your main lineup is a delete button wearing a kind word.
  --     MATCHED ON THE MESSAGE and using THIS suite's week: 'free:2026:1:4' is
  --     a real contest but not this test's, so an unknown-code refusal would
  --     have passed a bare errcode check while proving nothing — both raise
  --     22023.
  begin
    perform public.leave_contest('free:2026:1:94');
    raise exception 'FAIL: the free contest was left';
  exception when sqlstate '22023' then
    if sqlerrm not like '%everybody is in it%' then
      raise exception 'FAIL: refused, but not for being the free contest: %', sqlerrm;
    end if;
  end;

  raise notice 'contests suite: all assertions passed';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- BACK AS THE OWNER, for the same reason as the first block.
-- ---------------------------------------------------------------------------
do $$
declare a constant uuid := 'cccccccc-0000-0000-0000-000000000001';
        wr1 uuid;
begin
  select ci.id into wr1 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='WR' order by ci.id limit 1;

  -- 7. THE TRIGGER HOLDS EVEN WHEN set_lineup IS BYPASSED. `set_lineup`'s check
  --    exists to NAME the contest holding the card; this is what makes the rule
  --    true for any writer at all.
  begin
    insert into public.lineup_slots (lineup_id, slot, card_instance_id)
    select l.id, 'FLEX2', wr1
      from public.lineups l
     where l.user_id = a and l.contest_id = (select id from public.contests where code = 'test:lobby:94');
    raise exception 'FAIL: a raw insert put one card in two contests';
  exception when sqlstate '23505' then null;
  end;

  raise notice 'contests suite: the trigger backstop passed';
end $$;

-- ---------------------------------------------------------------------------
-- THE SEASON'S STANDINGS ARE THE FREE CONTEST (20260825060000).
--
-- The suite's user now holds TWO scored lineups in week 94 — the free one and a
-- paid lobby entry. Before that migration `leaderboard` summed both, so gems
-- bought rank; this is the assertion that says they no longer do.
-- ---------------------------------------------------------------------------
do $$
declare
  a constant uuid := 'cccccccc-0000-0000-0000-000000000001';
  v_pts numeric; v_weeks bigint; v_rows int;
begin
  insert into public.profiles (id, display_name)
  values (a, 'Contest Suite') on conflict (id) do nothing;

  -- Distinct totals, so a sum and a pick cannot be confused for each other.
  update public.lineups l set total_points = 100, scored_at = now()
    from public.contests c
   where c.id = l.contest_id and l.user_id = a and l.week = 94 and c.kind = 'free';

  update public.lineups l set total_points = 50, scored_at = now()
    from public.contests c
   where c.id = l.contest_id and l.user_id = a and l.week = 94 and c.code = 'test:lobby:94';

  select count(*) into v_rows from public.leaderboard(2026, 1::smallint, 94, 100) where user_id = a;
  if v_rows <> 1 then
    raise exception 'FAIL: the leaderboard listed the user % times', v_rows;
  end if;

  select total_points, weeks_played into v_pts, v_weeks
    from public.leaderboard(2026, 1::smallint, 94, 100) where user_id = a;

  if v_pts <> 100 then
    raise exception 'FAIL: a paid entry moved the season total — expected 100, got %', v_pts;
  end if;
  if v_weeks <> 1 then
    raise exception 'FAIL: a paid entry counted as a week played — got %', v_weeks;
  end if;

  -- `board_best_week` reads the same rows and would double-count them.
  select count(*) into v_rows from public.board_best_week(2026, 1::smallint, 100) where user_id = a;
  if v_rows <> 1 then
    raise exception 'FAIL: board_best_week listed the user % times', v_rows;
  end if;

  raise notice 'contests suite: the boards ignore paid entries';
end $$;

-- 9. THE FREE CONTEST IS FREE, and cannot be given a fee or a cap by a later
--    migration that means well. It is the game's one guaranteed weekly entry.
do $$
begin
  begin
    insert into public.contests (code, kind, format_code, season, season_type, week, name, entry_fee_gems)
    values ('test:paid-free', 'free', 'main', 2026, 1, 95, 'Should not exist', 10);
    raise exception 'FAIL: a free contest was given an entry fee';
  exception when sqlstate '23514' then null;
  end;

  -- And there is exactly one of them per week.
  begin
    insert into public.contests (code, kind, format_code, season, season_type, week, name)
    values ('test:second-free', 'free', 'main', 2026, 1, 94, 'Second free contest');
    raise exception 'FAIL: a week was given two free contests';
  exception when unique_violation then null;
  end;

  raise notice 'contests suite: contest constraints passed';
end $$;

rollback;
