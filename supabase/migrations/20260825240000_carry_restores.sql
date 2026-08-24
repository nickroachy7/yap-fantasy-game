-- The carry becomes a RESTORE, and the death screen gets something to show.
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGED IN claim_carry
-- ---------------------------------------------------------------------------
--
-- It no longer wipes. `20260825235000` already did that, in the same statement
-- that ended the run, so by the time a player opens this screen the collection
-- and the wallet are already gone. What is left for `claim_carry` to do is give
-- back what the ladder owes and open the next run.
--
-- The validation inverts with it. It used to ask "do you HOLD this card"; it
-- now asks "did THIS RUN take this card", which is `wiped_by_run`. That is a
-- tighter question and it closes a door the old one left ajar: a card wiped by
-- an earlier run — or a card that was never yours — can never be restored by a
-- later claim, however the id was come by.
--
-- GEMS ARE NOT RESTORED, and that is the ladder being honest about its own
-- units. It is denominated in card slots for the reasons set out in
-- 20260825110000, and a wallet is not a card. A run's wins buy cards back; they
-- do not buy the balance back.
--
-- ---------------------------------------------------------------------------
-- WHY A RESTORE IS SAFE TO EXPRESS AS CLEARING THREE COLUMNS
-- ---------------------------------------------------------------------------
--
-- `is_held` is generated from (sold_at, committed_at), so clearing `sold_at`
-- puts a copy back in the collection with no further bookkeeping — the view,
-- the roster count, the lineup editor and the sell path all read it and all
-- agree again the moment it flips. `sold_for` and the two wipe columns go with
-- it so nothing is left claiming the card was sold for nothing.
--
-- The restore is capped by the ladder at three cards against a roster cap of
-- thirty, so it can never push a player over the cap it would then be blocked
-- by.

create or replace function public.claim_carry(p_card_instance_ids uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_run      public.runs;
  v_slots    smallint;
  v_keep     uuid[] := coalesce(p_card_instance_ids, '{}');
  v_bad      integer;
  v_restored integer := 0;
  v_lost     integer := 0;
  v_h        integer;
  v_new      public.runs;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Locked: a double-tap on a death screen is the likeliest way this is ever
  -- called twice, and the second call must find the run already settled.
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

  -- Named twice is a client bug, and de-duplicating it silently would hand the
  -- player fewer cards than the ladder owes them.
  if array_length(v_keep, 1) is not null
     and array_length(v_keep, 1) <> (select count(distinct x) from unnest(v_keep) x) then
    raise exception 'the same card was named more than once' using errcode = '22023';
  end if;

  -- ONLY WHAT THIS RUN TOOK. Ownership is implied by `wiped_by_run` — the wipe
  -- only ever touched this user's cards — but it is checked anyway, because
  -- this is the one function that can put a card back into a collection.
  select count(*) into v_bad
    from unnest(v_keep) x(id)
    left join public.card_instances ci
           on ci.id = x.id
          and ci.user_id = v_user
          and ci.wiped_by_run = v_run.id
   where ci.id is null;

  if v_bad > 0 then
    raise exception 'you can only keep a card this run took from you'
      using errcode = '42501';
  end if;

  select count(*) into v_lost
    from public.card_instances
   where user_id = v_user and wiped_by_run = v_run.id;

  if array_length(v_keep, 1) is not null then
    update public.card_instances
       set sold_at = null, sold_for = null, wiped_at = null, wiped_by_run = null
     where id = any (v_keep);
    get diagnostics v_restored = row_count;
  end if;

  -- Close the run out and open the next one, both here: a player left holding
  -- a settled dead run and no live one has no way to ask for another.
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
    'restored',    v_restored,
    'cards_lost',  v_lost - v_restored,
    'new_run',     v_new.id,
    'hearts',      v_new.hearts);
end;
$$;

revoke execute on function public.claim_carry(uuid[]) from public, anon;
grant  execute on function public.claim_carry(uuid[]) to authenticated;

comment on function public.claim_carry(uuid[]) is
  'Answers a death screen: restores up to the ladder''s allowance from what the run took, and starts the next run. The wipe already happened at settlement.';

-- --------------------------------------------------------------- my_lost_cards

-- The cards the dead run took, in EXACTLY the shape `my_collection` returns.
--
-- Same columns, same joins, same order — derived from that view's own
-- definition rather than written afresh, because the death screen renders them
-- with the same card component and the same client-side normaliser. Two hand-
-- written queries would drift, and the drift would show up as a card that
-- renders correctly everywhere except on the screen where it matters most.
--
-- Scoped to the run AWAITING A CARRY, so it empties itself the moment the claim
-- lands and there is no stale list to guard against.
create or replace view public.my_lost_cards
with (security_invoker = on) as
SELECT ci.id,
    ci.user_id,
    ci.card_id,
    p.full_name AS player_name,
    p.position_abbreviation,
    t.abbreviation AS team_abbreviation,
    p.injury_status,
    ci.tier,
    ci.career_fp,
    ci.lineup_starts,
    cur.min_career_fp AS tier_floor_fp,
    nxt.min_career_fp AS next_tier_at,
    nxt.tier AS next_tier_label,
    c.season,
    ci.acquired_at,
    c.player_id,
    cur.sell_value,
        CASE
            WHEN COALESCE(agg.games_played, 0::bigint) > 0 THEN round(agg.season_fp / agg.games_played::numeric, 1)
            ELSE NULL::numeric
        END AS fp_per_game,
    (EXISTS ( SELECT 1
           FROM card_instances mine
          WHERE mine.card_id = ci.card_id AND mine.user_id = ci.user_id AND mine.committed_at IS NOT NULL)) AS in_set
   FROM card_instances ci
     JOIN cards c ON c.id = ci.card_id
     JOIN players p ON p.id = c.player_id
     LEFT JOIN teams t ON t.id = p.team_id
     JOIN tier_thresholds cur ON cur.tier = ci.tier
     LEFT JOIN tier_thresholds nxt ON nxt.sort_order = (cur.sort_order + 1)
     LEFT JOIN LATERAL ( SELECT sum(fp.points) AS season_fp,
            count(*) AS games_played
           FROM stat_lines sl
             JOIN fantasy_points fp ON fp.stat_line_id = sl.id AND fp.rules_version = (( SELECT scoring_rules.version
                   FROM scoring_rules
                  WHERE scoring_rules.is_active
                 LIMIT 1))
          WHERE sl.player_id = p.id AND sl.season = c.season) agg ON true
  WHERE ci.wiped_by_run IS NOT NULL
    AND ci.wiped_by_run = ( SELECT r.id
           FROM public.runs r
          WHERE r.user_id = auth.uid() AND r.ended_at IS NOT NULL AND r.settled_at IS NULL
          ORDER BY r.ended_at DESC
         LIMIT 1);
grant select on public.my_lost_cards to authenticated;
revoke all on public.my_lost_cards from anon;

comment on view public.my_lost_cards is
  'What the unclaimed dead run took. Same shape as my_collection so one client normaliser serves both.';

-- --------------------------------------------------------------- my_run

-- `held_cards` becomes misleading the moment the wipe moves to settlement: a
-- player on a death screen holds nothing, so a run screen reporting zero says
-- nothing about what is at stake. `lost_cards` is what that screen actually
-- needs — how many the run took, which is the pool the carry is chosen from.
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
    'wagered',      coalesce((select sum(hearts_at_risk)::integer
                                from public.wagered_entries(v_run.user_id)), 0),
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
                      where user_id = v_run.user_id and is_held),
    -- Non-zero only on a death screen, and it is the size of the pool the carry
    -- is picked from.
    'lost_cards',   (select count(*) from public.card_instances
                      where user_id = v_run.user_id and wiped_by_run = v_run.id)
  );
end;
$$;

revoke execute on function public.my_run() from public, anon;
grant  execute on function public.my_run() to authenticated;
