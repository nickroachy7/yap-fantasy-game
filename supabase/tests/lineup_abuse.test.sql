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

insert into public.card_instances (user_id, card_id)
select c.id from public.cards c join public.players p on p.id = c.player_id
where c.season = 2026 and p.position_abbreviation = 'QB'
  and c.id not in (select card_id from public.card_instances)
order by c.id limit 1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  a  constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  b  constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  qb uuid; rb1 uuid; rb2 uuid; wr1 uuid; wr2 uuid; wr3 uuid; te uuid; pk uuid; foreign_qb uuid;
  v_lineup uuid; v_slots int; v_lineups int; blocked int := 0;

  -- preseason wk1 kicked off 2026-08-07 (locked); wk3 starts 2026-08-21 (open)
  locked_week   constant int := 1;
  open_week     constant int := 3;
begin
  select ci.id into qb  from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='QB' order by ci.id limit 1;
  select ci.id into rb1 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='RB' order by ci.id limit 1;
  select ci.id into rb2 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='RB' order by ci.id offset 1 limit 1;
  select ci.id into wr1 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='WR' order by ci.id limit 1;
  select ci.id into wr2 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='WR' order by ci.id offset 1 limit 1;
  select ci.id into wr3 from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='WR' order by ci.id offset 2 limit 1;
  select ci.id into te  from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='TE' order by ci.id limit 1;
  select ci.id into pk  from public.card_instances ci join public.cards c on c.id=ci.card_id join public.players p on p.id=c.player_id where ci.user_id=a and p.position_abbreviation='PK' order by ci.id limit 1;
  select ci.id into foreign_qb from public.card_instances ci where ci.user_id=b limit 1;

  -- 1. a week that has already kicked off
  begin
    perform public.set_lineup(2026, 1::smallint, locked_week,
      jsonb_build_array(jsonb_build_object('slot','QB','card_instance_id',qb)));
    raise exception 'FAIL: wrote a lineup for a locked week';
  exception when sqlstate '55006' then blocked := blocked + 1; end;

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

  if blocked <> 6 then
    raise exception 'FAIL: only %/6 attacks blocked', blocked;
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
  select count(*) into v_lineups from public.lineups;
  if v_slots   <> 1 then raise exception 'FAIL: resubmit left % slots, expected 1', v_slots; end if;
  if v_lineups <> 1 then raise exception 'FAIL: resubmit created a second lineup'; end if;

  raise notice 'PASS: 6/6 attacks blocked; 8-slot lineup written; resubmit replaced it';
end $$;

reset role;
rollback;
