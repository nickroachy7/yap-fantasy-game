-- Demo managers, so the leaderboard can be looked at.
--
-- WHY THIS EXISTS. Every board on the Leaderboard screen ranks the community
-- against itself, and the community is currently one account. A board of one is
-- not a smaller version of a board of fifty — it is a different screen: movement
-- can only ever read NEW (there is no previous standing to move from), no row
-- can be behind another, and the "1 of 1" in every panel makes the ranking look
-- broken rather than empty. None of the design can be judged against it.
--
-- So this seeds seven managers with the histories the six boards read: scored
-- weeks, collections spread across all four tiers, sold and burnt copies, and
-- set claims. It is DEV DATA and it is meant to be deleted.
--
-- REVERSIBLE, AND THAT IS THE POINT. Every row hangs off an `auth.users` row in
-- the `d0d0d0d0-` namespace, and every table that references a user cascades on
-- delete — profiles, card_instances, lineups, gems, set claims. So the teardown
-- is one DELETE and it cannot leave anything behind:
--
--   psql "$DATABASE_URL" -f scripts/unseed-demo-managers.sql
--
-- NOTHING BELONGING TO A REAL ACCOUNT IS TOUCHED. No UPDATE or DELETE here has
-- a predicate wider than the demo namespace, so the live account's cards,
-- lineups and claims are not read from and not written to. In particular it
-- does NOT invent scored weeks for the real user — that would be fabricating
-- somebody's actual record, and it is the one thing this must not do.
--
-- IDEMPOTENT. Re-running replaces the demo managers rather than doubling them.
--
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/seed-demo-managers.sql

begin;

-- Clear any previous run first, so this is a replace rather than an append.
delete from auth.users where id::text like 'd0d0d0d0-%';

-- ---------------------------------------------------------------- managers
--
-- Seven, which is enough for a podium, a midfield and a tail. The handles are
-- deliberately varied in LENGTH — `kp` against `Waiver Wire Willy` — because
-- the row has to hold both without the numbers moving, and a fixture of
-- same-sized names would never show it.
create temporary table demo_mgr (
  i        integer primary key,
  uid      uuid,
  handle   text,
  cards    integer,
  -- Points in preseason weeks 1, 2 and 3. Weeks 1 and 2 are final, so those
  -- two are what the record board grades; week 3 is live and is not graded.
  wk1      numeric,
  wk2      numeric,
  wk3      numeric,
  -- How many of their copies have been played, which is what earns tier.
  played   integer
) on commit drop;

insert into demo_mgr (i, uid, handle, cards, wk1, wk2, wk3, played) values
  (1, 'd0d0d0d0-0000-0000-0000-000000000001', 'dmb',                74, 121.4, 148.2, 133.8, 22),
  (2, 'd0d0d0d0-0000-0000-0000-000000000002', 'Tuesday Night Lights', 61, 118.9, 96.5, 141.7, 15),
  (3, 'd0d0d0d0-0000-0000-0000-000000000003', 'frostbyte',          52, 104.2, 131.0, 88.4, 11),
  (4, 'd0d0d0d0-0000-0000-0000-000000000004', 'sarah_j',            38, 92.7, 110.3, 119.2, 8),
  (5, 'd0d0d0d0-0000-0000-0000-000000000005', 'end_around',         29, 88.1, 74.6, 102.9, 5),
  (6, 'd0d0d0d0-0000-0000-0000-000000000006', 'Waiver Wire Willy',  21, 66.3, 81.9, 70.4, 3),
  (7, 'd0d0d0d0-0000-0000-0000-000000000007', 'kp',                 12, 41.8, 58.2, 49.6, 1);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', m.uid, 'authenticated', 'authenticated',
       'demo' || m.i || '@demo.invalid', '', now(), now(), now()
  from demo_mgr m;

-- `on_auth_user_created` has written a profile for each; name them.
update public.profiles p set display_name = m.handle
  from demo_mgr m where p.id = m.uid;

-- ---------------------------------------------------------------- collections
--
-- Each manager gets a slice of the mintable pool, offset by their index so no
-- two hold the same cards, and career_fp is assigned by position in the slice
-- so every shelf spans the tiers. The thresholds are bronze 0 / silver 200 /
-- gold 750 / diamond 2500.
--
-- BOTH POINT COLUMNS GET THE SAME FIGURE, and the tier depends on the second.
-- `card_instances_sync_tier` used to derive tier from career_fp on insert, so
-- setting the points was the whole job. Since 20260821140000 it derives from
-- `settled_fp` — the total restricted to weeks that are over — so that a live
-- swing cannot promote a card and then take it back. A seeded shelf is entirely
-- fabricated history, every week of it notionally finished, so the two columns
-- are equal here by definition. Writing only career_fp would insert 392 cards
-- at a default settled_fp of 0 and every shelf would come out bronze.
--
-- The figure is computed once in the subquery and used twice, rather than the
-- CASE being written out under both names: they are not two decisions that
-- happen to agree, they are one number.
insert into public.card_instances (user_id, card_id, career_fp, settled_fp, lineup_starts, acquired_at)
select uid, card_id, fp, fp, starts, acquired_at
  from (
select m.uid,
       c.id as card_id,
       case
         -- One diamond at the top of the two biggest shelves only, so the tier
         -- means something on the board rather than being universal.
         when c.rn = 1 and m.i <= 2 then 2500 + (m.i * 137 + 90) % 900
         -- Gold thins out down the board: four for the leader, none below 5th.
         -- A fixed count gave every manager exactly three and flattened the
         -- valuation the collection board ranks by.
         when c.rn <= greatest(0, 5 - m.i) then 760 + (m.i * 211 + c.rn * 97) % 1500
         when c.rn <= m.played then 205 + (m.i * 173 + c.rn * 131) % 520
         when c.rn <= m.played + 8 then 15 + (c.rn * 47) % 170
         else 0
       end as fp,
       case when c.rn <= m.played then 3 + (c.rn % 9) else 0 end as starts,
       now() - (c.rn || ' hours')::interval as acquired_at
  from demo_mgr m
  join lateral (
    select s.id, row_number() over () as rn
      from (
        select id from public.cards
         where is_mintable and season = 2026
         order by id
         offset m.i * 90
         limit m.cards
      ) s
  ) c on true
  ) seeded;

-- Four duplicates each, so CARDS and UNIQUE differ on the collection board —
-- the gap between those two columns is the whole point of showing both.
--
-- Taken from the TAIL of each shelf. Picking the lowest ids took the cards the
-- block above had just given points to, which the `career_fp = 0` filter then
-- discarded — so only the two smallest managers ended up with any duplicates
-- at all and the column looked broken rather than sparse.
with unplayed as (
  select ci.id, ci.user_id, ci.card_id,
         row_number() over (partition by ci.user_id order by ci.id desc) as rn
    from public.card_instances ci
    join demo_mgr m on m.uid = ci.user_id
   where ci.career_fp = 0
)
insert into public.card_instances (user_id, card_id, career_fp, lineup_starts)
select user_id, card_id, 0, 0 from unplayed where rn <= 4;

-- Sold and burnt copies. Both must vanish from every board, and a board with
-- none of either has never proved that they do.
update public.card_instances ci
   set sold_at = now() - interval '2 days', sold_for = 40
 where ci.user_id in (select uid from demo_mgr where i in (2, 5))
   and ci.id in (
     select id from public.card_instances x
      where x.user_id = ci.user_id and x.career_fp = 0 order by x.id desc limit 2
   );

-- ---------------------------------------------------------------- weeks
--
-- Preseason weeks 1 and 2 are final; week 3 is the slate in play. All three are
-- scored, so the points and best-week boards read all three, and the record
-- board grades only the two that are over.
--
-- `scored_at` and `finalized_at` are both set, and they are NOT the same claim.
-- Since 20260821140000 the live sweep stamps scored_at on every pass, so it is
-- non-null from the first snap of a week and says only "this was recomputed
-- recently"; finalized_at is what says the week is over. Seeding scored_at
-- alone would leave weeks 1 and 2 looking like they were still being played,
-- which is the exact confusion those two columns were split to end.
--
-- `week_is_complete` is asked rather than the week number being hardcoded, so a
-- reseed against a schedule that has moved on stays truthful instead of
-- asserting a fact about preseason week 2 that stopped being true.
insert into public.lineups (user_id, season, season_type, week, total_points, scored_at, finalized_at, submitted_at)
select m.uid, 2026, 1::smallint, w.week, w.pts, now(),
       case when public.week_is_complete(2026, 1::smallint, w.week) then now() end,
       now() - interval '3 days'
  from demo_mgr m
  cross join lateral (values (1, m.wk1), (2, m.wk2), (3, m.wk3)) w(week, pts);

-- A lineup with no slots is not an entrant to the median — see median_record —
-- so every one of these gets one.
insert into public.lineup_slots (lineup_id, slot, card_instance_id)
select l.id, 'QB', (
    select ci.id from public.card_instances ci
     where ci.user_id = l.user_id and ci.is_held order by ci.id limit 1
  )
  from public.lineups l
 where l.user_id in (select uid from demo_mgr);

-- ---------------------------------------------------------------- sets
--
-- Rungs on team ladders, plus dailies, plus the copies burnt to earn them. The
-- ladders pay at 25 / 50 / 75 / 100 percent; a claim row is what "paid" means.
insert into public.set_milestone_claims (user_id, set_id, threshold_pct, committed_at_claim, reward_gems)
select m.uid, s.id, t.pct, t.pct / 5, t.pct * 4
  from demo_mgr m
  join lateral (
    select id from public.card_sets
     where is_active and family = 'team' order by sort_order offset m.i limit greatest(1, 5 - m.i)
  ) s on true
  cross join lateral (
    select pct from (values (25), (50), (75), (100)) v(pct)
     -- The further down the board, the fewer rungs cleared.
     where pct <= greatest(25, 125 - m.i * 25)
  ) t
 where m.i <= 5;

-- Dailies are a separate family and are counted apart from team rungs.
insert into public.set_milestone_claims (user_id, set_id, threshold_pct, committed_at_claim, reward_gems)
select m.uid, s.id, 100, 3, 40
  from demo_mgr m
  join lateral (
    select id from public.card_sets where is_active and family = 'daily' limit 1
  ) s on true
 where m.i <= 6;

-- The price paid: copies burnt into a set. Committed cards leave the collection
-- exactly as sold ones do.
-- One row per (manager, card) picked first, then four each. DISTINCT ON rather
-- than a correlated subquery because `card_instances_one_per_set_slot` refuses
-- two copies of one player in the same set — a set is a checklist, so holding
-- three copies must not tick the slot three times — and the duplicates seeded
-- above are exactly the rows that would hit it.
with distinct_copies as (
  select distinct on (ci.user_id, ci.card_id) ci.id, ci.user_id
    from public.card_instances ci
    join demo_mgr m on m.uid = ci.user_id and m.i <= 5
   where ci.career_fp = 0 and ci.sold_at is null
   order by ci.user_id, ci.card_id, ci.id
),
burn as (
  select id from (
    select id, row_number() over (partition by user_id order by id) as rn
      from distinct_copies
  ) s where rn <= 4
)
update public.card_instances ci
   set committed_at = now() - interval '1 day',
       committed_to = (select id from public.card_sets
                        where is_active and family = 'team' order by sort_order limit 1),
       committed_for = 8
  from burn b
 where ci.id = b.id;

commit;

-- What the boards will now show.
select p.display_name,
       (select count(*) from public.card_instances ci where ci.user_id = p.id and ci.is_held) as held,
       (select count(*) from public.lineups l where l.user_id = p.id and l.scored_at is not null) as weeks,
       (select count(*) from public.set_milestone_claims c where c.user_id = p.id) as claims
  from public.profiles p
 where p.id::text like 'd0d0d0d0-%'
 order by held desc;
