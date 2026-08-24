-- A free pack every day, so there is a reason to open the app on a Tuesday.
--
-- ---------------------------------------------------------------------------
-- WHY IT IS THREE CARDS AND NOT FIVE
-- ---------------------------------------------------------------------------
--
-- The obvious version is "a free Standard pack", five cards, once a day. That
-- is 35 cards a week arriving into a ROSTER CAP OF 30, which is not a gift; it
-- is a daily chore with a deadline. The cap exists to make a player choose
-- between cards they care about, and a mechanic that refills the shelf faster
-- than anybody can triage it turns that choice into data entry.
--
-- The numbers that decided it, against ~295 gems a week of earned income
-- (150 flat plus ~145 from points) and 100 gems for five cards:
--
--   cards/day   cards/week   free packs/week   vs earned income
--       5           35             7.0              +233%
--       3           21             4.2              +140%   <- chosen
--       2           14             2.8               +95%
--       1            7             1.4               +47%
--
-- Three, for two reasons that happen to agree.
--
-- It is the smallest count that reliably produces a MOMENT. One card is a coin
-- flip that lands on a common 70% of the time and reads as a shrug, and a daily
-- reward nobody is glad to see is worse than none. Three cards is 66% to
-- contain something above common, so most days there is something to look at.
--
-- And three is what a DAILY SET asks for. The two mechanics were designed
-- separately and land on the same number, which gives the day an actual shape:
-- open the free pack, feed the daily set, decide about what is left. The pack's
-- three will rarely be the one position a daily wants, so this is a rhyme
-- rather than a closed loop — but it means the cards arriving each day and the
-- sink built to eat them are sized against each other instead of fighting.
--
-- It is roughly a 2.4x on pack throughput, which is the real cost here and is
-- accepted deliberately: retention is the thing being bought. If it proves too
-- generous the fix is `card_count`, one integer, no deploy.
--
-- ---------------------------------------------------------------------------
-- SEPARATE PACK ROW, NOT A FLAG ON STANDARD
-- ---------------------------------------------------------------------------
--
-- Standard keeps its identity as the 100-gem pack, and this becomes a thing
-- with its own name that can be tuned without touching it. They ship with the
-- same odds on purpose — "a free Standard pack" is the promise — but the day
-- one of them wants different odds, or a different card count, or a guaranteed
-- band, neither has to be untangled from the other first.
--
-- ---------------------------------------------------------------------------
-- THE DAY IS THE UTC DAY, MATCHING THE DAILY SET
-- ---------------------------------------------------------------------------
--
-- `sync-cards` builds each daily set from `new Date().toISOString().slice(0,10)`,
-- so the game already has a day boundary and it is UTC midnight. This uses the
-- same one.
--
-- It is not the boundary anybody would choose from scratch — UTC midnight is
-- 8pm Eastern, so the day rolls over in the middle of a Sunday evening — but
-- the alternative is worse than the flaw. Two mechanics both called "daily",
-- resetting at different times, on two tabs of the same app, is a bug report
-- nobody will be able to describe. If this boundary should move, both move
-- together and that is its own change.
--
-- ---------------------------------------------------------------------------
-- IT IS A LIMIT, NOT A COOLDOWN
-- ---------------------------------------------------------------------------
--
-- `daily_limit` counts opens within the current day rather than measuring
-- elapsed time since the last one. A rolling 24-hour cooldown punishes a player
-- for opening at 8pm and then wanting to play at 7pm the next evening, and it
-- silently trains people to claim later and later. A calendar limit resets for
-- everyone at the same instant and is the thing "daily" already means.
--
-- Generalised rather than hardcoded because `once_per_user` is the same idea
-- with a different period, and a second boolean called `once_per_day` would
-- have been the point at which this stopped being a mechanism and started being
-- a list of special cases.

alter table public.packs
  add column if not exists daily_limit integer
    check (daily_limit is null or daily_limit > 0);

comment on column public.packs.daily_limit is
  'How many times one user may open this pack per UTC day. Null means no limit. The day boundary matches the daily set''s — see 20260824220000_daily_free_pack.sql.';

insert into public.packs (code, name, gem_cost, card_count, odds,
                          guaranteed_positions, once_per_user, daily_limit, is_active)
values (
  'daily',
  'Daily Pack',
  0,
  3,
  -- Standard's distribution, copied deliberately rather than referenced: see
  -- the header on why these two rows are allowed to diverge later.
  '{"common": 70, "uncommon": 20, "rare": 7, "epic": 2.5, "legendary": 0.5}'::jsonb,
  '{}'::jsonb,
  false,
  1,
  true
)
on conflict (code) do update
  set name        = excluded.name,
      gem_cost    = excluded.gem_cost,
      card_count  = excluded.card_count,
      odds        = excluded.odds,
      daily_limit = excluded.daily_limit,
      is_active   = excluded.is_active;

-- ---------------------------------------------------------------- open_pack
--
-- Restated whole, as every revision of it has been: CREATE OR REPLACE has no
-- partial form. The ONLY change is the daily_limit check, which sits directly
-- beneath the once_per_user check it is modelled on. Everything else is the
-- live body verbatim.

create or replace function public.open_pack(p_pack_code text)
returns table (
  card_instance_id uuid,
  player_name      text,
  position_abbreviation text,
  team_abbreviation text,
  rarity           rarity
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user     uuid := auth.uid();
  v_pack     public.packs%rowtype;
  v_balance  integer;
  v_opening  uuid;
  v_season   integer;
  v_total    numeric;
  v_roll     numeric;
  v_acc      numeric;
  v_rarity   rarity;
  v_card     uuid;
  v_new      uuid;
  v_guaranteed integer := 0;
  v_today    integer;
  i          integer;
  r          record;
  g          record;
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

  -- THE DAILY LIMIT. Compared as UTC dates on both sides rather than against a
  -- half-open range, because the two operands then obviously mean the same
  -- thing; `opened_at` is timestamptz and a bare comparison against a truncated
  -- timestamp would silently resolve through the session's timezone. It costs a
  -- sequential scan of one user's openings, which is a few dozen rows.
  --
  -- Checked BEFORE the wallet lock: a refusal here is not a payment failure and
  -- should not queue behind anybody else's transaction.
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

  -- Lock the wallet for the transaction: without this two concurrent opens can
  -- both pass the affordability check.
  select balance into v_balance
    from public.gem_balances where user_id = v_user for update;
  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;
  if v_balance < v_pack.gem_cost then
    raise exception 'insufficient gems: have %, need %', v_balance, v_pack.gem_cost
      using errcode = '22023';
  end if;

  select max(season) into v_season from public.cards where is_mintable;
  if v_season is null then
    raise exception 'no mintable cards' using errcode = '22023';
  end if;

  if v_pack.gem_cost > 0 then
    update public.gem_balances
       set balance = balance - v_pack.gem_cost, updated_at = now()
     where user_id = v_user;
  end if;

  insert into public.pack_openings (user_id, pack_id, gems_spent)
  values (v_user, v_pack.id, v_pack.gem_cost)
  returning id into v_opening;

  if v_pack.gem_cost > 0 then
    insert into public.gems_ledger (user_id, amount, reason, reference_id)
    values (v_user, -v_pack.gem_cost, 'pack_purchase', v_opening);
  end if;

  create temp table _minted (card_id uuid) on commit drop;

  -- 1. guaranteed position coverage
  for g in select key as pos, value::integer as n from jsonb_each_text(v_pack.guaranteed_positions) loop
    for i in 1 .. g.n loop
      select c.id into v_card
        from public.cards c
        join public.players p on p.id = c.player_id
       where c.season = v_season and c.is_mintable
         and p.position_abbreviation = g.pos
       order by random() limit 1;
      if v_card is not null then
        insert into _minted values (v_card);
        v_guaranteed := v_guaranteed + 1;
      end if;
    end loop;
  end loop;

  -- 2. remaining slots by weighted rarity
  select coalesce(sum(value::numeric), 0) into v_total from jsonb_each_text(v_pack.odds);

  for i in 1 .. greatest(0, v_pack.card_count - v_guaranteed) loop
    v_rarity := null;
    if v_total > 0 then
      v_roll := random() * v_total;
      v_acc  := 0;
      for r in select key, value::numeric as w from jsonb_each_text(v_pack.odds) order by key loop
        v_acc := v_acc + r.w;
        if v_roll <= v_acc then v_rarity := r.key::rarity; exit; end if;
      end loop;
    end if;

    v_card := null;
    if v_rarity is not null then
      select c.id into v_card from public.cards c
       where c.season = v_season and c.is_mintable and c.rarity = v_rarity
       order by random() limit 1;
    end if;
    if v_card is null then
      select c.id into v_card from public.cards c
       where c.season = v_season and c.is_mintable
       order by random() limit 1;
    end if;
    insert into _minted values (v_card);
  end loop;

  -- 3. mint
  for r in select card_id from _minted loop
    insert into public.card_instances (user_id, card_id, source, pack_opening_id)
    values (v_user, r.card_id, 'pack', v_opening)
    returning id into v_new;

    return query
      select v_new, p.full_name, p.position_abbreviation, t.abbreviation, c.rarity
        from public.cards c
        join public.players p on p.id = c.player_id
        left join public.teams t on t.id = p.team_id
       where c.id = r.card_id;
  end loop;

  drop table if exists _minted;
end;
$function$;

-- ---------------------------------------------------------------- claim state
--
-- The client has to draw "claimed" on a button, and deriving it there would
-- mean the client deciding when a day ends. It does not get to: the boundary is
-- the server's, in one place, and this is that place.

create or replace function public.daily_pack_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_pack public.packs%rowtype;
  v_used integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_pack from public.packs
   where daily_limit is not null and is_active
   order by gem_cost, code limit 1;

  if not found then
    return jsonb_build_object('available', false, 'reason', 'no daily pack');
  end if;

  select count(*) into v_used
    from public.pack_openings
   where user_id = v_user and pack_id = v_pack.id
     and (opened_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date;

  return jsonb_build_object(
    'code',       v_pack.code,
    'name',       v_pack.name,
    'card_count', v_pack.card_count,
    'limit',      v_pack.daily_limit,
    'used',       v_used,
    'available',  v_used < v_pack.daily_limit,
    -- When the next one unlocks, as an instant rather than a duration: a
    -- countdown computed here is stale the moment it is serialised.
    'resets_at',  (date_trunc('day', now() at time zone 'UTC') + interval '1 day')
                    at time zone 'UTC');
end;
$$;

revoke execute on function public.daily_pack_status() from public, anon;
grant  execute on function public.daily_pack_status() to authenticated;

comment on function public.daily_pack_status() is
  'Whether the caller can still claim today''s free pack, and when the next one unlocks. The day boundary is UTC, matching the daily set.';
