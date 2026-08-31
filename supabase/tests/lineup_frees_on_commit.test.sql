-- Yap Fantasy — a committed card must leave every lineup that can still be played
--
-- This suite exists because of one live bug, and it reproduces the exact shape
-- of it rather than the tidy version.
--
-- WHAT HAPPENED. `score_week` stamped `scored_at` on a preseason week whose
-- sixteen games were all still `scheduled` and days away. `commit_card_to_set`
-- frees a burnt card from the lineups it is standing in, but only from lineups
-- `where scored_at is null` — so that premature stamp switched the freeing off
-- for the UPCOMING week. Five committed cards stayed in that lineup as dead
-- references, and because `set_lineup` refuses the WHOLE slot map if any one
-- card is not held, every autosave from then on failed with "card does not
-- belong to you" no matter which slot the player edited.
--
-- The thing that must hold, stated so it cannot rot:
--
--   A CARD BURNT INTO A SET LEAVES EVERY LINEUP THAT HAS NOT BEEN FINALIZED,
--   whatever `scored_at` happens to say, and `set_lineup` still accepts the
--   lineup afterwards.
--
-- `finalized_at` is the test rather than `scored_at` because it is the one that
-- means history: `settle_week_payouts` sets it when every game is final and the
-- coins have been paid, which is the point after which rewriting a lineup would
-- take back a payout. A `scored_at` can be stamped on a week nobody has played.
--
-- THE ROLE SWITCHING IS NOT DECORATION. Every write under test runs as
-- `authenticated`, because RLS does not apply to the table owner and the owner
-- is who psql connects as. Setup runs as the owner.
--
-- Runs inside a transaction that is rolled back, so it is safe against any
-- environment including production.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/lineup_frees_on_commit.test.sql

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '81111111-1111-1111-1111-111111111111',
        'authenticated', 'authenticated', 'freed@test.local', '', now(), now(), now());

insert into public.coin_balances (user_id, balance) values
  ('81111111-1111-1111-1111-111111111111', 100)
on conflict (user_id) do update set balance = 100;

insert into public.teams (external_id, abbreviation, full_name, conference, division)
values (9501, 'FRE', 'Freed Test Club', 'AFC', 'NORTH');

-- One quarterback, so the fixture can use the QB slot without dragging in the
-- eligibility rules the lineup suites already cover.
insert into public.players (external_id, first_name, last_name, position, position_abbreviation, team_id)
values (9501, 'Freed', 'Passer', 'QB', 'QB', (select id from public.teams where external_id = 9501));

insert into public.cards (player_id, season, rarity)
select p.id, 2026, 'common' from public.players p where p.external_id = 9501;

insert into public.card_instances (user_id, card_id, settled_fp, career_fp)
select '81111111-1111-1111-1111-111111111111', c.id, 0, 0
  from public.cards c
  join public.players p on p.id = c.player_id
 where p.external_id = 9501;

-- THE WEEK THAT CAUSED IT: every game still `scheduled`, kicking off days from
-- now. Nothing about this week has been played.
insert into public.games (external_id, season, season_type, week, home_team_id, visitor_team_id,
                          starts_at, status, status_state)
values (995001, 2026, 1, 44,
        (select id from public.teams where external_id = 9501),
        (select id from public.teams where external_id = 9501),
        now() + interval '3 days', 'Scheduled', 'scheduled');

-- THE STAMP. This is the whole fixture: a lineup for a week that has not
-- happened, carrying a scored_at anyway, and NOT finalized.
insert into public.lineups (id, user_id, season, season_type, week, scored_at, finalized_at)
values ('83333333-3333-3333-3333-333333333333', '81111111-1111-1111-1111-111111111111',
        2026, 1, 44, now() - interval '3 days', null);

insert into public.lineup_slots (lineup_id, slot, card_instance_id)
select '83333333-3333-3333-3333-333333333333', 'QB', ci.id
  from public.card_instances ci
  join public.cards c on c.id = ci.card_id
  join public.players p on p.id = c.player_id
 where p.external_id = 9501;

insert into public.card_sets (id, code, name, family, subtitle, season, required_count, sort_order)
values ('84444444-4444-4444-4444-444444444444', 'test-freed-2026', 'Freed Set', 'team', 'AFC North', 2026, 1, 999);

insert into public.card_set_members (set_id, card_id)
select '84444444-4444-4444-4444-444444444444', c.id
  from public.cards c join public.players p on p.id = c.player_id
 where p.external_id = 9501;

insert into public.card_set_milestones (set_id, threshold_pct, reward_coins)
values ('84444444-4444-4444-4444-444444444444', 100, 10);

-- ------------------------------------------------------------ the fixture is real

do $$
declare v_scored timestamptz; v_final timestamptz; v_slots integer;
begin
  select scored_at, finalized_at into v_scored, v_final
    from public.lineups where id = '83333333-3333-3333-3333-333333333333';

  -- If either of these stops being true the suite is no longer reproducing the
  -- bug, and a green result would mean nothing.
  if v_scored is null then
    raise exception 'FAIL: the fixture lineup is not scored, so it does not reproduce the bug';
  end if;
  if v_final is not null then
    raise exception 'FAIL: the fixture lineup is finalized, which is the case that SHOULD be untouched';
  end if;

  select count(*) into v_slots
    from public.lineup_slots where lineup_id = '83333333-3333-3333-3333-333333333333';
  if v_slots <> 1 then
    raise exception 'FAIL: the fixture lineup has % slots, expected 1', v_slots;
  end if;
end;
$$;

-- ------------------------------------------------------------------- the commit

set local role authenticated;
set local request.jwt.claims = '{"sub":"81111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  r jsonb; v_card uuid; v_slots integer;
begin
  select c.id into v_card
    from public.cards c join public.players p on p.id = c.player_id
   where p.external_id = 9501;

  r := public.commit_card_to_set('test-freed-2026', v_card);

  -- THE ASSERTION THE BUG WOULD HAVE FAILED. Under `scored_at is null` the
  -- delete never ran, the slot survived pointing at a burnt card, and every
  -- later set_lineup call was refused because of it.
  select count(*) into v_slots
    from public.lineup_slots where lineup_id = '83333333-3333-3333-3333-333333333333';

  if v_slots <> 0 then
    raise exception 'FAIL: committing left % slot(s) in a scored-but-unplayed lineup pointing at a burnt card', v_slots;
  end if;

  -- And the commit reports it, so the client can say the lineup lost a starter.
  if (r ->> 'lineup_freed') <> 'true' then
    raise exception 'FAIL: the commit did not report freeing a lineup slot';
  end if;
end;
$$;

-- ------------------------------------------------- and the lineup still saves
--
-- The point of the whole exercise. `set_lineup` refuses the WHOLE slot map if
-- one card is not held, so the real test of the repair is not that a row
-- vanished — it is that the player can save again afterwards.

do $$
declare ok boolean := true; msg text;
begin
  begin
    perform public.set_lineup(2026, 1::smallint, 44, '[]'::jsonb);
  exception when others then
    ok := false; msg := sqlerrm;
  end;

  if not ok then
    raise exception 'FAIL: set_lineup still refuses after the commit freed the slot: %', msg;
  end if;
end;
$$;

-- ------------------------------------------------------ finalized is untouched
--
-- The other half of the rule, and the one that protects a paid-out week. A
-- lineup that HAS been finalized keeps its slots even when the card is burnt,
-- because those slots are the record of what was started and a payout has been
-- made against them.

reset role;

insert into public.games (external_id, season, season_type, week, home_team_id, visitor_team_id,
                          starts_at, status, status_state)
values (995002, 2026, 1, 43,
        (select id from public.teams where external_id = 9501),
        (select id from public.teams where external_id = 9501),
        now() - interval '10 days', 'Final', 'final');

insert into public.players (external_id, first_name, last_name, position, position_abbreviation, team_id)
values (9502, 'Settled', 'Passer', 'QB', 'QB', (select id from public.teams where external_id = 9501));

insert into public.cards (player_id, season, rarity)
select p.id, 2026, 'common' from public.players p where p.external_id = 9502;

insert into public.card_instances (user_id, card_id, settled_fp, career_fp)
select '81111111-1111-1111-1111-111111111111', c.id, 0, 0
  from public.cards c join public.players p on p.id = c.player_id
 where p.external_id = 9502;

insert into public.lineups (id, user_id, season, season_type, week, scored_at, finalized_at)
values ('85555555-5555-5555-5555-555555555555', '81111111-1111-1111-1111-111111111111',
        2026, 1, 43, now() - interval '9 days', now() - interval '8 days');

insert into public.lineup_slots (lineup_id, slot, card_instance_id)
select '85555555-5555-5555-5555-555555555555', 'QB', ci.id
  from public.card_instances ci
  join public.cards c on c.id = ci.card_id
  join public.players p on p.id = c.player_id
 where p.external_id = 9502;

insert into public.card_sets (id, code, name, family, subtitle, season, required_count, sort_order)
values ('86666666-6666-6666-6666-666666666666', 'test-settled-2026', 'Settled Set', 'team', 'AFC North', 2026, 1, 999);

insert into public.card_set_members (set_id, card_id)
select '86666666-6666-6666-6666-666666666666', c.id
  from public.cards c join public.players p on p.id = c.player_id
 where p.external_id = 9502;

insert into public.card_set_milestones (set_id, threshold_pct, reward_coins)
values ('86666666-6666-6666-6666-666666666666', 100, 10);

set local role authenticated;
set local request.jwt.claims = '{"sub":"81111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare r jsonb; v_card uuid; v_slots integer;
begin
  select c.id into v_card
    from public.cards c join public.players p on p.id = c.player_id
   where p.external_id = 9502;

  r := public.commit_card_to_set('test-settled-2026', v_card);

  select count(*) into v_slots
    from public.lineup_slots where lineup_id = '85555555-5555-5555-5555-555555555555';

  if v_slots <> 1 then
    raise exception 'FAIL: committing rewrote a FINALIZED lineup — that slot is the record of a week already paid out';
  end if;

  if (r ->> 'lineup_freed') = 'true' then
    raise exception 'FAIL: the commit reported freeing a slot from a finalized lineup';
  end if;
end;
$$;

rollback;
