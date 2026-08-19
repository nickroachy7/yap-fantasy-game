-- Yap Fantasy — card rarity bands
--
-- `assign_card_rarity()` rewrites the scarcity of all 968 card templates in one
-- statement. It runs against live data that changes every week of the season, so
-- the interesting failures are not "does it run" but "does it still mean what we
-- said it means once the numbers move".
--
-- The suite deliberately DESTROYS the banding first — every card back to
-- common/fallback, which is the exact pre-migration state — and then proves the
-- function rebuilds it. Asserting against bands that were already correct when
-- the suite started would pass even if the function body were deleted.
--
-- Runs inside a transaction that is rolled back, so it is safe against any
-- environment including production.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rarity.test.sql

begin;

do $$
declare
  v_season   constant integer := 2026;
  r          jsonb;
  v_changed  integer;
  v_bad      integer;
  v_pos      text;
  v_min_leg  numeric;
  v_max_com  numeric;
  v_a        text;
  v_b        text;
  v_n        integer;
begin
  -- ------------------------------------------------------------------ setup
  -- Wipe the banding back to how the set looked before task 13.
  update public.cards
     set rarity = 'common', rarity_source = 'fallback'
   where season = v_season and is_mintable;

  -- 1. The function rebuilds from a flat set, and reports how much it moved.
  r := public.assign_card_rarity(v_season);
  v_changed := (r->>'cards_changed')::integer;
  if v_changed = 0 then
    raise exception 'FAIL: assign_card_rarity changed nothing from a flattened set';
  end if;
  if (r->>'production_season')::integer <> v_season - 1 then
    raise exception 'FAIL: banded on production season %, expected %',
      r->>'production_season', v_season - 1;
  end if;

  -- 2. IDEMPOTENT. A second run must be a genuine no-op, not merely a run that
  --    lands on the same answer while rewriting every row: rarity_updated_at is
  --    supposed to mean "when this card's band last changed".
  r := public.assign_card_rarity(v_season);
  if (r->>'cards_changed')::integer <> 0 then
    raise exception 'FAIL: re-running assign_card_rarity changed % rows, expected 0',
      r->>'cards_changed';
  end if;

  -- 3. No mintable card is left on the fallback source. This is the whole point:
  --    open_pack() escapes to "any mintable card" when a band comes up empty, and
  --    while every card was common/fallback that escape fired on every pull.
  select count(*) into v_bad
    from public.cards
   where season = v_season and is_mintable and rarity_source <> 'season_stats';
  if v_bad > 0 then
    raise exception 'FAIL: % mintable cards still carry a non-season_stats rarity_source', v_bad;
  end if;

  -- 4. Every position group is spread across more than one band.
  --    A global ranking by fantasy points was measured and rejected precisely
  --    because it pins PK and TE to the bottom for ever — the best kicker alive
  --    cannot out-score a mid-tier QB. If someone reverts to a global rank, this
  --    is the assertion that catches it.
  for v_pos, v_n in
    select p.position_abbreviation, count(distinct c.rarity)
      from public.cards c
      join public.players p on p.id = c.player_id
     where c.season = v_season and c.is_mintable
       and p.position_abbreviation is not null
     group by 1
  loop
    if v_n < 2 then
      raise exception 'FAIL: position % occupies only % band(s)', v_pos, v_n;
    end if;
  end loop;

  -- 4b. Sharper version of the same thing: the two positions a global ranking
  --     starves must actually reach the top band, not merely span two bands.
  for v_pos in select unnest(array['PK','TE']) loop
    select count(*) into v_n
      from public.cards c
      join public.players p on p.id = c.player_id
     where c.season = v_season and c.is_mintable
       and p.position_abbreviation = v_pos
       and c.rarity = 'legendary';
    if v_n = 0 then
      raise exception 'FAIL: position % has no legendary card — ranking is not within position', v_pos;
    end if;
  end loop;

  -- 5. THE ONE THAT MATTERS. Band ordering must be monotone in production,
  --    within position. Recomputed here from source rather than reusing the
  --    function's own CTEs, so a bug in the ranking cannot validate itself.
  for v_pos, v_min_leg, v_max_com in
    with prod as (
      select c.id as card_id,
             p.position_abbreviation as pos,
             c.rarity,
             (select round(sum(fp.points), 2)
                from public.stat_lines sl
                join public.fantasy_points fp
                  on fp.stat_line_id = sl.id
                 and fp.rules_version = (select version from public.scoring_rules where is_active limit 1)
               where sl.player_id = c.player_id
                 and sl.season = v_season - 1
                 and sl.season_type = 2) as fp
        from public.cards c
        join public.players p on p.id = c.player_id
       where c.season = v_season and c.is_mintable
         and p.position_abbreviation is not null
    )
    select pos,
           min(fp) filter (where rarity = 'legendary'),
           max(fp) filter (where rarity = 'common')
      from prod group by pos
  loop
    if v_min_leg is null then
      raise exception 'FAIL: position % has a legendary card with no production at all', v_pos;
    end if;
    -- max() ignores NULLs, so v_max_com is the best-producing COMMON card at the
    -- position; the no-signal commons do not mask a mis-band here.
    if v_max_com is not null and v_max_com >= v_min_leg then
      raise exception 'FAIL: at % a common card scored % but the weakest legendary scored %',
        v_pos, v_max_com, v_min_leg;
    end if;
  end loop;

  -- 5b. The full ladder, not just its ends: every adjacent pair of bands must be
  --     ordered the same way at every position.
  for v_pos, v_a, v_b in
    with prod as (
      select p.position_abbreviation as pos,
             c.rarity::text as rarity,
             (select round(sum(fp.points), 2)
                from public.stat_lines sl
                join public.fantasy_points fp
                  on fp.stat_line_id = sl.id
                 and fp.rules_version = (select version from public.scoring_rules where is_active limit 1)
               where sl.player_id = c.player_id
                 and sl.season = v_season - 1
                 and sl.season_type = 2) as fp
        from public.cards c
        join public.players p on p.id = c.player_id
       where c.season = v_season and c.is_mintable
         and p.position_abbreviation is not null
    ),
    edges as (
      select pos, rarity, min(fp) as lo, max(fp) as hi
        from prod group by pos, rarity
    ),
    ord as (
      select pos, rarity, lo, hi,
             array_position(array['common','uncommon','rare','epic','legendary'], rarity) as ix
        from edges
    )
    select a.pos, a.rarity, b.rarity
      from ord a join ord b on b.pos = a.pos and b.ix = a.ix + 1
     where a.hi is not null and b.lo is not null
       and a.hi > b.lo
  loop
    raise exception 'FAIL: at % the best % out-produced the worst % — ladder is inverted',
      v_pos, v_a, v_b;
  end loop;

  -- 6. THE ROOKIE GUARD. A card with no prior-season production must never be
  --    promoted above common. A position with a small signal pool has percentile
  --    cuts that could otherwise reach down into the no-signal tail, which is the
  --    silent way this goes wrong.
  select count(*) into v_bad
    from public.cards c
    join public.players p on p.id = c.player_id
   where c.season = v_season and c.is_mintable
     and c.rarity <> 'common'
     and not exists (
       select 1 from public.stat_lines sl
        where sl.player_id = c.player_id
          and sl.season = v_season - 1
          and sl.season_type = 2
     )
     and not exists (
       select 1 from public.player_season_stats s
        where s.player_id = c.player_id
          and s.season = v_season - 1
          and not s.postseason
          and public.season_base_points(s.raw) is not null
     );
  if v_bad > 0 then
    raise exception 'FAIL: % cards with no % production were banded above common', v_bad, v_season - 1;
  end if;

  -- 7. Tier is a different axis and this function must not have touched it.
  --    Rarity is how hard a card is to PULL; tier is what a card EARNS by being
  --    started. Conflating them is the one modelling mistake that is expensive
  --    to undo once testers own collections.
  select count(*) into v_bad
    from public.card_instances where tier <> 'bronze' and career_fp = 0;
  if v_bad > 0 then
    raise exception 'FAIL: % card_instances have a tier unsupported by career_fp', v_bad;
  end if;

  raise notice 'rarity: all assertions passed (% cards rebanded from flat)', v_changed;
end $$;

rollback;
