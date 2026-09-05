-- ===========================================================================
-- PACKS DEAL FROM THE VALUE SYSTEM, NOT FROM THE RARITY BAND
-- ===========================================================================
--
-- WHAT WAS WRONG. `open_pack` rolled a weight over `cards.rarity`, and rarity
-- was derived from raw `season_stats` while every other number in the game —
-- sell value, the tier ladder, the "RB95 of 203" line on a row — comes from
-- `player_values.value_score`. Two quality models that disagree. Measured on
-- the live catalogue before this ran:
--
--     band        n     median coins   worst   best   avg pos_rank
--     legendary   20    288             25     500     4
--     epic        40    170             14     416    13
--     rare        86     32             12     288    30
--     uncommon   143     12             12     380    56
--     common     687     12             12     330   176
--
--   UNCOMMON AND COMMON ARE THE SAME CARD. Identical median — the 12-coin
--   floor. The Standard Pack spent 20% of its roll on a band the player cannot
--   feel.
--
--   THE BANDS OVERLAP INTO NOISE. A common reaching 330 and an uncommon 380 are
--   both above the legendary MEDIAN of 288. Which band you rolled barely
--   predicts what you got, which is the one thing a band exists to do.
--
--   AND RARITY IS NOT POSITION-NORMALISED, so QB12-of-121 and WR12-of-402 land
--   in different bands for the same standing in their own position.
--
-- ---------------------------------------------------------------------------
-- THE FOUR TIERS, AND WHY THEY ARE NAMED FOR FOOTBALL
-- ---------------------------------------------------------------------------
--
-- Cut by rank WITHIN a position, off the value model the rest of the game
-- already trusts, and SCALED BY HOW MANY OF THAT POSITION A LINEUP STARTS:
--
--     tier      cut                    n    by position          avg coins  floor
--     elite     top 2 x slots         16    WR6 RB4 QB2 TE2 PK2       335     0%
--     starter   top 8 x slots         48    WR18 RB12 QB6 TE6 PK6     168     4%
--     bench     top 24 x slots       128    WR48 RB32 QB16 TE16 PK16   59    19%
--     depth     the rest             784    WR330 TE185 RB155 QB97     14    90%
--
-- where `slots` is that position in a lineup: three WR, two RB, one each of QB,
-- TE and K. Monotonic in value and in floor share, which the rarity bands never
-- were, and every tier holds a mix of positions in the proportion a lineup
-- actually wants them.
--
-- THE NAMES ARE THE DEFINITION, WHICH IS THE POINT. These are printed to the
-- player, so a name that needs a glossary is a name that failed. `elite`,
-- `starter`, `bench` and `depth` are what a fan already calls those players.
--
-- ---------------------------------------------------------------------------
-- THE CUTS WERE FLAT ONCE, AND THE SAMPLE PACK IS WHY THEY ARE NOT
-- ---------------------------------------------------------------------------
--
-- The first version cut every position at the same absolute rank — top 6, 24,
-- 60 — on the argument that fantasy relevance is absolute: the 24th-best
-- quarterback is startable and so is the 24th-best of 402 receivers. That is
-- true at the TOP and falls apart underneath, because the pools are not the
-- same depth. There are about 32 starting quarterbacks, so QB60 is a third
-- stringer, while WR60 is a real flex piece.
--
-- Dealt, that read as an 800-coin Pro Pack containing Mason Rudolph, Josh
-- Johnson and Carson Wentz — three backup quarterbacks in the tier above
-- `depth`. And kickers, whose pool is 41 deep, had no `depth` tier at all: the
-- 41st-best kicker in the league came out as `bench`, the second-best tier we
-- have. Scaling the cut by lineup slots fixes both, and it fixes them for the
-- same reason — the tiers now measure a player against the job rather than
-- against the length of his position's list.
--
-- ---------------------------------------------------------------------------
-- THE CONSTRAINT THAT DECIDES EVERY WEIGHT BELOW
-- ---------------------------------------------------------------------------
--
-- A PACK'S EXPECTED SELL VALUE MUST STAY WELL UNDER ITS PRICE. `sale_multiplier`
-- is 1.0 at bronze, so a fresh card sells for its full base price: the moment
-- expected value crosses the coin cost, buying packs and dumping the contents is
-- an infinite coin loop. That loop is why pack prices doubled on 2026-09-03 and
-- it must not be reopened by a generous-looking odds table.
--
-- The tier means — elite 335, starter 168, bench 59, depth 14 — make that
-- checkable arithmetic, and `pack_odds` below returns the distribution any
-- retune has to check itself against. Every paid pack sits between 55% and 70%
-- of its price, which is where the shelf already was.
--
-- ---------------------------------------------------------------------------
-- DEPTH CARDS ARE NOT THE PROBLEM. THEY ARE THE SUPPLY LINE.
-- ---------------------------------------------------------------------------
--
-- This file's first draft cut the Standard Pack from five cards to three and
-- raised it to 250, on the argument that five cards of which four sell for the
-- floor is fake generosity. That argument was wrong, and it was wrong because
-- it priced a card by what it SELLS for while the game consumes cards for
-- something else entirely:
--
--     family    sets   cards demanded   min_tier
--     team        32              977   null on all 32
--     weekly       1                3   set
--     daily        1                3   null
--
-- THIRTY-TWO TEAM SETS ASK FOR 977 CARDS BETWEEN THEM, and every one of them
-- takes any tier — a 33rd-string Cardinal counts exactly as much toward the
-- Arizona set as an elite does. Committing burns the card at 50%, so that
-- demand is not satisfied once and done; it is a drain that runs for as long as
-- the player is chasing sets.
--
-- So a depth card is not a consolation prize. It is the thing the sets economy
-- eats, and a pack that stopped dealing them would starve the loop that gives
-- the collection a reason to exist. THE VOLUME STAYS: five cards at 200 coins,
-- roughly three of them depth, exactly as before.
--
-- ---------------------------------------------------------------------------
-- SO THE RIP PACKS CARRY NO GUARANTEE AT ALL
-- ---------------------------------------------------------------------------
--
-- A draft of this file gave the volume pack a guaranteed bench-or-better, on
-- the reasoning that a pack which can deal five men you will never start feels
-- like nothing. That is deleted, and the argument against it is the stronger
-- one: A GUARANTEE IN THE PACK PEOPLE OPEN MOST MAKES THE THING IT GUARANTEES
-- WORTHLESS. Every pack containing a bench player means bench players are
-- wallpaper — the promise stops being read after the third pack, and the tier
-- it names stops being worth pulling. Scarcity is the entire reason opening one
-- is worth doing.
--
-- It also points the economy the wrong way. The objective is VOLUME — as many
-- packs opened as possible — and volume is bought with price, not with floors.
-- A floor costs expected value, expected value forces the price up, and a
-- higher price is fewer rips. The Scout Pack spends that same budget on being
-- 75 coins instead.
--
-- Guarantees survive only where they ARE the product and the price says so:
-- the Elite Pack, which is one guaranteed elite and nothing else, and the Pro
-- Pack at 600. Buying a certainty is a different transaction from opening a
-- pack, and it should cost what a certainty costs.
--
-- THE ONE PLACE A FLOOR IS NOT ARGUABLE is the Starter Pack, because a new
-- player who cannot field a legal lineup has nothing to do with the app.
--
-- ---------------------------------------------------------------------------
-- AND THE MINTING POOL MUST NOT SHRINK, WHICH THE SAME TABLE SETTLES
-- ---------------------------------------------------------------------------
--
-- The first draft floated restricting `cards.is_mintable` to roughly the top 60
-- at each position, on the grounds that 695 of 976 mintable cards sell for the
-- 12-coin floor. Recorded here as REJECTED rather than deleted, because it is
-- the obvious idea and it would break the game quietly: a team set asks for
-- 27-34 named cards and the top 60 per position does not contain them, so every
-- one of the 32 team sets would become uncompletable with no error anywhere. A
-- catalogue is not a shop window.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. THE TIER, AS A VIEW RATHER THAN A COLUMN
-- ---------------------------------------------------------------------------
--
-- `player_values` is recomputed as the season runs, so a card's tier moves with
-- its player. A stored column would need a trigger or a sweep to chase that and
-- would be silently stale in between — the exact failure `cards.rarity` has
-- today, which is what this migration exists to undo. The view is ~976 rows and
-- is read a handful of times per pack.
create or replace view public.card_pull_tiers as
select c.id                       as card_id,
       c.player_id,
       c.season,
       pv.position_abbreviation,
       /* Carried so `pool_filter` can name a team. A 32-set family whose sets
          ask for 27-34 cards each is the strongest case for a pack you point at
          one club, and this is the whole cost of allowing one. */
       tm.abbreviation as team_abbreviation,
       pv.pos_rank,
       pv.pos_pool,
       /* A card whose player has no value row is `depth` rather than excluded:
          eight cards are in that state (the `fallback` rarity source) and a
          pack that silently deals fewer cards than it promised is worse than
          one that deals a nobody. */
       /* THE CUT SCALES WITH HOW MANY OF THAT POSITION START. See the header:
          `x3` is the number of that position in a lineup (three WR, two RB, one
          of everything else), so the bands come out proportional to demand
          rather than to how many men happen to play the position. */
       case
         when pv.pos_rank is null then 'depth'
         when pv.pos_rank <=  2 * (case pv.position_abbreviation
                                     when 'WR' then 3 when 'RB' then 2 else 1 end)
           then 'elite'
         when pv.pos_rank <=  8 * (case pv.position_abbreviation
                                     when 'WR' then 3 when 'RB' then 2 else 1 end)
           then 'starter'
         when pv.pos_rank <= 24 * (case pv.position_abbreviation
                                     when 'WR' then 3 when 'RB' then 2 else 1 end)
           then 'bench'
         else 'depth'
       end                        as pull_tier
  from public.cards c
  left join public.player_values pv
         on pv.player_id = c.player_id
        and pv.season    = c.season
  left join public.players pl on pl.id = c.player_id
  left join public.teams   tm on tm.id = pl.team_id
 where c.is_mintable;

comment on view public.card_pull_tiers is
  'What tier of player a mintable card is, by rank within its own position. The axis packs roll over; see 20260905140000.';

/* `player_directory`'s grants, not `cards`': a catalogue view for signed-in
   readers, with no reason to be anonymous. */
grant select on public.card_pull_tiers to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. WHAT A PACK MAY NOW SAY ABOUT ITSELF
-- ---------------------------------------------------------------------------
--
-- Three new columns rather than a rewrite of `odds`, and `odds` is left in
-- place. An over-the-air update is a rolling deploy — the build on a tester's
-- phone right now is still calling the old `open_pack` until it relaunches
-- twice — so nothing the previous build reads may be dropped. `odds` is dead
-- after this and can go in a later migration once the shelf has turned over.
alter table public.packs
  add column if not exists tier_odds   jsonb not null default '{}'::jsonb,
  add column if not exists guarantee   jsonb not null default '{}'::jsonb,
  add column if not exists pool_filter jsonb not null default '{}'::jsonb;

comment on column public.packs.odds is
  'DEPRECATED - weights over cards.rarity. Superseded by tier_odds; kept only so an in-flight build keeps working. See 20260905140000.';
comment on column public.packs.tier_odds is
  'Weights over card_pull_tiers.pull_tier, e.g. {"depth":78,"bench":18,"starter":3.5,"elite":0.5}. Need not sum to 100.';
comment on column public.packs.guarantee is
  'A floor on one or more slots: {"min_tier":"starter","count":1}. Those slots re-roll THIS pack''s tier_odds restricted to that tier and above - see open_pack.';
comment on column public.packs.pool_filter is
  'Narrows what the whole pack may draw: {"min_tier":"bench"}, {"position":"QB"}, {"team":"KC"}. Applies to guaranteed positions too.';


-- ---------------------------------------------------------------------------
-- 3. TIER ORDERING
-- ---------------------------------------------------------------------------
--
-- `min_tier` means "this tier or better", so the four names need an order. An
-- enum type would give it for free and is deliberately not used: adding a fifth
-- tier to an enum inside a transaction is still awkward in Postgres, and this is
-- a knob we expect to turn. A function over text is trivially extendable.
create or replace function public.pull_tier_rank(p_tier text)
returns integer
language sql
immutable
parallel safe
set search_path to 'public', 'pg_temp'
as $$
  select case p_tier
           when 'elite'   then 4
           when 'starter' then 3
           when 'bench'   then 2
           when 'depth'   then 1
           else 0
         end;
$$;

comment on function public.pull_tier_rank(text) is
  'Orders the pull tiers so min_tier can mean "this or better". Unknown names sort below everything.';


-- ---------------------------------------------------------------------------
-- 4. THE DEAL
-- ---------------------------------------------------------------------------
--
-- DROPPED AND RECREATED rather than replaced, because the return type gains a
-- column (`pull_tier` — the reveal wants to say what it dealt). A dropped
-- function loses its ACL and Postgres hands the new one PUBLIC EXECUTE by
-- default, which would put a coin-spending, card-minting endpoint in front of
-- `anon`. The grants at the bottom restore exactly what was there before.
--
-- Three passes, in the order a reader would guess — the pack's promises are
-- paid first, whatever is left rolls:
--
--   1. GUARANTEED POSITIONS — the starter pack's QB/RB×2/WR×3/TE/PK. Now
--      respects `pool_filter.min_tier`, which is what stops a new player's first
--      eight cards being eight nobodies.
--   2. THE TIER GUARANTEE — `{"min_tier":"starter","count":1}`.
--   3. WHATEVER IS LEFT, by `tier_odds`.
--
-- ---------------------------------------------------------------------------
-- HOW A GUARANTEE PICKS ITS TIER, WHICH IS THE ONE SUBTLE RULE IN HERE
-- ---------------------------------------------------------------------------
--
-- A guaranteed slot RE-ROLLS THIS PACK'S OWN `tier_odds`, restricted to the
-- guaranteed tier and above and renormalised. It does NOT draw uniformly from
-- every card at that tier or better, which was the first implementation and was
-- wrong in a way that only showed up when the odds were written down:
--
--   Uniform over the union means POOL-PROPORTIONAL. There are 30 elite cards
--   and 90 starters, so a "starter or better" guarantee would have come up
--   elite a QUARTER of the time — making the 250-coin Standard Pack deal an
--   elite more often than one in four, and quietly undercutting the 400-coin
--   pack whose entire pitch is a guaranteed elite. A floor became a jackpot.
--
--   Re-rolling the pack's own odds keeps the pack's CHARACTER. Standard's odds
--   are 3.5 starter to 0.5 elite, so its guaranteed slot is 87.5% starter and
--   12.5% elite — the same shape it has everywhere else, with the bottom cut
--   off. That is what a floor should mean.
--
--   AND IT IS THE ONLY VERSION THAT CAN BE PUBLISHED HONESTLY. `pack_odds`
--   below computes what a player will actually see from exactly these two
--   inputs; under the pool-proportional rule the printed number would have
--   drifted with the size of the catalogue rather than with anything the pack
--   says about itself.
--
-- A pack whose odds name nothing at or above its guaranteed tier — the Elite
-- Pack, which has no odds at all — falls back to the guaranteed tier itself.
--
-- Each pass falls back outward rather than dealing nothing: a filter matching no
-- card widens to the tier alone, then to the whole mintable pool. A pack that
-- silently returns four cards instead of five is a support ticket; a pack that
-- occasionally over-delivers is not.
drop function if exists public.open_pack(text);

create function public.open_pack(p_pack_code text)
returns table(
  card_instance_id uuid,
  player_name text,
  position_abbreviation text,
  team_abbreviation text,
  rarity rarity,
  pull_tier text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user       uuid := auth.uid();
  v_pack       public.packs%rowtype;
  v_balance    integer;
  v_opening    uuid;
  v_season     integer;
  v_total      numeric;
  v_roll       numeric;
  v_acc        numeric;
  v_tier       text;
  v_card       uuid;
  v_new        uuid;
  v_dealt      integer := 0;
  v_today      integer;
  v_min_tier   text;
  v_min_rank   integer;
  v_pos_filter text;
  v_team_filter text;
  v_g_tier     text;
  v_g_rank     integer;
  v_g_count    integer;
  v_g_total    numeric;
  i            integer;
  r            record;
  g            record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_pack from public.packs where code = p_pack_code and is_active;
  if not found then
    raise exception 'unknown or inactive pack %', p_pack_code using errcode = '22023';
  end if;

  if v_pack.once_per_user and exists (
    select 1 from public.pack_openings
     where user_id = v_user and pack_id = v_pack.id
  ) then
    raise exception 'pack % can only be opened once', p_pack_code using errcode = '22023';
  end if;

  -- THE DAILY LIMIT, compared as UTC dates on both sides rather than against a
  -- half-open range, because the two operands then obviously mean the same
  -- thing. Checked BEFORE the wallet lock: a refusal here is not a payment
  -- failure and should not queue behind anybody else's transaction.
  if v_pack.daily_limit is not null then
    select count(*) into v_today
      from public.pack_openings
     where user_id = v_user
       and pack_id = v_pack.id
       and (opened_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date;

    if v_today >= v_pack.daily_limit then
      raise exception 'pack % has already been opened today', p_pack_code
        using errcode = '22023';
    end if;
  end if;

  -- Lock the wallet: without this two concurrent opens can both pass the
  -- affordability check.
  select balance into v_balance
    from public.coin_balances where user_id = v_user for update;
  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;
  if v_balance < v_pack.coin_cost then
    raise exception 'insufficient coins: have %, need %', v_balance, v_pack.coin_cost
      using errcode = '22023';
  end if;

  select max(season) into v_season from public.cards where is_mintable;
  if v_season is null then
    raise exception 'no mintable cards' using errcode = '22023';
  end if;

  if v_pack.coin_cost > 0 then
    update public.coin_balances
       set balance = balance - v_pack.coin_cost, updated_at = now()
     where user_id = v_user;
  end if;

  insert into public.pack_openings (user_id, pack_id, coins_spent)
  values (v_user, v_pack.id, v_pack.coin_cost)
  returning id into v_opening;

  if v_pack.coin_cost > 0 then
    insert into public.coins_ledger (user_id, amount, reason, reference_id)
    values (v_user, -v_pack.coin_cost, 'pack_purchase', v_opening);
  end if;

  v_min_tier    := v_pack.pool_filter ->> 'min_tier';
  v_min_rank    := public.pull_tier_rank(coalesce(v_min_tier, 'depth'));
  v_pos_filter  := v_pack.pool_filter ->> 'position';
  v_team_filter := v_pack.pool_filter ->> 'team';

  create temp table _minted (card_id uuid) on commit drop;

  -- 1. GUARANTEED POSITION COVERAGE, inside the pack's own pool.
  for g in select key as pos, value::integer as n
             from jsonb_each_text(v_pack.guaranteed_positions) loop
    for i in 1 .. g.n loop
      select t.card_id into v_card
        from public.card_pull_tiers t
       where t.season = v_season
         and t.position_abbreviation = g.pos
         and public.pull_tier_rank(t.pull_tier) >= v_min_rank
         and (v_team_filter is null or t.team_abbreviation = v_team_filter)
       order by random() limit 1;

      /* The pool filter is a preference, not a promise: a position whose
         players are all below `min_tier` still owes the pack a card. */
      if v_card is null then
        select t.card_id into v_card
          from public.card_pull_tiers t
         where t.season = v_season
           and t.position_abbreviation = g.pos
         order by random() limit 1;
      end if;

      if v_card is not null then
        insert into _minted values (v_card);
        v_dealt := v_dealt + 1;
      end if;
    end loop;
  end loop;

  -- 2. THE TIER GUARANTEE — the pack's headline promise, paid before the roll.
  --    See the long note above for why this re-rolls the pack's own odds.
  v_g_tier  := v_pack.guarantee ->> 'min_tier';
  v_g_count := coalesce((v_pack.guarantee ->> 'count')::integer, 0);

  if v_g_tier is not null and v_g_count > 0 then
    v_g_rank := public.pull_tier_rank(v_g_tier);

    select coalesce(sum(value::numeric), 0) into v_g_total
      from jsonb_each_text(v_pack.tier_odds)
     where public.pull_tier_rank(key) >= v_g_rank;

    for i in 1 .. least(v_g_count, greatest(0, v_pack.card_count - v_dealt)) loop
      /* No odds at or above the floor — the Elite Pack, which has none at all —
         so the floor names its own tier. */
      v_tier := v_g_tier;

      if v_g_total > 0 then
        v_roll := random() * v_g_total;
        v_acc  := 0;
        for r in select key, value::numeric as w
                   from jsonb_each_text(v_pack.tier_odds)
                  where public.pull_tier_rank(key) >= v_g_rank
                  order by public.pull_tier_rank(key) loop
          v_acc := v_acc + r.w;
          if v_roll <= v_acc then v_tier := r.key; exit; end if;
        end loop;
      end if;

      select t.card_id into v_card
        from public.card_pull_tiers t
       where t.season = v_season
         and t.pull_tier = v_tier
         and (v_pos_filter is null or t.position_abbreviation = v_pos_filter)
         and (v_team_filter is null or t.team_abbreviation = v_team_filter)
       order by random() limit 1;

      if v_card is null then
        select t.card_id into v_card
          from public.card_pull_tiers t
         where t.season = v_season
           and public.pull_tier_rank(t.pull_tier) >= v_g_rank
           and (v_pos_filter is null or t.position_abbreviation = v_pos_filter)
         and (v_team_filter is null or t.team_abbreviation = v_team_filter)
         order by random() limit 1;
      end if;

      if v_card is not null then
        insert into _minted values (v_card);
        v_dealt := v_dealt + 1;
      end if;
    end loop;
  end if;

  -- 3. THE REST, BY WEIGHT OVER TIERS.
  --
  -- UNIFORM WITHIN A TIER, deliberately. Weighting the pick by value inside the
  -- band was the obvious next turn of the screw and it is refused: the whole
  -- argument for tiers over rarity is that the odds become PUBLISHABLE, and a
  -- hidden second weight underneath a printed number is what makes a published
  -- rate a lie. The tier does the work; the draw is a draw.
  select coalesce(sum(value::numeric), 0) into v_total
    from jsonb_each_text(v_pack.tier_odds);

  for i in 1 .. greatest(0, v_pack.card_count - v_dealt) loop
    v_tier := null;

    if v_total > 0 then
      v_roll := random() * v_total;
      v_acc  := 0;
      /* Ordered by rank rather than by key so the accumulation walks the tiers
         in a meaningful direction. Alphabetical would put `depth` after
         `elite`, which is correct arithmetic and impossible to debug. */
      for r in select key, value::numeric as w
                 from jsonb_each_text(v_pack.tier_odds)
                order by public.pull_tier_rank(key) loop
        v_acc := v_acc + r.w;
        if v_roll <= v_acc then v_tier := r.key; exit; end if;
      end loop;
    end if;

    v_card := null;

    if v_tier is not null then
      select t.card_id into v_card
        from public.card_pull_tiers t
       where t.season = v_season
         and t.pull_tier = v_tier
         and (v_pos_filter is null or t.position_abbreviation = v_pos_filter)
         and (v_team_filter is null or t.team_abbreviation = v_team_filter)
       order by random() limit 1;
    end if;

    /* Widen rather than deal nothing — first to the pack's own pool, then to
       everything mintable. */
    if v_card is null then
      select t.card_id into v_card
        from public.card_pull_tiers t
       where t.season = v_season
         and public.pull_tier_rank(t.pull_tier) >= v_min_rank
         and (v_pos_filter is null or t.position_abbreviation = v_pos_filter)
         and (v_team_filter is null or t.team_abbreviation = v_team_filter)
       order by random() limit 1;
    end if;

    if v_card is null then
      select t.card_id into v_card
        from public.card_pull_tiers t
       where t.season = v_season
       order by random() limit 1;
    end if;

    insert into _minted values (v_card);
  end loop;

  -- 4. MINT
  for r in select card_id from _minted loop
    insert into public.card_instances (user_id, card_id, source, pack_opening_id)
    values (v_user, r.card_id, 'pack', v_opening)
    returning id into v_new;

    return query
      select v_new, p.full_name, p.position_abbreviation, t.abbreviation,
             c.rarity, pt.pull_tier
        from public.cards c
        join public.players p on p.id = c.player_id
        left join public.teams t on t.id = p.team_id
        left join public.card_pull_tiers pt on pt.card_id = c.id
       where c.id = r.card_id;
  end loop;

  drop table if exists _minted;
end;
$function$;

-- The ACL the dropped function had, restored by hand. NOT `to public`, and not
-- `to anon`: this spends coins and mints cards.
revoke all on function public.open_pack(text) from public;
grant execute on function public.open_pack(text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. THE ODDS, AS THE PLAYER WILL SEE THEM
-- ---------------------------------------------------------------------------
--
-- THE SHELF MUST NOT COMPUTE THIS ITSELF. A published rate that the client
-- derives from the same columns by its own arithmetic is a rate that goes wrong
-- the first time either side is touched, and it goes wrong SILENTLY — the
-- number still renders, it is just no longer what the deal does. So the odds
-- come out of the database that deals the cards, from exactly the inputs
-- `open_pack` reads, and the client's whole job is to draw them.
--
-- TWO NUMBERS PER TIER, because they answer the two different questions a
-- player actually asks:
--
--   per_card_pct    "what is a card in this pack likely to be?"
--   at_least_one_pct "will this pack get me one?" — the question that decides
--                    a purchase, and the one a per-card rate answers badly. A
--                    pack with a 5% elite rate on five cards is not a 5% pack.
--
-- The three kinds of slot are independent draws, so `at_least_one` is one minus
-- the product of each slot's chance of missing. Position slots are pool-
-- proportional (they draw a position, not a tier), guarantee slots use the
-- restricted odds, everything else uses the odds as written.
create or replace function public.pack_odds(p_pack_code text)
returns table(
  pull_tier        text,
  per_card_pct     numeric,
  at_least_one_pct numeric
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pack     public.packs%rowtype;
  v_season   integer;
  v_min_rank integer;
  v_g_rank   integer;
  v_g_count  integer;
  v_n_pos    integer := 0;
  v_n_odds   integer;
  v_total    numeric;
  v_g_total  numeric;
begin
  select * into v_pack from public.packs where code = p_pack_code and is_active;
  if not found then return; end if;

  select max(season) into v_season from public.cards where is_mintable;

  v_min_rank := public.pull_tier_rank(coalesce(v_pack.pool_filter ->> 'min_tier', 'depth'));
  v_g_rank   := public.pull_tier_rank(coalesce(v_pack.guarantee ->> 'min_tier', ''));
  v_g_count  := coalesce((v_pack.guarantee ->> 'count')::integer, 0);

  select coalesce(sum(value::integer), 0) into v_n_pos
    from jsonb_each_text(v_pack.guaranteed_positions);

  /* Guarantee slots only exist in the room the position slots leave. */
  v_g_count := least(v_g_count, greatest(0, v_pack.card_count - v_n_pos));
  v_n_odds  := greatest(0, v_pack.card_count - v_n_pos - v_g_count);

  select coalesce(sum(value::numeric), 0) into v_total
    from jsonb_each_text(v_pack.tier_odds);

  select coalesce(sum(value::numeric), 0) into v_g_total
    from jsonb_each_text(v_pack.tier_odds)
   where public.pull_tier_rank(key) >= v_g_rank;

  return query
  with tiers as (
    select unnest(array['elite','starter','bench','depth']) as t
  ),
  /* One row per position slot, with that position's own tier split — a QB slot
     and a PK slot are not the same draw, because the pools differ. */
  pos_slots as (
    select gp.key as pos, gp.value::integer as n
      from jsonb_each_text(v_pack.guaranteed_positions) gp
  ),
  pos_share as (
    select ps.pos, ps.n, t.t as tier,
           coalesce(
             (select count(*)::numeric
                from public.card_pull_tiers cpt
               where cpt.season = v_season
                 and cpt.position_abbreviation = ps.pos
                 and cpt.pull_tier = t.t
                 and public.pull_tier_rank(cpt.pull_tier) >= v_min_rank)
             / nullif(
               (select count(*)::numeric
                  from public.card_pull_tiers cpt
                 where cpt.season = v_season
                   and cpt.position_abbreviation = ps.pos
                   and public.pull_tier_rank(cpt.pull_tier) >= v_min_rank), 0),
             0) as p
      from pos_slots ps cross join tiers t
  ),
  odds_share as (
    select t.t as tier,
           case when v_total > 0
                then coalesce((v_pack.tier_odds ->> t.t)::numeric, 0) / v_total
                else 0 end as p
      from tiers t
  ),
  g_share as (
    select t.t as tier,
           case
             when v_g_count = 0 then 0
             when v_g_total > 0 and public.pull_tier_rank(t.t) >= v_g_rank
               then coalesce((v_pack.tier_odds ->> t.t)::numeric, 0) / v_g_total
             /* No odds at or above the floor: the floor names its own tier. */
             when v_g_total = 0 and public.pull_tier_rank(t.t) = v_g_rank then 1
             else 0
           end as p
      from tiers t
  )
  select t.t,
         round(100 * (
             coalesce((select sum(ps.p * ps.n) from pos_share ps where ps.tier = t.t), 0)
           + (select g.p from g_share g where g.tier = t.t) * v_g_count
           + (select o.p from odds_share o where o.tier = t.t) * v_n_odds
         ) / nullif(v_pack.card_count, 0), 1),
         round(100 * (1 - (
             coalesce((select exp(sum(ps.n * ln(greatest(1 - ps.p, 1e-9))))
                         from pos_share ps where ps.tier = t.t), 1)
           * power(1 - (select g.p from g_share g where g.tier = t.t), v_g_count)
           * power(1 - (select o.p from odds_share o where o.tier = t.t), v_n_odds)
         )), 1)
    from tiers t
   order by public.pull_tier_rank(t.t) desc;
end;
$function$;

comment on function public.pack_odds(text) is
  'What a pack actually deals, per tier: the chance any one card is that tier, and the chance the pack contains at least one. Computed from the same columns open_pack reads. See 20260905140000.';

revoke all on function public.pack_odds(text) from public;
grant execute on function public.pack_odds(text) to authenticated, anon, service_role;


-- ---------------------------------------------------------------------------
-- 6. THE SHELF
-- ---------------------------------------------------------------------------
--
-- Each pack in one line, which is the line the card should print:
--
--   Starter     free  10 cards   a legal lineup and a bench, one time only
--   Daily       free   5 cards   the reason to open the app
--   Base         140   5 cards   fodder. 92% depth, and that is the point
--   Pro          260   7 cards   more of it, with a real chance at somebody
--   All-Pro      680   8 cards   depth becomes the minority
--   Elite      1,200   5 cards   no depth, and one guaranteed elite
--
-- Expected sell value against price, simulated over 6,000 opens of each against
-- the live catalogue rather than derived, stated so the next retune can check
-- its work rather than guess:
--
--   Starter ~1,500 once    Daily  105        Base    90 = 64%
--   Pro       170 = 65%    All-Pro 443 = 65%  Elite   782 = 65%

-- THE STARTER PACK gets a floor rather than odds, and ten cards rather than
-- eight. Its first eight slots are position guarantees, so `tier_odds` would
-- never run; the two spare slots fall through to the pool filter and draw from
-- bench-or-better like the rest of it. Onboarding is the one place a floor is
-- unarguable — a first session that deals eight nobodies cannot field a lineup,
-- and a player who cannot field a lineup has nothing to do.
--
-- TEN IS THE CEILING, not a preference: `packs_card_count_check` allows 1..10.
update public.packs
   set name        = 'Starter Pack',
       card_count  = 10,
       pool_filter = jsonb_build_object('min_tier', 'bench')
 where code = 'starter';

-- THE DAILY PACK is free and stays outside the four-rung shop below: it is the
-- reason to open the app, not a thing you choose between. Its odds sit a shade
-- above Base, because a free pack that is worse than the cheapest paid one is a
-- free pack nobody opens.
update public.packs
   set name       = 'Daily Pack',
       card_count = 5,
       tier_odds  = jsonb_build_object('depth', 88, 'bench', 10.5, 'starter', 1.4, 'elite', 0.1),
       guarantee  = '{}'::jsonb
 where code = 'daily';


-- ---------------------------------------------------------------------------
-- THE SHOP: FOUR RUNGS, BASE -> PRO -> ALL-PRO -> ELITE
-- ---------------------------------------------------------------------------
--
-- Every tier's chance rises at every step and depth's falls at every step,
-- which is the whole design of the ladder — simulated over 6,000 opens each
-- against the live catalogue:
--
--                  Base      Pro      All-Pro     Elite
--     price         140      260        680       1,200
--     cards           5        7          8           5
--     depth       92.0%    81.9%      40.1%          0%
--     bench        7.4%    16.1%      48.1%       48.0%
--     starter      0.5%     1.8%      10.8%       27.1%
--     elite        0.1%     0.2%       1.0%       24.9%
--     returns       64%      65%        65%         65%
--
-- THE ONE NAME SHARED WITH A TIER IS SHARED ON PURPOSE. `Elite` is the top rung
-- AND the top tier, and that is a promise rather than a collision: the Elite
-- Pack is the only pack that guarantees an elite card. A draft had `Elite` as
-- the THIRD rung under a `Legendary` top, which put an Elite Pack next to an
-- `elite` tier it did not guarantee — the same word meaning two different
-- things, one rung apart. `All-Pro` escalates off `Pro` in a way every reader of
-- a football page already knows, and claims nothing about what is inside.
--
-- THE CODES MOVE, AND THE ORDER OF THESE STATEMENTS IS WHY IT WORKS. `pro` is
-- taken by the old 800-coin pack before the new mid-rung wants it, so the old
-- one is renamed to `allpro` FIRST. `packs.code` is unique and `pack_openings`
-- points at `packs.id`, so every rename keeps its history.

-- The old 800-coin Pro Pack becomes the third rung. It keeps its identity —
-- expensive, no depth in the first draft — and gains depth back, because a rung
-- below the top should not be a different KIND of pack.
update public.packs
   set code       = 'allpro',
       name       = 'All-Pro Pack',
       card_count = 8,
       coin_cost  = 680,
       tier_odds  = jsonb_build_object('depth', 40, 'bench', 48, 'starter', 11, 'elite', 1),
       guarantee  = '{}'::jsonb
 where code = 'pro';

-- The old Standard Pack becomes the floor of the shop. Five cards at 140, 92%
-- depth: this is the pack the game is actually played with, the one a player
-- rips for set fodder, and the odds are deliberately the worst on the shelf.
update public.packs
   set code       = 'base',
       name       = 'Base Pack',
       card_count = 5,
       coin_cost  = 140,
       tier_odds  = jsonb_build_object('depth', 92, 'bench', 7.4, 'starter', 0.5, 'elite', 0.1),
       guarantee  = '{}'::jsonb
 where code = 'standard';

-- The new second rung, taking the `pro` code the statement above just freed.
insert into public.packs (code, name, coin_cost, card_count, once_per_user,
                          daily_limit, odds, guaranteed_positions,
                          tier_odds, guarantee, pool_filter, is_active)
values ('pro', 'Pro Pack', 260, 7, false, null, '{}'::jsonb, '{}'::jsonb,
        jsonb_build_object('depth', 82, 'bench', 16, 'starter', 1.8, 'elite', 0.2),
        '{}'::jsonb, '{}'::jsonb, true)
on conflict (code) do update
   set name       = excluded.name,
       coin_cost  = excluded.coin_cost,
       card_count = excluded.card_count,
       tier_odds  = excluded.tier_odds,
       guarantee  = excluded.guarantee,
       is_active  = excluded.is_active;

-- THE ELITE PACK is the top of the shop and the only guarantee on it: no
-- depth at all, and one card that is certainly elite. Five cards rather than
-- eight, because the rung below already sells volume — this one sells the
-- certainty, and 1,200 coins buys a top-two player at his position plus four
-- more that cannot be worse than bench.
--
-- IT IS NOT A ONE-CARD PACK, and that was a real mistake in an earlier draft.
-- Opening is the verb this whole shop sells; one card is a purchase rather than
-- an opening, with nothing to turn over and no moment where the last card is
-- still face down.
insert into public.packs (code, name, coin_cost, card_count, once_per_user,
                          daily_limit, odds, guaranteed_positions,
                          tier_odds, guarantee, pool_filter, is_active)
values ('elite', 'Elite Pack', 1200, 5, false, null, '{}'::jsonb, '{}'::jsonb,
        jsonb_build_object('bench', 60, 'starter', 34, 'elite', 6),
        jsonb_build_object('min_tier', 'elite', 'count', 1),
        '{}'::jsonb, true)
on conflict (code) do update
   set name       = excluded.name,
       coin_cost  = excluded.coin_cost,
       card_count = excluded.card_count,
       tier_odds  = excluded.tier_odds,
       guarantee  = excluded.guarantee,
       is_active  = excluded.is_active;

-- The one SKU an earlier draft of this file invented and this one does not use,
-- retired rather than deleted in case a partial run already inserted it.
-- Nothing points at it; `is_active` is what the shelf reads.
update public.packs set is_active = false where code = 'scout';
