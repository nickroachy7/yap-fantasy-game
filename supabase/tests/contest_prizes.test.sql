-- Yap Fantasy — contest prizes and the field (20260826010000 .. 20260826030000)
--
-- A paid contest pays coins back, and every assertion here is about the one
-- property that makes that safe: THE POOL IS COLLECTED FEES AND NEVER A GRANT.
-- Redistribution cannot inflate the economy; a prize funded from anywhere else
-- inverts the arithmetic that set the entry fee in the first place, and does it
-- most severely when the field is thinnest.
--
-- So the things worth failing over are:
--
--   * the pool never exceeds what was actually taken, whatever the columns say
--   * a refunded entry withdraws from the pool it paid into
--   * payouts sum to no more than the pool, ties included
--   * paying twice pays once — a prize is money and settlement is re-run by hand
--   * a rival's lineup is unreadable until every card in it has kicked off
--
-- Weeks 88-89 are far outside any real slate — same convention as the others.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/contest_prizes.test.sql

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','88888888-0000-0000-0000-000000000001','authenticated','authenticated','p1@t.local','',now(),now(),now()),
       ('00000000-0000-0000-0000-000000000000','88888888-0000-0000-0000-000000000002','authenticated','authenticated','p2@t.local','',now(),now(),now()),
       ('00000000-0000-0000-0000-000000000000','88888888-0000-0000-0000-000000000003','authenticated','authenticated','p3@t.local','',now(),now(),now());

-- The suite's own pool. Two teams, because the reveal rule is decided by
-- KICKOFFS and the only way to have one lineup locked and another still open is
-- to have their players in different games.
insert into public.teams (external_id, abbreviation, full_name)
values (9881, 'EAR', 'Early Club'), (9882, 'LAT', 'Late Club')
on conflict do nothing;

-- Three receivers per player per team. `full_name` is generated, so it is not
-- written here.
insert into public.players (external_id, team_id, first_name, last_name, position, position_abbreviation)
select 98810 + g, t.id, 'Early', 'Wr' || g, 'Wide Receiver', 'WR'
  from generate_series(1,9) g, public.teams t where t.external_id = 9881;
insert into public.players (external_id, team_id, first_name, last_name, position, position_abbreviation)
select 98820 + g, t.id, 'Late', 'Wr' || g, 'Wide Receiver', 'WR'
  from generate_series(1,9) g, public.teams t where t.external_id = 9882;

insert into public.cards (player_id, season)
select p.id, 2026 from public.players p
 where p.external_id between 98811 and 98819 or p.external_id between 98821 and 98829;

-- Three EARLY cards each, which is a whole flex-three lineup per player, plus
-- three LATE cards for the player whose lineup must still be sealed.
insert into public.card_instances (user_id, card_id)
select u.id, c.id
  from (values ('88888888-0000-0000-0000-000000000001'::uuid, 0),
               ('88888888-0000-0000-0000-000000000002'::uuid, 1),
               ('88888888-0000-0000-0000-000000000003'::uuid, 2)) u(id, n)
  cross join generate_series(1,3) k
  join public.players p on p.external_id = 98810 + u.n * 3 + k
  join public.cards   c on c.player_id = p.id;

insert into public.card_instances (user_id, card_id)
select '88888888-0000-0000-0000-000000000003', c.id
  from public.players p join public.cards c on c.player_id = p.id
 where p.external_id between 98821 and 98823;

-- And three more each for the top-two contest. A card plays ONE contest a week,
-- so a player in both needs two lineups' worth — the same rule the lobby's
-- footnote states and the reason small formats exist at all.
insert into public.players (external_id, team_id, first_name, last_name, position, position_abbreviation)
select 98830 + g, t.id, 'Second', 'Wr' || g, 'Wide Receiver', 'WR'
  from generate_series(1,9) g, public.teams t where t.external_id = 9881;

insert into public.cards (player_id, season)
select p.id, 2026 from public.players p where p.external_id between 98831 and 98839;

insert into public.card_instances (user_id, card_id)
select u.id, c.id
  from (values ('88888888-0000-0000-0000-000000000001'::uuid, 0),
               ('88888888-0000-0000-0000-000000000002'::uuid, 1),
               ('88888888-0000-0000-0000-000000000003'::uuid, 2)) u(id, n)
  cross join generate_series(1,3) k
  join public.players p on p.external_id = 98830 + u.n * 3 + k
  join public.cards   c on c.player_id = p.id;

insert into public.coin_balances (user_id, balance)
values ('88888888-0000-0000-0000-000000000001', 500),
       ('88888888-0000-0000-0000-000000000002', 500),
       ('88888888-0000-0000-0000-000000000003', 500)
on conflict (user_id) do update set balance = 500;

-- Two fixtures in week 88, a week out so nothing is locked while entries are
-- filed. The reveal assertions move the early one forward later.
insert into public.games (external_id, season, week, season_type, starts_at, status_state, home_team_id, visitor_team_id)
select 988001, 2026, 88, 1, now() + interval '7 days', 'scheduled', e.id, e.id
  from public.teams e where e.external_id = 9881;
insert into public.games (external_id, season, week, season_type, starts_at, status_state, home_team_id, visitor_team_id)
select 988002, 2026, 88, 1, now() + interval '9 days', 'scheduled', l.id, l.id
  from public.teams l where l.external_id = 9882;

-- Even money, and a top-two so the weighted split has two distinct shares to
-- get wrong. No hearts on either: this suite is about coins, and a run in the
-- middle of it would be a second thing failing for a different reason.
--
-- `payout_curve` IS STATED RATHER THAN LEFT TO THE DEFAULT, and that is the
-- point of it existing. Until `20260901020000` the split was implied by the win
-- condition — `top_n` always weighted by place — so this fixture said `top_n`
-- and meant "2:1" without ever writing it down. It is a column now, because a
-- top-two contest can equally pay its two winners the same (a double-up), and
-- the two are different products. `linear` is the shape this suite asserts, so
-- `linear` is what it asks for.
insert into public.contests (code, kind, format_code, season, season_type, week, name,
                             entry_fee_coins, prize_pool_bps, win_condition, win_rank,
                             payout_curve, hearts_at_risk, hearts_on_win)
values ('test:pool:88', 'lobby', 'flex3', 2026, 1, 88, 'Test Pool', 40, 2500, 'median', null, 'flat', 0, 0),
       ('test:top2:88', 'lobby', 'wr_room', 2026, 1, 88, 'Test Top Two', 40, 2500, 'top_n', 2, 'linear', 0, 0);

-- ---------------------------------------------------------------------------
-- THE CONSTRAINTS, which are the cheapest half of the guarantee.
-- ---------------------------------------------------------------------------
do $$
declare v_ok boolean;
begin
  -- 1. IF IT COSTS COINS IT PAYS COINS. The whole reason this is a constraint and
  --    not a convention is that a seed can forget; the schema cannot.
  begin
    insert into public.contests (code, kind, format_code, season, season_type, week, name,
                                 entry_fee_coins, prize_pool_bps)
    values ('test:nopool:88', 'lobby', 'flex3', 2026, 1, 88, 'No Pool', 40, 0);
    raise exception 'FAIL: a paid contest with no prize pool was accepted';
  exception when check_violation then null;
  end;

  -- 2. AND THE FREE CONTEST PAYS NONE, because it collects nothing — a pool on
  --    it could only ever be minted, which is the one thing forbidden outright.
  begin
    insert into public.contests (code, kind, format_code, season, season_type, week, name,
                                 entry_fee_coins, prize_pool_bps)
    values ('test:freepool:88', 'free', 'main', 2026, 1, 88, 'Free With Pool', 0, 2500);
    raise exception 'FAIL: the free contest was allowed a prize pool';
  exception when check_violation then null;
  end;

  -- 3. A pool nobody has paid into is nought, not a promise.
  select public.contest_prize_pool(id) = 0 into v_ok
    from public.contests where code = 'test:pool:88';
  if not v_ok then raise exception 'FAIL: an unentered contest already had a pool'; end if;

  raise notice 'contest prizes: constraints passed';
end $$;

-- ---------------------------------------------------------------------------
-- AS THE PLAYERS: entering, and what the pool does as they arrive.
-- ---------------------------------------------------------------------------
do $$
declare
  u    uuid;
  n    integer := 0;
  ids  uuid[];
  v_pool integer;
begin
  foreach u in array array['88888888-0000-0000-0000-000000000001'::uuid,
                           '88888888-0000-0000-0000-000000000002'::uuid,
                           '88888888-0000-0000-0000-000000000003'::uuid]
  loop
    n := n + 1;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', u, 'role', 'authenticated')::text, true);

    select array_agg(ci.id order by p.external_id) into ids
      from public.card_instances ci
      join public.cards c   on c.id = ci.card_id
      join public.players p on p.id = c.player_id
     where ci.user_id = u and p.external_id between 98811 and 98819;

    perform public.set_lineup(2026, 1::smallint, 88,
      jsonb_build_array(
        jsonb_build_object('slot','FLEX1','card_instance_id', ids[1]),
        jsonb_build_object('slot','FLEX2','card_instance_id', ids[2]),
        jsonb_build_object('slot','FLEX3','card_instance_id', ids[3])),
      'test:pool:88');

    select array_agg(ci.id order by p.external_id) into ids
      from public.card_instances ci
      join public.cards c   on c.id = ci.card_id
      join public.players p on p.id = c.player_id
     where ci.user_id = u and p.external_id between 98831 and 98839;

    perform public.set_lineup(2026, 1::smallint, 88,
      jsonb_build_array(
        jsonb_build_object('slot','WR1','card_instance_id', ids[1]),
        jsonb_build_object('slot','WR2','card_instance_id', ids[2]),
        jsonb_build_object('slot','WR3','card_instance_id', ids[3])),
      'test:top2:88');

    perform set_config('role', 'postgres', true);

    -- 4. THE POOL IS 25% OF WHAT HAS BEEN TAKEN, and it moves with every entry.
    --    Read back per entrant rather than once at the end, because the failure
    --    this guards against — a pool computed from `entry_fee_coins × entrants`
    --    rather than from the ledger — only diverges once somebody leaves, and
    --    a single end-state check would agree with it right up until then.
    select public.contest_prize_pool(id) into v_pool
      from public.contests where code = 'test:pool:88';
    if v_pool <> n * 10 then
      raise exception 'FAIL: after % entries at 40 coins the pool was % , expected %',
        n, v_pool, n * 10;
    end if;
  end loop;

  raise notice 'contest prizes: the pool tracks the fees passed';
end $$;

-- ---------------------------------------------------------------------------
-- LEAVING TAKES YOUR FEE BACK OUT OF THE POOL.
-- ---------------------------------------------------------------------------
do $$
declare v_pool integer;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"88888888-0000-0000-0000-000000000003","role":"authenticated"}', true);
  perform public.leave_contest('test:pool:88');
  perform set_config('role', 'postgres', true);

  -- 5. Three entries less one refund is two, and the pool says so. A pool that
  --    kept the departed entry's share would be promising coins that are back in
  --    somebody's wallet — the exact overdraft the ledger read exists to make
  --    impossible.
  select public.contest_prize_pool(id) into v_pool
    from public.contests where code = 'test:pool:88';
  if v_pool <> 20 then
    raise exception 'FAIL: pool was % after a refund, expected 20', v_pool;
  end if;

  raise notice 'contest prizes: a refund withdraws from the pool passed';
end $$;

-- ---------------------------------------------------------------------------
-- A PRICE CHANGE CANNOT REWRITE A POOL THAT IS ALREADY PAID IN.
--
-- THIS IS THE ASSERTION THAT PROVES THE LEDGER READ, and it was missing until a
-- mutation test went looking. The obvious wrong implementation is
-- `entry_fee_coins × entrants`, and it agrees with the right one everywhere
-- except here: leaving deletes the lineup, so an entrant COUNT falls with a
-- refund too, and every other case in this file passed under both. Raise the
-- price after people have paid and the two answers finally diverge — the naive
-- one inflating a pool with coins nobody handed over.
-- ---------------------------------------------------------------------------
do $$
declare v_pool integer;
begin
  update public.contests set entry_fee_coins = 60 where code = 'test:pool:88';

  select public.contest_prize_pool(id) into v_pool
    from public.contests where code = 'test:pool:88';
  if v_pool <> 20 then
    raise exception 'FAIL: re-pricing moved a collected pool to %, expected 20', v_pool;
  end if;

  update public.contests set entry_fee_coins = 40 where code = 'test:pool:88';
  raise notice 'contest prizes: a re-priced contest keeps its pool passed';
end $$;

-- ---------------------------------------------------------------------------
-- THE FIELD, AND WHAT IT SAYS ABOUT A LINEUP THAT HAS NOT LOCKED.
-- ---------------------------------------------------------------------------

-- The third player re-enters, with LATE cards, so that when the early fixture
-- kicks off there is one lineup locked and one still open to edits. That
-- distinction used to be a PERMISSION — see `20260830010000`, which traded the
-- reveal rule away — and it is now only a fact the page reports. Both lineups
-- must be readable; only one of them may still change.
do $$
declare ids uuid[];
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"88888888-0000-0000-0000-000000000003","role":"authenticated"}', true);

  select array_agg(ci.id order by p.external_id) into ids
    from public.card_instances ci
    join public.cards c   on c.id = ci.card_id
    join public.players p on p.id = c.player_id
   where ci.user_id = '88888888-0000-0000-0000-000000000003'
     and p.external_id between 98821 and 98823;

  perform public.set_lineup(2026, 1::smallint, 88,
    jsonb_build_array(
      jsonb_build_object('slot','FLEX1','card_instance_id', ids[1]),
      jsonb_build_object('slot','FLEX2','card_instance_id', ids[2]),
      jsonb_build_object('slot','FLEX3','card_instance_id', ids[3])),
    'test:pool:88');
  perform set_config('role', 'postgres', true);
end $$;

-- The early fixture goes; the late one has not.
update public.games set status_state = 'in_progress', starts_at = now() - interval '1 hour'
 where external_id = 988001;

do $$
declare
  v_contest uuid;
  v_locked  boolean;
  v_rows    integer;
begin
  select id into v_contest from public.contests where code = 'test:pool:88';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"88888888-0000-0000-0000-000000000001","role":"authenticated"}', true);

  -- 6. THE WHOLE FIELD IS VISIBLE AS PEOPLE. RLS hides other players' lineups
  --    and must keep doing so; this function is the deliberate exception, and
  --    if it ever stops returning rivals the contest page silently becomes a
  --    list of one.
  select count(*) into v_rows from public.contest_field(v_contest);
  if v_rows <> 3 then
    raise exception 'FAIL: the field held % entrants, expected 3', v_rows;
  end if;

  -- 7. A LINEUP WHOSE CARDS HAVE ALL KICKED OFF READS AS LOCKED.
  select f.locked into v_locked from public.contest_field(v_contest) f
   where f.user_id = '88888888-0000-0000-0000-000000000002';
  if not v_locked then
    raise exception 'FAIL: a fully kicked-off lineup did not read as locked';
  end if;

  -- 8. ONE THAT STILL HOLDS A CARD AHEAD OF KICKOFF DOES NOT. It is a draft,
  --    and the field has to be able to say so — that is the whole of what this
  --    column means now that it no longer gates anything.
  select f.locked into v_locked from public.contest_field(v_contest) f
   where f.user_id = '88888888-0000-0000-0000-000000000003';
  if v_locked then
    raise exception 'FAIL: a lineup with an unplayed card read as locked';
  end if;

  -- 9. AND IT IS READABLE ANYWAY. This is the assertion that replaced the
  --    reveal rule: a rival's lineup is public from the moment it is filed, so
  --    the contest page has people in it during the days anybody is deciding.
  select count(*) into v_rows
    from public.contest_lineup(v_contest, '88888888-0000-0000-0000-000000000003');
  if v_rows <> 3 then
    raise exception 'FAIL: an unlocked lineup handed over % slots, expected 3', v_rows;
  end if;

  -- 10. A STRANGER IS STILL A BAD REQUEST rather than an empty lineup. That is
  --     the one refusal left, and it is what keeps "not in this contest" and
  --     "filed nothing" different answers.
  begin
    perform public.contest_lineup(v_contest, '88888888-0000-0000-0000-000000000009');
    raise exception 'FAIL: a lineup was returned for somebody not in the contest';
  exception when sqlstate '22023' then null;
  end;

  perform set_config('role', 'postgres', true);
  raise notice 'contest prizes: the field passed';
end $$;

-- ---------------------------------------------------------------------------
-- PAYING OUT.
-- ---------------------------------------------------------------------------

-- The week finishes, and the three entries land on distinct scores. Written
-- straight onto the lineups because this suite is about the SPLIT, not about
-- scoring — `live_scoring` owns that end of it.
update public.games set status_state = 'final', starts_at = now() - interval '1 day'
 where season = 2026 and season_type = 1 and week = 88;

update public.lineups l
   set total_points = v.pts, scored_at = now()
  from (values ('88888888-0000-0000-0000-000000000001'::uuid, 90.0),
               ('88888888-0000-0000-0000-000000000002'::uuid, 60.0),
               ('88888888-0000-0000-0000-000000000003'::uuid, 30.0)) v(u, pts)
  join public.contests c on c.code = 'test:pool:88'
 where l.user_id = v.u and l.contest_id = c.id;

-- The same three, ordered the same way, in the top-two contest. Player one wins
-- both — see assertion 13.
update public.lineups l
   set total_points = v.pts, scored_at = now()
  from (values ('88888888-0000-0000-0000-000000000001'::uuid, 100.0),
               ('88888888-0000-0000-0000-000000000002'::uuid, 80.0),
               ('88888888-0000-0000-0000-000000000003'::uuid, 20.0)) v(u, pts)
  join public.contests c on c.code = 'test:top2:88'
 where l.user_id = v.u and l.contest_id = c.id;

do $$
declare
  v_contest uuid;
  v_pool    integer;
  v_paid    integer;
  v_top     integer;
  v_before  integer;
  v_after   integer;
  v_again   integer;
begin
  select id into v_contest from public.contests where code = 'test:pool:88';
  v_pool := public.contest_prize_pool(v_contest);

  -- 11. THE SPLIT NEVER EXCEEDS THE POOL. The single most important assertion
  --     in this file: everything else is presentation, and this is the one that
  --     stops the contest minting coins. Ties share a place under `contest_
  --     results`, so a fixed denominator would overpay — the weights are
  --     normalised by the weights that exist, and this is what proves it.
  select coalesce(sum(coins), 0) into v_paid
    from public.contest_payouts(v_contest);
  if v_paid > v_pool then
    raise exception 'FAIL: payouts of % exceed a pool of %', v_paid, v_pool;
  end if;

  -- 12. UNDER `median`, EVERY WINNER TAKES THE SAME. One of three beat a median
  --     of 60, so the whole pool goes to one player.
  select count(*) into v_paid from public.contest_payouts(v_contest);
  if v_paid <> 1 then
    raise exception 'FAIL: % players were paid, expected the 1 above the median', v_paid;
  end if;
  select coins into v_top from public.contest_payouts(v_contest);
  if v_top <> v_pool then
    raise exception 'FAIL: the lone winner took % of a % pool', v_top, v_pool;
  end if;

  -- 13. A PLAYER CAN WIN TWICE IN A WEEK AND SETTLEMENT SURVIVES IT.
  --     Player one is top of both contests on this slate, which is the ordinary
  --     result of entering two of them and not an edge case. Paid as two ledger
  --     rows and ONE wallet move — the first version wrote two of each and
  --     Postgres refused, taking the whole week's settlement down with it:
  --     score coins, positional bonuses and every run's hearts. See
  --     `20260826040000`.
  --
  -- 13b. PAYING IS EXACTLY ONCE. `settle_week_payouts` is on a schedule AND run
  --     by hand during gameday, so a second call is not an edge case — it is
  --     Sunday evening. The key is the lineup, the same key the entry charge
  --     uses, because the lineup IS the entry.
  select balance into v_before from public.coin_balances
   where user_id = '88888888-0000-0000-0000-000000000001';
  perform public.award_contest_prizes(2026, 1::smallint, 88);
  select balance into v_after from public.coin_balances
   where user_id = '88888888-0000-0000-0000-000000000001';
  -- The pool contest pays them the whole 20; the top-two contest pays them 20
  -- of its 30. Both land in one balance move.
  if v_after <> v_before + v_pool + 20 then
    raise exception 'FAIL: a double winner went from % to %, expected +%',
      v_before, v_after, v_pool + 20;
  end if;

  perform public.award_contest_prizes(2026, 1::smallint, 88);
  select balance into v_again from public.coin_balances
   where user_id = '88888888-0000-0000-0000-000000000001';
  if v_again <> v_after then
    raise exception 'FAIL: a second settlement paid again — % then %', v_after, v_again;
  end if;

  -- 14. AND THE LEDGER KEEPS BOTH PRIZES SEPARATE. One row per entry, because
  --     which contest paid what is the only way to audit that a pool balanced —
  --     the wallet is where they are allowed to merge, not the ledger.
  select count(*) into v_paid from public.coins_ledger
   where reason = 'contest_prize'
     and user_id = '88888888-0000-0000-0000-000000000001';
  if v_paid <> 2 then
    raise exception 'FAIL: % prize rows written for two wins, expected 2', v_paid;
  end if;

  raise notice 'contest prizes: payout and idempotence passed';
end $$;

-- ---------------------------------------------------------------------------
-- `top_n` WEIGHTS BY PLACE.
-- ---------------------------------------------------------------------------
do $$
declare
  v_contest uuid;
  v_pool    integer;
  v_first   integer;
  v_second  integer;
  v_total   integer;
  v_count   integer;
begin
  select id into v_contest from public.contests where code = 'test:top2:88';
  v_pool := public.contest_prize_pool(v_contest);
  if v_pool <> 30 then
    raise exception 'FAIL: three entries at 40 coins gave a pool of %, expected 30', v_pool;
  end if;

  -- 15. TWO PLACES PAY OUT OF THREE ENTRANTS, and the third gets nothing. Under
  --     `median` this same field would have paid the top two equally; the whole
  --     reason a contest states its win condition before a card is committed is
  --     that these are different offers wearing one fee.
  select count(*) into v_count from public.contest_payouts(v_contest);
  if v_count <> 2 then
    raise exception 'FAIL: % players paid in a top-two contest, expected 2', v_count;
  end if;

  -- 16. `linear` WEIGHTS BY PLACE, so top two is 2:1 — not an even split, and
  --     not a hardcoded percentage that would drift the moment the number of
  --     paying places changed. 20 and 10 out of 30.
  select coins into v_first  from public.contest_payouts(v_contest) where rnk = 1;
  select coins into v_second from public.contest_payouts(v_contest) where rnk = 2;
  if v_first <> 20 or v_second <> 10 then
    raise exception 'FAIL: top-two split was %/%, expected 20/10', v_first, v_second;
  end if;

  -- 17. And it still cannot exceed the pool.
  select coalesce(sum(coins), 0) into v_total from public.contest_payouts(v_contest);
  if v_total > v_pool then
    raise exception 'FAIL: weighted payouts of % exceed a pool of %', v_total, v_pool;
  end if;

  raise notice 'contest prizes: the weighted split passed';
end $$;

rollback;
