-- Hearts that are RIDING on something, as a fact the game can name.
--
-- ---------------------------------------------------------------------------
-- THE BUG THIS STARTS FROM
-- ---------------------------------------------------------------------------
--
-- `my_run` returned `hearts` and `max_hearts`, and the chrome drew one pip per
-- max_heart, filled up to hearts. A new run starts on 3 and heals to a ceiling
-- of 5, so THE FIRST THING A NEW PLAYER EVER SEES IS THREE FILLED HEARTS AND
-- TWO EMPTY ONES — a run that has lost nothing, drawn as a run that has already
-- taken two losses. Exactly backwards on the one screen that sets expectations.
--
-- The deeper fault is that the empty pip was doing two unrelated jobs at once:
-- "you lost this" and "you could still heal into this". Those must never look
-- the same, and a masthead has no room to distinguish them. So headroom stops
-- being drawn at all — the ceiling is a sentence for the run panel, not a row
-- of ghosts on every screen — and the empty pip is freed up for the state that
-- actually matters week to week.
--
-- ---------------------------------------------------------------------------
-- WHICH IS: WAGERED
-- ---------------------------------------------------------------------------
--
-- A heart has three conditions and only two of them were ever visible. It is
-- held and safe; or it is held but RIDING on a contest that has not settled; or
-- it is gone. The middle one is the whole game — a player with three hearts who
-- has already staked two on this week's slate has ONE left to spend, and
-- nothing in the app said so. They would read "3" and enter a third contest
-- believing they had room for it.
--
-- `wagered` is that number. Being able to see it is what makes "should I enter
-- this one too" a decision rather than a guess.
--
-- ---------------------------------------------------------------------------
-- ONE PREDICATE, TWO CALLERS
-- ---------------------------------------------------------------------------
--
-- "Which entries have hearts riding on them" is now asked in two places, and
-- they MUST agree: `sell_card` refuses a sale while hearts are exposed, and the
-- chrome draws exactly those hearts as at-risk. A player told they cannot sell,
-- looking at a rack with nothing marked, has been shown a contradiction.
--
-- Two copies of a predicate drift. This session already produced one regression
-- of precisely that shape — see `20260825200000` — so the predicate is a
-- function and both callers read it. `sell_card` below is its body read back
-- from the database with only that substitution made.

create or replace function public.wagered_entries(p_user uuid)
returns table (lineup_id uuid, contest_id uuid, hearts_at_risk smallint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.id, c.id, c.hearts_at_risk
    from public.lineups l
    join public.contests c on c.id = l.contest_id
   where l.user_id = p_user
     -- UNSETTLED, which is what `scored_at is null` means here: the window
     -- opens when the entry is filed and closes when the sweep scores it, and
     -- the run can only be killed inside it.
     and l.scored_at is null
     and c.hearts_at_risk > 0;
$$;

revoke execute on function public.wagered_entries(uuid) from public, anon, authenticated;

comment on function public.wagered_entries(uuid) is
  'The entries with hearts riding on them right now. The single definition of "exposed" — read by the sell lock and by my_run, which must never disagree.';

-- --------------------------------------------------- sell_card, unchanged but
-- for reading the predicate above rather than restating it.

CREATE OR REPLACE FUNCTION public.sell_card(p_card_instance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_balance integer;
  v_card    public.card_instances%rowtype;
  v_price   integer;
  v_name    text;
  v_at_risk text;
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

  -- ESCROW. See this migration's header: while a run has hearts riding on an
  -- unsettled contest, the collection is not for sale. Named contests, because
  -- a refusal a player cannot act on is worse than no refusal at all — and the
  -- action here is a real one, since leaving a lobby contest before kickoff
  -- refunds the fee and lifts the lock.
  select string_agg(distinct c.name, ', ') into v_at_risk
    from public.wagered_entries(v_user) w
    join public.contests c on c.id = w.contest_id;

  if v_at_risk is not null then
    raise exception
      'cannot sell while your run has hearts riding on %: leave it before kickoff, or commit the card to a set instead',
      v_at_risk
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
$function$;
revoke execute on function public.sell_card(uuid) from public, anon;
grant  execute on function public.sell_card(uuid) to authenticated;

-- --------------------------------------------------------------- my_run

-- `max_hearts` STAYS IN THE PAYLOAD even though the chrome stops drawing it.
-- The death screen still needs a rack to empty, and the run panel says the
-- ceiling in words ("heals to 5"). What changed is where it is allowed to be
-- read as a count of pips — nowhere.
create or replace function public.my_run()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.runs;
begin
  v_run := public.current_run();
  return jsonb_build_object(
    'id',           v_run.id,
    'started_at',   v_run.started_at,
    'hearts',       v_run.hearts,
    'max_hearts',   v_run.max_hearts,
    -- Hearts riding on a contest that has not settled. May EXCEED `hearts`:
    -- risking two while holding one is legal (settlement clamps the floor at
    -- zero), and a player doing it should see every heart they hold marked.
    'wagered',      coalesce((select sum(hearts_at_risk)::integer
                                from public.wagered_entries(v_run.user_id)), 0),
    -- How many entries those hearts are spread across, so the run panel can
    -- say "2 contests" rather than making the player count pips.
    'wagered_in',   (select count(*)::integer from public.wagered_entries(v_run.user_id)),
    'wins',         v_run.wins,
    'losses',       v_run.losses,
    'ended_at',     v_run.ended_at,
    'ended_reason', v_run.ended_reason,
    'awaiting_carry', (v_run.ended_at is not null and v_run.settled_at is null),
    'carry_slots',  public.run_carry_slots(v_run.wins),
    'next_rung',    (select jsonb_build_object('at_wins', min_wins, 'card_slots', card_slots)
                       from public.run_carry_ladder
                      where min_wins > v_run.wins
                      order by min_wins limit 1),
    'held_cards',   (select count(*) from public.card_instances
                      where user_id = v_run.user_id and is_held)
  );
end;
$$;

revoke execute on function public.my_run() from public, anon;
grant  execute on function public.my_run() to authenticated;
