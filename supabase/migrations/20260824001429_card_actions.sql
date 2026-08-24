-- What you can do with a card you are holding, answered by the server.
--
-- WHY THIS EXISTS AT ALL
--
-- Pack opening now offers the two exits — sell it, or put it in a set — on the
-- reveal itself rather than sending the player to the inventory to find them.
-- To draw those two buttons honestly the client needs three facts it cannot
-- derive: what selling pays, which sets this card could still fill, and what
-- committing to each of them pays.
--
-- Every one of those is already decided somewhere in `sell_card` and
-- `commit_card_to_set`. A client that recomputed them would be writing a second
-- definition of the rules, and the two would drift on the first change — the
-- visible failure being a button that offers a commit the server then refuses,
-- or a gem figure on the button that does not match the gems that land. So the
-- rules are read back out of the same tables the write functions consult, in
-- one round trip, and the client renders what it is told.
--
-- THIS FUNCTION DECIDES NOTHING AND CHANGES NOTHING. It is `stable` and
-- `security invoker`, so RLS scopes `card_instances` to the caller. The
-- ownership filters are written out anyway, beside the RLS that already
-- implies them: RLS does not apply to the table owner, and the SQL suites
-- connect as the owner, so a function relying on it alone would report every
-- user's commits when tested and the caller's when shipped. Asking about
-- somebody else's card returns no row for it rather than an error, the same
-- way a missing id does.
--
-- ---------------------------------------------------------------------------
-- THE COPY THAT BURNS IS NOT NECESSARILY THE COPY YOU ASKED ABOUT
-- ---------------------------------------------------------------------------
--
-- `commit_card_to_set` takes a card_id — the printed card — and burns the
-- LEAST valuable eligible copy you hold, chosen by `commit_candidate`. That is
-- the right rule (a mis-tap can never cost you your best copy) but it makes
-- "add THIS card to a set" a half-truth whenever you hold a spare, and the
-- payout follows the burnt copy's tier rather than the asked-about one's.
--
-- So both facts are reported: `burns_this_copy` says whether the copy named is
-- the one that would go, and `pays` is priced off whichever copy actually
-- would. A UI that shows the second without the first would print a number
-- nobody can account for.
--
-- `held` is the other half of the same problem, read AFTER the act rather than
-- before it. Commit a player you already own a spare of and the copy in your
-- hand is still there — so the reveal must go on offering the buttons for it,
-- and must not offer them for the one that actually burnt. `sellable` cannot
-- answer that: a card standing in an unscored lineup is unsellable and very
-- much still yours.
--
-- ---------------------------------------------------------------------------
-- WHY A SET CAN APPEAR WITH `can_commit` FALSE
-- ---------------------------------------------------------------------------
--
-- Because "this set already has him" and "this set is full" are answers, and
-- dropping those rows would leave the client unable to tell them from "this
-- card is in no sets at all". The reasons are `slot_filled` and `set_complete`,
-- named separately, and `can_commit` is the single field a button binds to so
-- the client never has to assemble the conjunction itself.

create or replace function public.card_actions(p_card_instance_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with asked as (
    select distinct unnest(coalesce(p_card_instance_ids, '{}'::uuid[])) as id
  ),

  -- The copies named, and only the caller's.
  copy as (
    select ci.id,
           ci.card_id,
           ci.tier,
           ci.sold_at,
           ci.committed_at,
           ci.is_held,
           coalesce(tt.sell_value, 0) as sell_value,
           -- The one refusal `sell_card` makes that is not visible on the row.
           -- A commit no longer refuses for this (see commit_frees_lineup_slot)
           -- so it is reported against selling alone.
           exists (
             select 1
               from public.lineup_slots ls
               join public.lineups l on l.id = ls.lineup_id
              where ls.card_instance_id = ci.id
                and l.scored_at is null
           ) as in_open_lineup
      from asked a
      join public.card_instances ci on ci.id = a.id and ci.user_id = auth.uid()
      left join public.tier_thresholds tt on tt.tier = ci.tier
  ),

  -- Resolved through the same function the commit uses, so this cannot report
  -- one copy and burn another.
  burn as (
    select c.id,
           b.burn_id,
           coalesce(tt.sell_value, 0) as burn_sell_value
      from copy c
      cross join lateral (select public.commit_candidate(c.card_id) as burn_id) b
      left join public.card_instances bi on bi.id = b.burn_id
      left join public.tier_thresholds tt on tt.tier = bi.tier
  ),

  -- Every active set this printed card is a member of, with the caller's
  -- standing in it. Both counts are the commit's own: distinct card_id for
  -- progress, and "is this player already in" for the slot.
  eligible as (
    select c.id,
           s.code,
           s.name,
           s.family,
           s.subtitle,
           s.required_count,
           s.commit_payout_pct,
           (select count(distinct filled.card_id)::integer
              from public.card_instances filled
             where filled.committed_to = s.id
               and filled.user_id = auth.uid()
               and filled.committed_at is not null) as committed,
           exists (
             select 1
               from public.card_instances mine
              where mine.committed_to = s.id
                and mine.card_id = c.card_id
                and mine.user_id = auth.uid()
                and mine.committed_at is not null
           ) as slot_filled
      from copy c
      join public.card_set_members m on m.card_id = c.card_id
      join public.card_sets s on s.id = m.set_id and s.is_active
  )

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'card_instance_id', c.id,
        'card_id',          c.card_id,
        'tier',             c.tier,
        'sell_value',       c.sell_value,
        -- Still in the collection: not sold, not burnt into a set.
        'held',             c.is_held,
        -- Exactly `sell_card`'s three guards, in the order it raises them.
        'sellable',         c.sold_at is null
                              and c.committed_at is null
                              and not c.in_open_lineup,
        'burns_this_copy',  b.burn_id is not distinct from c.id,
        'sets', coalesce(
          (select jsonb_agg(
                    jsonb_build_object(
                      'code',         e.code,
                      'name',         e.name,
                      'family',       e.family,
                      'subtitle',     e.subtitle,
                      -- floor(), matching the commit exactly. A client rounding
                      -- this the other way would over-promise by a gem.
                      'pays',         floor(b.burn_sell_value * e.commit_payout_pct / 100.0)::integer,
                      'committed',    e.committed,
                      'required',     e.required_count,
                      'slot_filled',  e.slot_filled,
                      'set_complete', e.committed >= e.required_count,
                      'can_commit',   b.burn_id is not null
                                        and not e.slot_filled
                                        and e.committed < e.required_count
                    )
                    -- A daily expires at midnight and a team set does not, so
                    -- the thing with a deadline on it is offered first.
                    order by (e.family = 'daily') desc, e.name, e.code
                  )
             from eligible e
            where e.id = c.id),
          '[]'::jsonb)
      )
      order by c.id
    ),
    '[]'::jsonb)
    from copy c
    join burn b on b.id = c.id;
$$;

revoke execute on function public.card_actions(uuid[]) from public, anon;
grant  execute on function public.card_actions(uuid[]) to authenticated;

comment on function public.card_actions(uuid[]) is
  'For each held card_instance named: what selling it pays, and every active set it could still be committed to with what that pays. Read-only; every figure is read from the tables sell_card and commit_card_to_set decide against.';
