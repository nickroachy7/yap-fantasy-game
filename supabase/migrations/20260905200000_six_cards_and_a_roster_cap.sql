-- ===========================================================================
-- SIX CARDS IN EVERY PACK, AND A ROSTER CAP THAT IS ACTUALLY ENFORCED
-- ===========================================================================
--
-- THE THIRD MIGRATION IN A DAY ON THE SAME SUBJECT, and the reason is worth
-- writing down once so it stops happening: an applied migration is HISTORY.
-- 20260905140000 and 20260905183000 were both edited after they had run, and
-- `db push` skips a version already in `schema_migrations` silently — no error,
-- no warning, the file and the database simply drift. Both files on disk have
-- been restored to what they actually did. Everything new goes here.
--
-- ---------------------------------------------------------------------------
-- 1. SIX CARDS, THE SAME SIX IN EVERY PACK
-- ---------------------------------------------------------------------------
--
-- CARD COUNT AND RARITY ARE INDEPENDENT KNOBS, which is easy to miss and is the
-- whole reason this is cheap. Raise the count and scale the per-card weights
-- down by the same factor, and the only number a player feels — the chance THIS
-- PACK holds a starter — does not move at all:
--
--                   Base      Pro     All-Pro    Elite
--     price          160      250        600     1,400
--     cards            6        6          6         6
--     depth        93.4%    79.2%      31.7%        0%
--     bench         6.0%    18.6%      52.9%     49.9%
--     starter       0.5%     2.0%      14.1%     28.5%
--     elite         0.1%     0.3%       1.3%     21.6%
--     >=1 starter    3.2%    12.5%      63.2%      100%
--     >=1 elite      0.5%     1.6%       7.6%      100%
--     returns        66%      62%        64%       64%
--
-- The `>=1` rows are the 5/7/8/5 shelf's own rates to within a tenth. Simulated
-- over 8,000 opens of each against the live catalogue, dealing real cards.
--
-- SO THE COUNT IS DECIDED BY THE ROSTER CAP INSTEAD, which is the only thing
-- that should decide it. The cap is 30 and six divides it: five packs fills an
-- empty roster, and the 24-card warning lands at exactly four. Eight-card packs
-- hit the cap after three and a half, which puts the wall in the middle of a
-- pack rather than at the end of one.
--
-- AND HOLDING IT CONSTANT IS WHAT MAKES THE LADDER LEGIBLE. When Base -> Pro
-- moved the count, the odds and the price at once, nothing on the shelf said
-- what the extra money bought. The shop is one sentence now: the same six
-- cards, better odds. It also makes the four odds tables directly comparable,
-- which is the entire point of printing them.
-- ===========================================================================

update public.packs
   set card_count = 6,
       coin_cost  = 160,
       tier_odds  = jsonb_build_object('depth', 93.28, 'bench', 6.18, 'starter', 0.441, 'elite', 0.1)
 where code = 'base';

update public.packs
   set card_count = 6,
       coin_cost  = 250,
       tier_odds  = jsonb_build_object('depth', 78.94, 'bench', 18.69, 'starter', 2.12, 'elite', 0.252)
 where code = 'pro';

update public.packs
   set card_count = 6,
       coin_cost  = 600,
       tier_odds  = jsonb_build_object('depth', 31.6, 'bench', 53.09, 'starter', 14.02, 'elite', 1.291)
 where code = 'allpro';

-- The guarantee is untouched: one certain elite, and five more that cannot be
-- worse than bench.
update public.packs
   set card_count = 6,
       coin_cost  = 1400,
       tier_odds  = jsonb_build_object('bench', 60, 'starter', 34, 'elite', 6)
 where code = 'elite';


-- ---------------------------------------------------------------------------
-- 2. THE ROSTER CAP IS ENFORCED WHERE CARDS ARE MINTED
-- ---------------------------------------------------------------------------
--
-- `create or replace` rather than drop-and-recreate: the signature and the
-- return type are unchanged, so the ACL survives and there is no window where a
-- coin-spending endpoint is missing. Everything below is the function as it
-- already ran, plus the block marked THE ROSTER CAP.

create or replace function public.open_pack(p_pack_code text)
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
  v_cap        integer;
  v_held       integer;
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

  -- THE ROSTER CAP, CHECKED BEFORE ANY COINS MOVE.
  --
  -- IT WAS NOT CHECKED ANYWHERE AT ALL, which is the bug this closes. The cap
  -- lives in `game_config` and the collection screen prints it — "30/30 HELD" —
  -- but nothing enforced it at mint: no trigger on `card_instances`, no test
  -- here. Opening a pack at 30 of 30 silently put a player over, and every card
  -- past the cap is one they did not agree to and cannot use.
  --
  -- REFUSED WHOLE, NOT TRIMMED TO FIT. Dealing three of a six-card pack because
  -- three is the room left is worse than refusing: the player paid for six, the
  -- shelf promised six, and the three that arrive are explained by nothing on
  -- screen. The error names both numbers so the client can say what to do.
  --
  -- CHECKED BEFORE THE WALLET LOCK, for the same reason the daily limit is: a
  -- refusal here is not a payment failure and should not queue behind anybody
  -- else's transaction. `is_held` is the same predicate `my_collection` filters
  -- on, so this counts exactly what the player is shown.
  select value into v_cap from public.game_config where key = 'roster_cap';

  if v_cap is not null then
    select count(*) into v_held
      from public.card_instances
     where user_id = v_user and is_held;

    if v_held + v_pack.card_count > v_cap then
      raise exception 'roster full: holding % of %, and this pack deals %',
        v_held, v_cap, v_pack.card_count
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
