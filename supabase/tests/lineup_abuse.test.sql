-- Yap Fantasy — lineup abuse suite (build plan tasks 21 + 31)
--
-- Attacks set_lineup() the way a tester with curl would, then proves the
-- legitimate path still works. Both halves matter: a set_lineup() that rejected
-- every input would pass the attack half on its own.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/lineup_abuse.test.sql

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000001','authenticated','authenticated','a@t.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000002','authenticated','authenticated','b@t.local','',now(),now(),now());

insert into public.card_instances (user_id, card_id)
select 'aaaaaaaa-0000-0000-0000-000000000001', ranked.id
from (
  select c.id, p.position_abbreviation as pos,
         row_number() over (partition by p.position_abbreviation order by c.id) as rn
  from public.cards c join public.players p on p.id = c.player_id
  where c.season = 2026 and p.position_abbreviation in ('QB','RB','WR','TE','PK')
) ranked
where (ranked.pos in ('RB','WR') and ranked.rn <= 3)
   or (ranked.pos in ('QB','TE','PK') and ranked.rn = 1);

-- B's card, which A will try to start.
--
-- Two things are load-bearing and both were wrong, which is why this suite has
-- never reached an assertion:
--
--  1. The owner must be named. Selecting only `c.id` into (user_id, card_id) is
--     two targets and one expression, and it aborted the file outright.
--  2. The INSTANCE ID is pinned rather than looked up later. The DO block below
--     runs as `authenticated` with A's jwt, and card_instances is RLS-scoped to
--     its owner — so a `select ... where user_id = b` inside it returns nothing,
--     leaving the "start another user's card" attack pointed at a null and
--     failing on the malformed-payload check instead of the ownership one. It
--     would have looked blocked while proving nothing about ownership.
insert into public.card_instances (id, user_id, card_id)
select 'bbbbbbbb-1111-0000-0000-00000000000b'::uuid,
       'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
       c.id
from public.cards c join public.players p on p.id = c.player_id
where c.season = 2026 and p.position_abbreviation = 'QB'
  and c.id not in (select card_id from public.card_instances)
order by c.id limit 1;

-- ---- two weeks of this suite's own -----------------------------------------
--
-- THE SUITE USED TO NAME REAL PRESEASON WEEKS — locked week 1, open week 3 —
-- with a comment recording when each kicked off. That is a test with an expiry
-- date on it, and it expired: preseason week 3 locked at 2026-08-21 00:00Z, so
-- from that minute "the open week" was shut and six of the seven assertions
-- below became unreachable behind a lock error. It failed for a reason that had
-- nothing to do with `set_lineup`.
--
-- `week_lock_time` is `min(starts_at)` over the week's games and nothing else,
-- so a week IS its kickoff times. Two synthetic weeks — one kicked off, one
-- still ahead — give this suite both states it needs and pin them relative to
-- `now()`, which is what stops the calendar deciding whether the tests run.
-- Weeks 92 and 93 are far outside any real slate.
--
-- TEAMS MATTER NOW. They did not when a whole week locked at its first kickoff
-- — `starts_at` was the only column that decided anything, so these games were
-- inserted with null teams. Under per-player locking (20260821210000) a card is
-- locked by ITS OWN player's fixture, so a game nobody plays in locks nobody,
-- and this suite's synthetic week would have gone from "everything is frozen"
-- to "nothing ever locks" without a single assertion changing.
--
-- Week 93 therefore gets two games: one that kicked off two days ago and one
-- that has not started, each pointed at a real team, so the same week contains
-- both a locked player and an editable one. That is the state per-player
-- locking exists for, and it is unreachable with one game.
insert into public.games (external_id, season, week, season_type, starts_at, status_state)
values (993001, 2026, 93, 1, now() - interval '2 days', 'final'),
       (993002, 2026, 92, 1, now() + interval '7 days', 'scheduled'),
       (993003, 2026, 93, 1, now() + interval '2 days', 'scheduled');

-- Two of A's running backs on different clubs: one whose game has been played,
-- one whose game is still ahead. Carried in a temp table because the assertions
-- run in a later block, under a different role.
create temp table lock_fixture on commit drop as
with rbs as (
  select ci.id as card_id, p.team_id,
         row_number() over (order by p.team_id, ci.id) as rn
    from public.card_instances ci
    join public.cards   c on c.id = ci.card_id
    join public.players p on p.id = c.player_id
   where ci.user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and p.position_abbreviation = 'RB'
     and p.team_id is not null
)
select
  (select card_id from rbs where rn = 1) as locked_card,
  (select team_id from rbs where rn = 1) as locked_team,
  (select card_id from rbs where team_id <> (select team_id from rbs where rn = 1)
    order by team_id, card_id limit 1) as open_card,
  (select team_id from rbs where team_id <> (select team_id from rbs where rn = 1)
    order by team_id, card_id limit 1) as open_team;

-- The assertions below run as `authenticated`, and a temp table belongs to the
-- role that made it. Without this they get "permission denied for table
-- lock_fixture" — which looks like an RLS finding and is nothing of the sort.
grant select on lock_fixture to authenticated;

do $$
declare f record;
begin
  select * into f from lock_fixture;
  if f.locked_card is null or f.open_card is null then
    raise exception 'FAIL: fixture needs two RB cards on different clubs';
  end if;

  -- Point each week-93 game at one of the two clubs.
  update public.games set home_team_id = f.locked_team where external_id = 993001;
  update public.games set home_team_id = f.open_team   where external_id = 993003;

  -- A lineup set BEFORE that first game kicked off, holding the card that is
  -- now locked. Written directly rather than through set_lineup, because
  -- set_lineup would (correctly) refuse to place a player whose game has begun
  -- — this is the state a user is legitimately already in.
  insert into public.lineups (user_id, season, season_type, week)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 2026, 1::smallint, 93);
  insert into public.lineup_slots (lineup_id, slot, card_instance_id)
  select l.id, 'RB1', f.locked_card
    from public.lineups l
   where l.user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and l.season = 2026 and l.season_type = 1 and l.week = 93;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  a  constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  b  constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  qb uuid; rb1 uuid; rb2 uuid; wr1 uuid; wr2 uuid; wr3 uuid; te uuid; pk uuid;
  -- Pinned above rather than selected here; RLS would hide it from A. See there.
  foreign_qb constant uuid := 'bbbbbbbb-1111-0000-0000-00000000000b';
  v_lineup uuid; v_slots int; v_lineups int; blocked int := 0;
  locked_rb uuid; open_rb uuid;

  -- This suite's own weeks, inserted above and pinned to now(): 93 kicked off
  -- two days ago, 92 kicks off in a week. Never real weeks — see the note there.
  locked_week   constant int := 93;
  open_week     constant int := 92;
begin
  select ci.id into qb  from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='QB' order by ci.id limit 1;
  select ci.id into rb1 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='RB' order by ci.id limit 1;
  select ci.id into rb2 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='RB' order by ci.id offset 1 limit 1;
  select ci.id into wr1 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='WR' order by ci.id limit 1;
  select ci.id into wr2 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='WR' order by ci.id offset 1 limit 1;
  select ci.id into wr3 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='WR' order by ci.id offset 2 limit 1;
  select ci.id into te  from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='TE' order by ci.id limit 1;
  select ci.id into pk  from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='PK' order by ci.id limit 1;

  -- 1. ADDING a player whose game has already kicked off.
  --
  --    This used to read "a week that has already kicked off", and asserted
  --    that week 93 refused everything. It no longer does and should not: the
  --    week has a game still to come, and the players in it are editable. What
  --    must be refused is putting a man on the field who is already on it.
  select locked_card into locked_rb from lock_fixture;
  select open_card   into open_rb   from lock_fixture;

  --    TAKING HIM OUT. The setup left him in RB1 from a lineup set before his
  --    game began, and replacing him now would be picking a starter after
  --    watching him play.
  begin
    perform public.set_lineup(2026, 1::smallint, locked_week,
      jsonb_build_array(jsonb_build_object('slot','RB1','card_instance_id',open_rb)));
    raise exception 'FAIL: removed a player whose game had already started';
  exception when sqlstate '55006' then blocked := blocked + 1; end;

  --    PUTTING HIM SOMEWHERE ELSE is the same offence wearing a different hat:
  --    he leaves RB1 and arrives at RB2, and the arrival is an add.
  begin
    perform public.set_lineup(2026, 1::smallint, locked_week,
      jsonb_build_array(
        jsonb_build_object('slot','RB1','card_instance_id',open_rb),
        jsonb_build_object('slot','RB2','card_instance_id',locked_rb)));
    raise exception 'FAIL: moved a player whose game had already started';
  exception when sqlstate '55006' then blocked := blocked + 1; end;

  --    AND THE OTHER HALF, which is the whole reason the rule changed: a slot
  --    beside a locked one is still editable. RB1 is untouched, RB2 takes a
  --    player whose game has not kicked off, and this MUST be allowed — under
  --    the old whole-week lock it was not, and that is the bug being fixed.
  perform public.set_lineup(2026, 1::smallint, locked_week,
    jsonb_build_array(
      jsonb_build_object('slot','RB1','card_instance_id',locked_rb),
      jsonb_build_object('slot','RB2','card_instance_id',open_rb)));

  select count(*) into v_slots
    from public.lineup_slots ls
    join public.lineups l on l.id = ls.lineup_id
   where l.user_id = a and l.season = 2026 and l.season_type = 1 and l.week = locked_week;
  if v_slots <> 2 then
    raise exception 'FAIL: editing beside a locked slot left % slots, expected 2', v_slots;
  end if;

  -- 2. a card owned by somebody else
  begin
    perform public.set_lineup(2026, 1::smallint, open_week,
      jsonb_build_array(jsonb_build_object('slot','QB','card_instance_id',foreign_qb)));
    raise exception 'FAIL: started another users card';
  exception when sqlstate '42501' then blocked := blocked + 1; end;

  -- 3. wrong position for the slot
  begin
    perform public.set_lineup(2026, 1::smallint, open_week,
      jsonb_build_array(jsonb_build_object('slot','QB','card_instance_id',wr1)));
    raise exception 'FAIL: played a WR at QB';
  exception when sqlstate '22023' then blocked := blocked + 1; end;

  -- 4. one card filling two slots
  begin
    perform public.set_lineup(2026, 1::smallint, open_week, jsonb_build_array(
      jsonb_build_object('slot','RB1','card_instance_id',rb1),
      jsonb_build_object('slot','RB2','card_instance_id',rb1)));
    raise exception 'FAIL: cloned one card across two slots';
  exception when sqlstate '22023' then blocked := blocked + 1; end;

  -- 5. a slot that does not exist
  begin
    perform public.set_lineup(2026, 1::smallint, open_week,
      jsonb_build_array(jsonb_build_object('slot','SUPERFLEX','card_instance_id',rb1)));
    raise exception 'FAIL: accepted an invented slot';
  exception when sqlstate '22023' then blocked := blocked + 1; end;

  -- 6. kicker into FLEX (FLEX is RB/WR/TE only)
  begin
    perform public.set_lineup(2026, 1::smallint, open_week,
      jsonb_build_array(jsonb_build_object('slot','FLEX','card_instance_id',pk)));
    raise exception 'FAIL: kicker allowed in FLEX';
  exception when sqlstate '22023' then blocked := blocked + 1; end;

  -- Seven, not six: the old single "locked week" attack became two, because a
  -- per-player lock has two ways to be broken — taking a playing man out, and
  -- putting one in.
  if blocked <> 7 then
    raise exception 'FAIL: only %/7 attacks blocked', blocked;
  end if;

  -- ---- happy path -------------------------------------------------------
  v_lineup := public.set_lineup(2026, 1::smallint, open_week, jsonb_build_array(
    jsonb_build_object('slot','QB',  'card_instance_id', qb),
    jsonb_build_object('slot','RB1', 'card_instance_id', rb1),
    jsonb_build_object('slot','RB2', 'card_instance_id', rb2),
    jsonb_build_object('slot','WR1', 'card_instance_id', wr1),
    jsonb_build_object('slot','WR2', 'card_instance_id', wr2),
    jsonb_build_object('slot','TE',  'card_instance_id', te),
    jsonb_build_object('slot','FLEX','card_instance_id', wr3),
    jsonb_build_object('slot','K',   'card_instance_id', pk)));

  if v_lineup is null then raise exception 'FAIL: no lineup returned'; end if;

  select count(*) into v_slots from public.lineup_slots where lineup_id = v_lineup;
  if v_slots <> 8 then raise exception 'FAIL: wrote % slots, expected 8', v_slots; end if;

  -- resubmitting before lock replaces rather than duplicating
  perform public.set_lineup(2026, 1::smallint, open_week,
    jsonb_build_array(jsonb_build_object('slot','QB','card_instance_id',qb)));

  select count(*) into v_slots   from public.lineup_slots where lineup_id = v_lineup;
  -- Scoped to the open week. This suite now also holds a week-93 lineup, set up
  -- to give the per-player lock something already in place to defend, and an
  -- unqualified count() would read it as a duplicate.
  select count(*) into v_lineups
    from public.lineups
   where user_id = a and season = 2026 and season_type = 1 and week = open_week;
  if v_slots   <> 1 then raise exception 'FAIL: resubmit left % slots, expected 1', v_slots; end if;
  if v_lineups <> 1 then raise exception 'FAIL: resubmit created a second lineup'; end if;

  raise notice 'PASS: %/7 attacks blocked; per-player locks hold both ways; 8-slot lineup written; resubmit replaced it', blocked;
end $$;

reset role;
rollback;
