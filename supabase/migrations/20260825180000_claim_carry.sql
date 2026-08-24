-- Death, and the one decision it comes with.
--
-- ---------------------------------------------------------------------------
-- WHY DEATH IS TWO STEPS AND NOT ONE
-- ---------------------------------------------------------------------------
--
-- `settle_run_week` ends a run. It does NOT wipe anything, and the gap between
-- those two is on purpose: between them sits the only interesting moment this
-- feature has. The run is over, the wins are counted, the ladder says you may
-- keep two cards, and you have thirty to choose from.
--
-- If the wipe happened at settlement the player would open the app to a result,
-- not a decision — and settlement is a cron, so the choice would have to be
-- made by a rule rather than by them. "Which two do I save" is the thing people
-- will remember and argue about. It is worth the extra state.
--
-- The state is `runs.settled_at`. Dead with it null means the death screen is
-- owed an answer; `current_run` will not start a new run over it, and
-- `set_lineup` refuses any contest with hearts on it. The free contest still
-- works throughout, which is the whole reason it risks nothing.
--
-- ---------------------------------------------------------------------------
-- WHY A WIPED CARD SETS `sold_at` AND WHAT `wiped_at` IS FOR
-- ---------------------------------------------------------------------------
--
-- `is_held` is a STORED GENERATED column over (sold_at, committed_at), and it
-- is read by eleven views and functions across this schema. Adding a third
-- terminal state properly would mean dropping that column and every dependent
-- object with it, in a migration shipping two weeks before a beta. Not worth
-- it, and not necessary.
--
-- So a wipe writes `sold_at` — read it as "the moment this copy left the
-- collection", which is what every consumer actually uses it for — with
-- `sold_for = 0`, and records the REASON in `wiped_at`. Nothing that counts a
-- collection has to change, and anything that wants to tell the player what
-- happened to a card can tell the two apart:
--
--   sold_at set, wiped_at null  ->  you sold it
--   sold_at set, wiped_at set   ->  the run took it
--
-- The card profile is the place that must make that distinction, because
-- "Sold for 0 gems" is a sentence no player should ever be shown about a card
-- they lost.

alter table public.card_instances
  add column wiped_at timestamptz;

comment on column public.card_instances.wiped_at is
  'Set when this copy was lost to a run ending, alongside sold_at (see 20260825180000). Null on an ordinary sale. The two together are how a card profile says "lost" rather than "sold for 0".';

create index card_instances_wiped_idx
  on public.card_instances (user_id) where wiped_at is not null;

-- --------------------------------------------------------------- claim_carry

create or replace function public.claim_carry(p_card_instance_ids uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_run     public.runs;
  v_slots   smallint;
  v_keep    uuid[] := coalesce(p_card_instance_ids, '{}');
  v_bad     integer;
  v_wiped   integer := 0;
  v_gems    integer := 0;
  v_h       integer;
  v_new     public.runs;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Locked, because everything below is destructive and a double-tap on a
  -- death screen is the most likely way this is ever called twice.
  select * into v_run
    from public.runs
   where user_id = v_user and ended_at is not null and settled_at is null
   order by ended_at desc
     for update
   limit 1;

  if not found then
    raise exception 'you have no ended run waiting to be claimed'
      using errcode = '22023';
  end if;

  v_slots := public.run_carry_slots(v_run.wins);

  if array_length(v_keep, 1) is not null and array_length(v_keep, 1) > v_slots then
    raise exception '% win(s) lets you keep % card(s), and you named %',
      v_run.wins, v_slots, array_length(v_keep, 1)
      using errcode = '22023';
  end if;

  -- Named twice is almost certainly a client bug, and silently de-duplicating
  -- it would quietly hand the player fewer cards than the ladder owes them.
  if array_length(v_keep, 1) is not null
     and array_length(v_keep, 1) <> (select count(distinct x) from unnest(v_keep) x) then
    raise exception 'the same card was named more than once' using errcode = '22023';
  end if;

  select count(*) into v_bad
    from unnest(v_keep) x(id)
    left join public.card_instances ci
           on ci.id = x.id and ci.user_id = v_user and ci.is_held
   where ci.id is null;

  if v_bad > 0 then
    raise exception 'you cannot keep a card you do not hold' using errcode = '42501';
  end if;

  -- 1. THE COLLECTION. Everything held and not named.
  update public.card_instances
     set sold_at = now(), sold_for = 0, wiped_at = now()
   where user_id = v_user
     and is_held
     and not (id = any (v_keep));
  get diagnostics v_wiped = row_count;

  -- 2. Lineups that were counting on those cards. A slot pointing at a card
  --    the player no longer holds would be scored by the gameday sweep as a
  --    starter that cannot score — so the entry is emptied rather than left to
  --    look filled. Scored lineups are HISTORY and are never touched; that is
  --    what `scored_at is null` is doing here.
  delete from public.lineup_slots ls
   using public.lineups l, public.card_instances ci
   where ls.lineup_id = l.id
     and l.user_id = v_user
     and l.scored_at is null
     and ci.id = ls.card_instance_id
     and ci.wiped_at is not null;

  -- 3. THE WALLET. It has to go with the cards — see the header on
  --    `20260825160000`. Gems that survive a wipe are just a slower version of
  --    selling the collection before you die: hoard currency, lose nothing.
  select balance into v_gems from public.gem_balances where user_id = v_user for update;
  v_gems := coalesce(v_gems, 0);

  if v_gems > 0 then
    update public.gem_balances set balance = 0, updated_at = now() where user_id = v_user;
    -- Ledgered, so the balance still reconciles. `idempotency_key` is the run,
    -- which can only be settled once anyway, but the belt matters here more
    -- than most places.
    insert into public.gems_ledger (user_id, amount, reason, reference_id, idempotency_key)
    values (v_user, -v_gems, 'run_wipe', v_run.id, format('run_wipe:%s', v_run.id));
  end if;

  -- 4. Close the run out and open the next one. Both here, in one transaction,
  --    because a player left holding a settled dead run and no live one has no
  --    way to ask for another.
  update public.runs set settled_at = now() where id = v_run.id;

  v_h := public.game_config_value('run_starting_hearts', 3);
  insert into public.runs (user_id, hearts, max_hearts)
  values (v_user, v_h, greatest(v_h, public.game_config_value('run_max_hearts', 5)))
  returning * into v_new;

  return jsonb_build_object(
    'ended_run',   v_run.id,
    'wins',        v_run.wins,
    'losses',      v_run.losses,
    'carry_slots', v_slots,
    'kept',        coalesce(array_length(v_keep, 1), 0),
    'cards_lost',  v_wiped,
    'gems_lost',   v_gems,
    'new_run',     v_new.id,
    'hearts',      v_new.hearts);
end;
$$;

revoke execute on function public.claim_carry(uuid[]) from public, anon;
grant  execute on function public.claim_carry(uuid[]) to authenticated;

comment on function public.claim_carry(uuid[]) is
  'Answers a death screen: keeps up to the ladder''s allowance, wipes the rest of the collection and the wallet, and starts the next run. Set progress is untouched.';

-- --------------------------------------------------------------- my_run

-- One read for every screen that shows the run: the hearts, the record, what
-- the ladder currently owes, and whether a death is waiting to be answered.
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
    'wins',         v_run.wins,
    'losses',       v_run.losses,
    'ended_at',     v_run.ended_at,
    'ended_reason', v_run.ended_reason,
    -- True exactly when the client should be showing a death screen.
    'awaiting_carry', (v_run.ended_at is not null and v_run.settled_at is null),
    'carry_slots',  public.run_carry_slots(v_run.wins),
    -- What the NEXT rung costs, so the run screen can say "two more wins and
    -- you keep another card" rather than only showing the current allowance.
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
