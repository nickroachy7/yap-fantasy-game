-- Let a starter be committed to a set, by freeing the slot it is standing in.
--
-- `commit_card_to_set` refused outright when the copy sat in an unscored
-- lineup: "card is in a lineup that has not been scored yet". The reason given
-- was that burning it leaves a starter that silently scores nothing, and that
-- is a real danger — but refusing is the wrong remedy for it. The slot is ours
-- to empty. What the refusal actually cost was this: a player who had already
-- decided a card was spare could not spend it without first going to the lineup
-- screen, taking it out by hand, and coming back — and nothing on the checklist
-- told them that was why the add had failed.
--
-- So the slot is emptied here instead, in the same transaction as the burn. An
-- empty slot scores nothing either, but it SAYS so on the board and can be
-- refilled; a slot pointing at a burned card looks filled and cannot be.
--
-- THE ONE CASE STILL REFUSED is a player whose game has already kicked off.
-- `set_lineup` refuses to move those for its own edits and this has to agree
-- with it: the week is being scored against that slot as it plays, so freeing
-- it would be rewriting a result already in progress. The message says which of
-- the two situations the player is in, because "your lineup" was previously the
-- only clue and covered both.
--
-- The result gains `lineup_freed` so the client can say what actually happened
-- rather than what might have. The checklist warns on POSSIBILITY before the
-- act — it cannot know which copy `commit_candidate` will pick — and reports
-- FACT after it.

create or replace function public.commit_card_to_set(p_set_code text, p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user      uuid := auth.uid();
  v_set       public.card_sets%rowtype;
  v_balance   integer;
  v_committed integer;
  v_copy      public.card_instances%rowtype;
  v_price     integer;
  v_payout    integer;
  v_name      text;
  v_freed     integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_set
    from public.card_sets
   where code = p_set_code
     and is_active;

  if not found then
    raise exception 'no such set' using errcode = '22023';
  end if;

  -- Wallet first, always. open_pack, sell_card and claim_set_reward all take
  -- this lock before anything else, and two functions that lock the same pair
  -- in opposite orders deadlock under concurrency.
  select balance into v_balance
    from public.gem_balances
   where user_id = v_user
     for update;

  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.card_set_members
     where set_id = v_set.id and card_id = p_card_id
  ) then
    raise exception 'that card is not in this set' using errcode = '22023';
  end if;

  select count(distinct card_id)::integer into v_committed
    from public.card_instances
   where committed_to = v_set.id
     and user_id = v_user
     and committed_at is not null;

  -- REFUSED ONCE THE SET IS FULL, and this guard is protective rather than
  -- tidy. A commit into a finished set would pay half of what the sell button
  -- pays and buy nothing at all — there is no reward for filling a set beyond
  -- its requirement — so offering it at any price would be offering a trap.
  -- Lift this only if a full-checklist bonus ever exists to lift it for.
  if v_committed >= v_set.required_count then
    raise exception 'this set is already complete' using errcode = '55006';
  end if;

  if exists (
    select 1 from public.card_instances
     where committed_to = v_set.id
       and card_id = p_card_id
       and user_id = v_user
       and committed_at is not null
  ) then
    raise exception 'that card is already in this set' using errcode = '22023';
  end if;

  -- Row lock, so a double-tap cannot burn two copies for one slot: the second
  -- call waits here, then fails the already-in-this-set check above. The
  -- partial unique index is the backstop if it somehow does not.
  select * into v_copy
    from public.card_instances
   where id = public.commit_candidate(p_card_id)
     for update;

  if not found then
    raise exception 'you do not hold a copy of that card' using errcode = '42501';
  end if;

  -- Re-checked under the lock. commit_candidate read without one, so a
  -- concurrent sale of the same copy could have landed in between.
  if not v_copy.is_held or v_copy.user_id <> v_user then
    raise exception 'you do not hold a copy of that card' using errcode = '42501';
  end if;

  -- Kicked off is the one thing that cannot be undone. See the header.
  if exists (
    select 1
      from public.lineup_slots ls
      join public.lineups l  on l.id = ls.lineup_id
      join public.cards    cd on cd.id = v_copy.card_id
      join public.players  pl on pl.id = cd.player_id
      join public.games    g
        on g.season = l.season
       and g.season_type = l.season_type
       and g.week = l.week
       and (g.home_team_id = pl.team_id or g.visitor_team_id = pl.team_id)
     where ls.card_instance_id = v_copy.id
       and l.scored_at is null
       and public.game_has_started(g.status_state, g.starts_at)
  ) then
    raise exception 'that player has already kicked off and cannot leave your lineup'
      using errcode = '55006';
  end if;

  -- Free whatever unscored slots hold this copy. Scored lineups are history and
  -- are deliberately untouched: their slots record what was started that week,
  -- and rewriting them would change a result that has already been paid out.
  delete from public.lineup_slots ls
   using public.lineups l
   where ls.lineup_id = l.id
     and ls.card_instance_id = v_copy.id
     and l.scored_at is null;
  get diagnostics v_freed = row_count;

  select sell_value into v_price
    from public.tier_thresholds
   where tier = v_copy.tier;

  v_payout := floor(coalesce(v_price, 0) * v_set.commit_payout_pct / 100.0)::integer;

  update public.card_instances
     set committed_at  = now(),
         committed_to  = v_set.id,
         committed_for = v_payout
   where id = v_copy.id;

  -- gems_ledger has CHECK (amount <> 0), so a zero payout is recorded on the
  -- card and nothing in the ledger, rather than failing the commit.
  if v_payout > 0 then
    update public.gem_balances
       set balance = balance + v_payout, updated_at = now()
     where user_id = v_user;

    insert into public.gems_ledger (user_id, amount, reason, reference_id)
    values (v_user, v_payout, 'set_commit', v_copy.id);
  end if;

  select pl.full_name into v_name
    from public.cards cd
    join public.players pl on pl.id = cd.player_id
   where cd.id = p_card_id;

  return jsonb_build_object(
    'set_code',         v_set.code,
    'set_name',         v_set.name,
    'card_id',          p_card_id,
    'card_instance_id', v_copy.id,
    'player_name',      v_name,
    'tier',             v_copy.tier,
    'paid',             v_payout,
    'sell_value',       coalesce(v_price, 0),
    'committed',        v_committed + 1,
    'required',         v_set.required_count,
    'complete',         (v_committed + 1) >= v_set.required_count,
    'balance',          v_balance + v_payout,
    'lineup_freed',     v_freed > 0
  );
end;
$function$;

-- The batch wrapper, unchanged except that it counts how many slots were freed
-- so one summary line can report it.
create or replace function public.commit_cards_to_set(p_set_code text, p_card_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user    uuid := auth.uid();
  v_card    uuid;
  v_one     jsonb;
  v_done    jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_paid    integer := 0;
  v_freed   integer := 0;
  v_balance integer;
  v_set     public.card_sets%rowtype;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    raise exception 'no cards were named' using errcode = '22023';
  end if;

  -- A ceiling well above the largest set (34 cards) but low enough that a
  -- runaway client cannot ask for ten thousand commits in one statement.
  if array_length(p_card_ids, 1) > 64 then
    raise exception 'too many cards in one request: % (max 64)', array_length(p_card_ids, 1)
      using errcode = '22023';
  end if;

  -- Resolved once, only so the summary can report against it. Every actual
  -- rule is checked per card, inside commit_card_to_set.
  select * into v_set from public.card_sets where code = p_set_code and is_active;
  if not found then
    raise exception 'no such set' using errcode = '22023';
  end if;

  foreach v_card in array p_card_ids loop
    begin
      v_one := public.commit_card_to_set(p_set_code, v_card);
      v_paid := v_paid + coalesce((v_one ->> 'paid')::integer, 0);
      if coalesce((v_one ->> 'lineup_freed')::boolean, false) then
        v_freed := v_freed + 1;
      end if;
      v_done := v_done || jsonb_build_array(v_one);
    exception when others then
      -- The refusal's own words. Every one of them is written to be shown to a
      -- player, so there is nothing to translate here.
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('card_id', v_card, 'reason', sqlerrm)
      );
    end;
  end loop;

  select balance into v_balance from public.gem_balances where user_id = v_user;

  return jsonb_build_object(
    'set_code',     v_set.code,
    'set_name',     v_set.name,
    'added',        jsonb_array_length(v_done),
    'skipped',      jsonb_array_length(v_skipped),
    'paid',         v_paid,
    'lineup_freed', v_freed,
    'cards',        v_done,
    'refusals',     v_skipped,
    -- Read back rather than accumulated: the loop's own commits moved it, and a
    -- figure derived here would be one more thing that could disagree with the
    -- wallet.
    'committed',    (select count(distinct card_id)::integer
                       from public.card_instances
                      where committed_to = v_set.id
                        and user_id = v_user
                        and committed_at is not null),
    'required',     v_set.required_count,
    'balance',      v_balance
  );
end;
$function$;
