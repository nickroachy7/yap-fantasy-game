-- A card can now leave a collection TWO ways, so "still yours" stops being a
-- predicate anybody can forget.
--
-- Selling was the only exit, and every consumer therefore wrote `sold_at is
-- null` by hand: the collection view, the lineup guard, both market functions
-- and all four rank pools on the card profile. Committing a card to a set adds
-- a second exit, and the failure mode of adding it column-by-column is not a
-- compile error — it is a committed card that can still be started in a lineup
-- (a slot that silently scores nothing), or that still counts in a rank pool
-- forever. Six places, and getting five of them is indistinguishable from
-- getting all six until somebody notices their team scored 0 at one slot.
--
-- So the predicate becomes a COLUMN. `is_held` is generated and stored, which
-- means it cannot drift from the two timestamps behind it, it can be indexed,
-- and the NEXT way a card leaves a collection is one line here rather than
-- another sweep of the codebase.
--
-- WHY COMMITTING IS A SOFT BURN, exactly as selling is: `lineup_slots
-- .card_instance_id` is ON DELETE CASCADE, so deleting a committed row would
-- silently remove it from every lineup it has ever started in, rewriting
-- scoring history and past leaderboard weeks. The row stays; the collection
-- simply stops returning it.
--
-- The commit MECHANIC itself is the next migration. This one only makes room
-- for it and re-points everything that asks "do you still hold this".

-- ---------------------------------------------------------------- columns

alter table public.card_instances
  add column if not exists committed_at  timestamptz,
  -- Which set it went into. Kept so a deep link to a burnt card can say where
  -- it went rather than just that it is gone.
  add column if not exists committed_to  uuid references public.card_sets on delete set null,
  -- Gems paid at the time of the commit. Frozen, so re-tuning the rate never
  -- rewrites what somebody was actually paid — the same rule sold_for follows.
  add column if not exists committed_for integer check (committed_for is null or committed_for >= 0);

comment on column public.card_instances.committed_at is
  'When this copy was burnt into a set. Non-null means it is gone from the collection and can never be started, sold or un-committed.';

-- A copy you still have: not sold, not committed. Generated and stored so no
-- reader can disagree with it and no writer can forget to maintain it.
alter table public.card_instances
  add column if not exists is_held boolean
  generated always as (sold_at is null and committed_at is null) stored;

comment on column public.card_instances.is_held is
  'True while the copy is still in its owner''s collection. The single predicate for "still yours" — prefer it to testing sold_at or committed_at directly.';

-- The collection reads "mine and still held" on every page of every load.
create index if not exists card_instances_held_idx
  on public.card_instances (user_id)
  where is_held;

-- ONE COPY PER SLOT. A set is a checklist, so holding three copies of a player
-- must not fill his slot three times — the second commit is refused by the
-- index rather than by a check somebody could forget to write. Partial, so it
-- constrains only committed rows.
create unique index if not exists card_instances_one_per_set_slot
  on public.card_instances (user_id, committed_to, card_id)
  where committed_at is not null;

-- ---------------------------------------------------------------- my_collection
--
-- Committed copies leave the inventory. `create or replace view` requires the
-- existing columns in their existing order, so this is the previous definition
-- with one predicate changed.
create or replace view public.my_collection
with (security_invoker = on) as
  select ci.id,
         ci.user_id,
         ci.card_id,
         p.full_name              as player_name,
         p.position_abbreviation,
         t.abbreviation           as team_abbreviation,
         p.injury_status,
         ci.tier,
         ci.career_fp,
         ci.lineup_starts,
         cur.min_career_fp        as tier_floor_fp,
         nxt.min_career_fp        as next_tier_at,
         nxt.tier                 as next_tier_label,
         c.season,
         ci.acquired_at,
         c.player_id,
         cur.sell_value,
         case when coalesce(agg.games_played, 0) > 0
              then round(agg.season_fp / agg.games_played, 1)
         end                      as fp_per_game
    from public.card_instances ci
    join public.cards c   on c.id = ci.card_id
    join public.players p on p.id = c.player_id
    left join public.teams t on t.id = p.team_id
    join public.tier_thresholds cur on cur.tier = ci.tier
    left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1
    left join lateral (
      select sum(fp.points) as season_fp, count(*) as games_played
        from public.stat_lines sl
        join public.fantasy_points fp
          on fp.stat_line_id = sl.id
         and fp.rules_version = (select version from public.scoring_rules where is_active limit 1)
       where sl.player_id = p.id
         and sl.season = c.season
    ) agg on true
   where ci.is_held;

grant select on public.my_collection to authenticated;
revoke all on public.my_collection from anon;

-- ---------------------------------------------------------------- sell_card

create or replace function public.sell_card(p_card_instance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_balance integer;
  v_card    public.card_instances%rowtype;
  v_price   integer;
  v_name    text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Wallet first, then the card. open_pack takes the wallet lock first too, and
  -- two functions that lock the same pair in opposite orders deadlock under
  -- concurrency. Consistent ordering is the cheapest way to never find out.
  select balance into v_balance
    from public.gem_balances
   where user_id = v_user
     for update;

  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;

  -- Row lock, so a double-tap cannot sell the same copy twice: the second call
  -- waits here and then fails the sold_at check below rather than paying out
  -- again. SECURITY DEFINER bypasses RLS, so ownership is checked explicitly.
  select * into v_card
    from public.card_instances
   where id = p_card_instance_id
     and user_id = v_user
     for update;

  if not found then
    raise exception 'card does not belong to you' using errcode = '42501';
  end if;

  if v_card.sold_at is not null then
    raise exception 'card has already been sold' using errcode = '22023';
  end if;

  -- A committed copy is IN a set. It is not yours to sell, and paying out for
  -- it would be paying twice for one card — the commit already paid its share.
  if v_card.committed_at is not null then
    raise exception 'card has been committed to a set' using errcode = '22023';
  end if;

  -- A card still attached to an unscored lineup is either about to play or has
  -- played and not been swept. Selling it would leave a starter that silently
  -- scores nothing, or take the card away while it is still earning. Both are
  -- worse than a refusal the client can explain.
  if exists (
    select 1
      from public.lineup_slots ls
      join public.lineups l on l.id = ls.lineup_id
     where ls.card_instance_id = p_card_instance_id
       and l.scored_at is null
  ) then
    raise exception 'card is in a lineup that has not been scored yet'
      using errcode = '55006';
  end if;

  select sell_value into v_price
    from public.tier_thresholds
   where tier = v_card.tier;

  v_price := coalesce(v_price, 0);

  update public.card_instances
     set sold_at = now(), sold_for = v_price
   where id = p_card_instance_id;

  -- gems_ledger has CHECK (amount <> 0), so a zero-value tier is recorded as a
  -- sale on the card and nothing in the ledger, rather than failing the sale.
  if v_price > 0 then
    update public.gem_balances
       set balance = balance + v_price, updated_at = now()
     where user_id = v_user;

    insert into public.gems_ledger (user_id, amount, reason, reference_id)
    values (v_user, v_price, 'card_sale', p_card_instance_id);
  end if;

  select pl.full_name into v_name
    from public.cards cd
    join public.players pl on pl.id = cd.player_id
   where cd.id = v_card.card_id;

  return jsonb_build_object(
    'card_instance_id', p_card_instance_id,
    'player_name',      v_name,
    'tier',             v_card.tier,
    'sold_for',         v_price,
    'balance',          v_balance + v_price
  );
end;
$$;

revoke execute on function public.sell_card(uuid) from public, anon;
grant  execute on function public.sell_card(uuid) to authenticated;

-- ---------------------------------------------------------------- set_lineup

create or replace function public.set_lineup(
  p_season      integer,
  p_season_type smallint,
  p_week        integer,
  p_slots       jsonb          -- [{"slot":"QB","card_instance_id":"<uuid>"}, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_lock   timestamptz;
  v_lineup uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be a json array' using errcode = '22023';
  end if;

  -- Lock time comes from stored kickoff times, never from the caller.
  v_lock := public.week_lock_time(p_season, p_season_type, p_week);
  if v_lock is null then
    raise exception 'no scheduled games for season % type % week %',
      p_season, p_season_type, p_week using errcode = '22023';
  end if;
  if now() >= v_lock then
    raise exception 'lineup for week % locked at %', p_week, v_lock
      using errcode = '55006';
  end if;

  -- 1. every slot is a real slot
  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
      left join public.lineup_slot_config c on c.slot = x.slot
     where c.slot is null or x.slot is null or x.card_instance_id is null
  ) then
    raise exception 'unknown or malformed lineup slot' using errcode = '22023';
  end if;

  -- 2. a slot appears at most once
  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
     group by x.slot having count(*) > 1
  ) then
    raise exception 'duplicate slot in payload' using errcode = '22023';
  end if;

  -- 3. a card appears at most once (also guarded by a unique index)
  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
     group by x.card_instance_id having count(*) > 1
  ) then
    raise exception 'the same card cannot fill two slots' using errcode = '22023';
  end if;

  -- 4. every card is one the caller actually owns AND still holds.
  --    SECURITY DEFINER bypasses RLS, so ownership is checked explicitly here.
  --    `is_held` is the load-bearing half: a sold OR committed copy is still
  --    your row, and starting one would be a slot that silently scores nothing.
  --    It is a generated column precisely so this check cannot fall behind the
  --    next way a card leaves a collection.
  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
      left join public.card_instances ci
             on ci.id = x.card_instance_id
            and ci.user_id = v_user
            and ci.is_held
     where ci.id is null
  ) then
    raise exception 'card does not belong to you' using errcode = '42501';
  end if;

  -- 5. the player is eligible for the slot, and the card is from this season
  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
      join public.lineup_slot_config c  on c.slot = x.slot
      join public.card_instances     ci on ci.id  = x.card_instance_id
      join public.cards              cd on cd.id  = ci.card_id
      join public.players            p  on p.id   = cd.player_id
     where cd.season <> p_season
        or p.position_abbreviation is null
        or not (p.position_abbreviation = any (c.eligible_positions))
  ) then
    raise exception 'player is not eligible for that slot' using errcode = '22023';
  end if;

  insert into public.lineups (user_id, season, season_type, week)
  values (v_user, p_season, p_season_type, p_week)
  on conflict (user_id, season, season_type, week)
    do update set submitted_at = now()
  returning id into v_lineup;

  -- Replace wholesale. Safe because this path is unreachable after lock, and
  -- before lock every slot's points are still zero.
  delete from public.lineup_slots where lineup_id = v_lineup;

  insert into public.lineup_slots (lineup_id, slot, card_instance_id)
  select v_lineup, x.slot, x.card_instance_id
    from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid);

  return v_lineup;
end;
$$;

revoke execute on function public.set_lineup(integer, smallint, integer, jsonb) from public, anon;
grant  execute on function public.set_lineup(integer, smallint, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------- card_profile

create or replace function public.card_profile(p_card_instance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_card   record;
  v_starts jsonb;
  v_out    jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Ownership gate, before anything definer-rights is read.
  select ci.id, ci.user_id, ci.tier, ci.career_fp, ci.lineup_starts,
         ci.acquired_at, ci.sold_at, ci.sold_for, ci.source,
         ci.committed_at, ci.committed_for, cs.code as committed_set_code,
         cs.name as committed_set_name,
         c.id as card_id, c.season, c.rarity,
         p.id as player_id, p.full_name as player_name,
         p.position_abbreviation, p.injury_status,
         t.abbreviation as team_abbreviation,
         cur.min_career_fp as tier_floor_fp,
         cur.sell_value,
         nxt.min_career_fp as next_tier_at,
         nxt.tier          as next_tier_label
    into v_card
    from public.card_instances ci
    join public.cards   c on c.id = ci.card_id
    join public.players p on p.id = c.player_id
    left join public.teams t on t.id = p.team_id
    left join public.card_sets cs on cs.id = ci.committed_to
    join public.tier_thresholds cur on cur.tier = ci.tier
    left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1
   where ci.id = p_card_instance_id
     and ci.user_id = v_user;

  if v_card.id is null then
    return null;
  end if;

  /* Every week this copy was started, and what it earned.
   *
   * `scored` separates "played for nothing" from "not swept yet", which the
   * lineup screen already distinguishes and this one must not flatten: a slot
   * in an unscored lineup carries points 0 because that is the column default,
   * not because the player blanked. */
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'season',      l.season,
             'season_type', l.season_type,
             'week',        l.week,
             'slot',        ls.slot,
             'points',      case when l.scored_at is not null then ls.points end,
             'scored',      l.scored_at is not null,
             'lineup_total', l.total_points
           ) order by l.season desc, l.season_type desc, l.week desc
         ), '[]'::jsonb)
    into v_starts
    from public.lineup_slots ls
    join public.lineups l on l.id = ls.lineup_id
   where ls.card_instance_id = p_card_instance_id;

  select jsonb_build_object(
    'card', jsonb_build_object(
      'id',             v_card.id,
      'card_id',        v_card.card_id,
      'player_id',      v_card.player_id,
      'player_name',    v_card.player_name,
      'position_abbreviation', v_card.position_abbreviation,
      'team_abbreviation',     v_card.team_abbreviation,
      'injury_status',  v_card.injury_status,
      'season',         v_card.season,
      'rarity',         v_card.rarity,
      'tier',           v_card.tier,
      'career_fp',      round(v_card.career_fp, 1),
      'lineup_starts',  v_card.lineup_starts,
      'fp_per_start',   case when v_card.lineup_starts > 0
                             then round(v_card.career_fp / v_card.lineup_starts, 1) end,
      'acquired_at',    v_card.acquired_at,
      'source',         v_card.source,
      'sold_at',        v_card.sold_at,
      'sold_for',       v_card.sold_for,
      'committed_at',   v_card.committed_at,
      'committed_for',  v_card.committed_for,
      'committed_set_code', v_card.committed_set_code,
      'committed_set_name', v_card.committed_set_name,
      'sell_value',     v_card.sell_value,
      'tier_floor_fp',  v_card.tier_floor_fp,
      'next_tier_at',   v_card.next_tier_at,
      'next_tier_label', v_card.next_tier_label
    ),
    /* Standing. Competition rank — count of copies strictly above this one,
     * plus one — so ties share a place instead of being ordered arbitrarily
     * by an id nobody can see. Pools are held copies only; a sold copy is not
     * competing, and counting it would inflate every pool over time. */
    'rank', jsonb_build_object(
      'among_player', (
        select count(*) + 1
          from public.card_instances ci
          join public.cards c on c.id = ci.card_id
         where c.player_id = v_card.player_id
           and ci.is_held
           and ci.career_fp > v_card.career_fp
      ),
      'player_pool', (
        select count(*)
          from public.card_instances ci
          join public.cards c on c.id = ci.card_id
         where c.player_id = v_card.player_id
           and ci.is_held
      ),
      'overall', (
        select count(*) + 1 from public.card_instances
         where is_held and career_fp > v_card.career_fp
      ),
      'overall_pool', (
        select count(*) from public.card_instances where is_held
      )
    ),
    'starts', v_starts
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.card_profile(uuid) from public, anon;
grant  execute on function public.card_profile(uuid) to authenticated;

comment on function public.card_profile(uuid) is
  'One owned card_instance: its earned total, tier progress, per-week start log, and its rank among copies of the same player and among every card in the game. Gated on auth.uid() ownership; security definer only so the ranks can see other users'' copies as counts.';

-- ---------------------------------------------------------------- player_market

create or replace function public.player_market(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_out  jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- A player who does not exist is null, not an empty market: the caller can
  -- then draw "player not found" rather than "nobody owns him".
  if not exists (select 1 from public.players where id = p_player_id) then
    return null;
  end if;

  with copies as (
    select ci.id, ci.user_id, ci.tier, ci.career_fp, ci.lineup_starts,
           ci.acquired_at, ci.sold_at, ci.committed_at, ci.is_held, c.season
      from public.card_instances ci
      join public.cards c on c.id = ci.card_id
     where c.player_id = p_player_id
  ),
  held as (
    -- `is_held` rather than `sold_at is null`: a copy committed into a set is
    -- as gone from circulation as a sold one, and counting it here would leave
    -- every pool permanently overstated.
    select * from copies where is_held
  ),
  totals as (
    select jsonb_build_object(
             'minted',  (select count(*) from copies),
             'held',    (select count(*) from held),
             'sold',    (select count(*) from copies where sold_at is not null),
             -- Fed into a set. A different fate from a sale and worth its own
             -- figure: a player being burnt into checklists is a player whose
             -- copies are leaving the game for a reason nobody dumped him for.
             'committed', (select count(*) from copies where committed_at is not null),
             'owners',  (select count(distinct user_id) from held),
             -- The number that says whether this player is actually PLAYED, as
             -- opposed to merely held. career_fp only moves when a copy starts.
             'started', (select count(*) from held where lineup_starts > 0),
             'total_fp', (select coalesce(round(sum(career_fp), 1), 0) from held),
             'avg_fp',  (select case when count(*) > 0
                                     then round(sum(career_fp) / count(*), 1) end
                           from held)
           ) as j
  ),
  -- Every tier, always, including the ones at zero. A histogram with rows
  -- missing reads as "no diamonds exist" when it means "none of THIS player".
  tiers as (
    select jsonb_agg(
             jsonb_build_object(
               'tier',    t.tier,
               'copies',  coalesce(x.copies, 0),
               'owners',  coalesce(x.owners, 0),
               'best_fp', x.best_fp
             ) order by t.sort_order
           ) as j
      from public.tier_thresholds t
      left join (
        select tier, count(*) as copies, count(distinct user_id) as owners,
               round(max(career_fp), 1) as best_fp
          from held group by tier
      ) x on x.tier = t.tier
  ),
  /* The best copy in the game.
   *
   * Only returned once some copy has actually earned something. With every
   * copy on zero the "highest" is whichever row sorted first, which is noise
   * dressed as a leaderboard — the screen says "nobody has started one yet"
   * instead, which is both true and more interesting. */
  top as (
    select jsonb_build_object(
             'display_name',  pr.display_name,
             'is_you',        h.user_id = v_user,
             'tier',          h.tier,
             'career_fp',     round(h.career_fp, 1),
             'lineup_starts', h.lineup_starts,
             'season',        h.season,
             'acquired_at',   h.acquired_at
           ) as j
      from held h
      join public.profiles pr on pr.id = h.user_id
     where h.career_fp > 0
     -- Ties break toward the copy that did it in fewer starts, then toward the
     -- one held longest. Both are ordinary "who did it better".
     order by h.career_fp desc, h.lineup_starts asc, h.acquired_at asc
     limit 1
  ),
  mine as (
    select * from held where user_id = v_user
  ),
  yours as (
    select case when (select count(*) from mine) = 0 then null else
      jsonb_build_object(
        'copies',    (select count(*) from mine),
        'best_fp',   (select round(max(career_fp), 1) from mine),
        'best_tier', (select tier from mine order by career_fp desc limit 1),
        /* Competition rank of the caller's best copy among every held copy.
         * count-of-better + 1 rather than a window function: same answer,
         * without ranking rows nobody asked about. */
        'best_rank', (select count(*) + 1 from held o
                       where o.career_fp > (select max(career_fp) from mine))
      ) end as j
  ),
  -- A card is minted per player per season, so this is how many of each year's
  -- card have been added to the set.
  seasons as (
    select jsonb_agg(
             jsonb_build_object('season', s.season, 'held', s.held, 'minted', s.minted)
             order by s.season desc
           ) as j
      from (
        select season,
               count(*) filter (where is_held) as held,
               count(*)                                as minted
          from copies group by season
      ) s
  )
  select jsonb_build_object(
           'player_id', p_player_id,
           'totals',    totals.j,
           'tiers',     coalesce(tiers.j, '[]'::jsonb),
           'top',       top.j,
           'yours',     yours.j,
           'seasons',   coalesce(seasons.j, '[]'::jsonb)
         )
    into v_out
    -- LEFT JOINs against the single-row CTEs: `top` produces NO row when no
    -- copy has earned anything, and a plain CROSS JOIN would then collapse the
    -- whole result to null rather than to "no top copy yet".
    from totals
    left join tiers   on true
    left join top     on true
    left join yours   on true
    left join seasons on true;

  return v_out;
end;
$$;

revoke execute on function public.player_market(uuid) from public, anon;
grant  execute on function public.player_market(uuid) to authenticated;

comment on function public.player_market(uuid) is
  'Community ownership of one player: circulation counts, tier histogram, and the single highest-earning copy in the game. security definer by necessity — card_instances is RLS-scoped to its owner — and exposes only aggregates plus that one display name, on the same basis as leaderboard().';

-- ------------------------------------------------------------ player_card_market

create or replace function public.player_card_market()
returns table (
  player_id uuid,
  copies    integer,
  bronze    integer,
  silver    integer,
  gold      integer,
  diamond   integer,
  best_fp   numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
    select c.player_id,
           count(*)::integer,
           count(*) filter (where ci.tier = 'bronze')::integer,
           count(*) filter (where ci.tier = 'silver')::integer,
           count(*) filter (where ci.tier = 'gold')::integer,
           count(*) filter (where ci.tier = 'diamond')::integer,
           -- The best copy's EARNED total, which is what career_fp is: it only
           -- moves in weeks the copy was actually started. A great player
           -- nobody has ever started reads 0 here, and that is the true
           -- statement — see the note on career_fp in card_tier_progression.
           round(max(ci.career_fp), 1)
      from public.card_instances ci
      join public.cards c on c.id = ci.card_id
     where ci.is_held
     group by c.player_id;
end;
$$;

revoke execute on function public.player_card_market() from public, anon;
grant  execute on function public.player_card_market() to authenticated;

comment on function public.player_card_market() is
  'Per-player community card counts for the directory list: copies held, the tier histogram, and the highest career_fp on any held copy. Bulk counterpart to player_market(uuid), which stays the source for the profile screen. security definer by necessity — card_instances is RLS-scoped to its owner — and exposes only aggregates, naming nobody.';
