-- Death takes everything at settlement. The carry gives some back.
--
-- ---------------------------------------------------------------------------
-- THE HOLE THIS CLOSES: NOBODY HAD TO CLAIM
-- ---------------------------------------------------------------------------
--
-- Until now `settle_run_week` ended a run and `claim_carry` did the wiping, so
-- the wipe only happened if the player asked for it. Nothing forced them to,
-- and nothing expired the offer. That made the whole mechanic optional:
--
--   die -> never open the death screen -> keep the entire collection and the
--   entire wallet, forever, and go on playing the free contest and opening
--   packs. You forfeit the carry and every future run, and you lose nothing.
--
-- Worse, the incentive scaled the wrong way: the bigger the collection, the
-- more attractive refusing to claim became. The players the wipe was aimed at
-- were exactly the ones best placed to decline it.
--
-- The post-death window had a second leak of its own. `wagered_entries` — the
-- sell lock — only fires while an entry is UNSCORED, and by the time
-- settlement has killed a run its lineups are scored. So a dead-but-unclaimed
-- player could also liquidate freely. Both leaks close the same way, and it is
-- the same principle the escrow was built on (20260825160000): A WIPE IS
-- DEFEATED BY ANY GAP BETWEEN THE DEATH AND THE TAKING. So there is no gap.
--
-- ---------------------------------------------------------------------------
-- THE INVERSION, AND WHY THE CHOICE SURVIVES IT
-- ---------------------------------------------------------------------------
--
-- Death now wipes in the same transaction that ends the run. The death screen
-- stops being a rescue and becomes a RESTORE: the ladder's allowance is taken
-- out of what the run already took, rather than held back from it.
--
-- The reason to split death into two steps in the first place — 20260825180000
-- argued it at length — was that "which two do I save" is the most interesting
-- moment the feature has, and a cron cannot make that decision for somebody.
-- That is untouched. Choosing which two cards come BACK is the same decision as
-- choosing which two survive; it is just made after the loss is real instead of
-- instead of it. What is lost is only the opportunity to not answer.
--
-- ---------------------------------------------------------------------------
-- WHY THE WIPE IS A FUNCTION AND NOT INLINE IN SETTLEMENT
-- ---------------------------------------------------------------------------
--
-- It is the most destructive routine in the codebase and it now runs from a
-- CRON rather than from a player's tap. That earns it its own name, its own
-- comment, and its own place to be tested. It also has exactly one caller by
-- design: nothing but the transition to `ended_at` may invoke it, which is what
-- makes it exactly-once without needing a flag of its own.

alter table public.card_instances
  add column wiped_by_run uuid references public.runs on delete set null;

comment on column public.card_instances.wiped_by_run is
  'The run whose death took this copy. Non-null exactly when wiped_at is, and it is what makes a carry RESTORABLE: claim_carry can only give back cards this run took.';

-- Non-null together or not at all. A wiped card with no run cannot be restored
-- by anybody and would be silently unreachable.
alter table public.card_instances add constraint card_instances_wiped_together
  check ((wiped_at is null) = (wiped_by_run is null));

create index card_instances_wiped_by_run_idx
  on public.card_instances (wiped_by_run) where wiped_by_run is not null;

-- --------------------------------------------------------------- wipe_run

create or replace function public.wipe_run(p_run uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run   public.runs;
  v_cards integer := 0;
  v_gems  integer := 0;
begin
  select * into v_run from public.runs where id = p_run;
  if not found then
    raise exception 'no such run: %', p_run using errcode = '22023';
  end if;
  -- Called only on the transition to ended. A live run reaching here would be
  -- a wipe on somebody still playing, which is the one thing this must not do.
  if v_run.ended_at is null then
    raise exception 'refusing to wipe a live run' using errcode = '55006';
  end if;

  -- 1. THE COLLECTION. Everything still held. Committed copies are already out
  --    of it and are set progress besides, so they are untouched — which is the
  --    promise the whole feature is sold on.
  update public.card_instances
     set sold_at = now(), sold_for = 0, wiped_at = now(), wiped_by_run = p_run
   where user_id = v_run.user_id
     and is_held;
  get diagnostics v_cards = row_count;

  -- 2. Lineups counting on those cards. A slot pointing at a card the player no
  --    longer holds would be scored by the sweep as a starter that cannot
  --    score, so the entry is emptied rather than left looking filled. Scored
  --    lineups are HISTORY and are never touched.
  delete from public.lineup_slots ls
   using public.lineups l, public.card_instances ci
   where ls.lineup_id = l.id
     and l.user_id = v_run.user_id
     and l.scored_at is null
     and ci.id = ls.card_instance_id
     and ci.wiped_by_run = p_run;

  -- 3. THE WALLET. It goes with the cards or it is a slower version of selling
  --    the collection before you die — see 20260825160000.
  select balance into v_gems from public.gem_balances
   where user_id = v_run.user_id for update;
  v_gems := coalesce(v_gems, 0);

  if v_gems > 0 then
    update public.gem_balances set balance = 0, updated_at = now()
     where user_id = v_run.user_id;
    -- Keyed on the run, which can only die once. Ledgered rather than silently
    -- zeroed so the balance still reconciles: the screen a player will scour
    -- hardest for an accounting error is the one that just took everything.
    insert into public.gems_ledger (user_id, amount, reason, reference_id, idempotency_key)
    values (v_run.user_id, -v_gems, 'run_wipe', p_run, format('run_wipe:%s', p_run));
  end if;

  return jsonb_build_object('run', p_run, 'cards', v_cards, 'gems', v_gems);
end;
$$;

revoke execute on function public.wipe_run(uuid) from public, anon, authenticated;

comment on function public.wipe_run(uuid) is
  'Takes a dead run''s collection and wallet. Called ONLY from settle_run_week, on the transition to ended — that transition is what makes it exactly-once. Set progress and committed copies survive.';
