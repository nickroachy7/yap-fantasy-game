-- Gems are coins.
--
-- The currency was called gems everywhere: two tables, an enum, eleven columns,
-- two view columns, two function names and thirty function bodies. The name was
-- the only thing wrong with it, so this migration renames and changes nothing
-- else.
--
-- Every step is ALTER ... RENAME, which is a catalog write. No table is
-- rewritten, no row is touched, and the 927 ledger rows are the same rows
-- afterwards. Indexes, foreign keys, check constraints and RLS policies keep
-- working automatically because they bind to OIDs rather than to names -- the
-- renames of those below are cosmetic, so that grepping for "coin" finds them.
--
-- Function BODIES do not follow, because plpgsql is stored as text. All thirty
-- are recreated. Seven return TABLE(...) with a gem-named output column, and
-- CREATE OR REPLACE cannot change a return type, so those seven are dropped
-- first -- which also drops their grants, re-issued at the end.
--
-- coin_reason's VALUES never said gems (signup_bonus, card_sale, weekly_grant),
-- so only the type name changes and no data is rewritten.

-- 1. the enum type
alter type public.gem_reason rename to coin_reason;

-- 2. the two tables
alter table public.gems_ledger rename to coins_ledger;
alter table public.gem_balances rename to coin_balances;

-- 3. columns on base tables
alter table public.card_set_ladder_defaults rename column reward_gems to reward_coins;
alter table public.card_set_milestones rename column reward_gems to reward_coins;
alter table public.contests rename column entry_fee_gems to entry_fee_coins;
alter table public.lineup_slots rename column bonus_gems to bonus_coins;
alter table public.lineup_slots rename column gem_multiplier to coin_multiplier;
alter table public.lineup_slots rename column gems_awarded to coins_awarded;
alter table public.pack_openings rename column gems_spent to coins_spent;
alter table public.packs rename column gem_cost to coin_cost;
alter table public.position_bonus_tiers rename column reward_gems to reward_coins;
alter table public.set_milestone_claims rename column reward_gems to reward_coins;
alter table public.tier_thresholds rename column gem_multiplier to coin_multiplier;

-- 4. the view my_sets: a view fixes its own output column names at
--    creation, so they do not follow the rename underneath.
alter view public.my_sets rename column claimable_gems to claimable_coins;
alter view public.my_sets rename column claimed_gems to claimed_coins;

-- 5. the two gem-named functions (rename keeps their grants)
alter function public.award_score_gems(p_season integer, p_season_type smallint, p_week integer, p_per_point numeric) rename to award_score_coins;
alter function public.grant_weekly_gems(p_season integer, p_season_type smallint, p_week integer, p_amount integer) rename to grant_weekly_coins;

-- 6. cosmetic: constraint, index and policy names
alter table public.card_set_ladder_defaults rename constraint card_set_ladder_defaults_reward_gems_check to card_set_ladder_defaults_reward_coins_check;
alter table public.card_set_milestones rename constraint card_set_milestones_reward_gems_check to card_set_milestones_reward_coins_check;
alter table public.contests rename constraint contests_entry_fee_gems_check to contests_entry_fee_coins_check;
alter table public.coin_balances rename constraint gem_balances_balance_check to coin_balances_balance_check;
alter table public.coin_balances rename constraint gem_balances_pkey to coin_balances_pkey;
alter table public.coin_balances rename constraint gem_balances_user_id_fkey to coin_balances_user_id_fkey;
alter table public.coins_ledger rename constraint gems_ledger_amount_check to coins_ledger_amount_check;
alter table public.coins_ledger rename constraint gems_ledger_pkey to coins_ledger_pkey;
alter table public.coins_ledger rename constraint gems_ledger_user_id_fkey to coins_ledger_user_id_fkey;
alter table public.pack_openings rename constraint pack_openings_gems_spent_check to pack_openings_coins_spent_check;
alter table public.packs rename constraint packs_gem_cost_check to packs_coin_cost_check;
alter table public.position_bonus_tiers rename constraint position_bonus_tiers_reward_gems_check to position_bonus_tiers_reward_coins_check;
alter table public.set_milestone_claims rename constraint set_completions_reward_gems_check to set_completions_reward_coins_check;
alter table public.tier_thresholds rename constraint tier_thresholds_gem_multiplier_check to tier_thresholds_coin_multiplier_check;
alter index public.gems_ledger_idempotency_key_idx rename to coins_ledger_idempotency_key_idx;
alter index public.gems_ledger_user_idx rename to coins_ledger_user_idx;
alter policy "users read their own gem balance" on public.coin_balances rename to "users read their own coin balance";
alter policy "users read their own gem ledger" on public.coins_ledger rename to "users read their own coin ledger";

-- 7. drop the seven whose TABLE(...) output names change
drop function if exists public.board_collection(p_season integer, p_limit integer);
drop function if exists public.board_sets(p_limit integer);
drop function if exists public.contest_history(p_limit integer, p_before timestamp with time zone, p_before_id uuid);
drop function if exists public.contest_lineup(p_contest uuid, p_user uuid);
drop function if exists public.contest_lobby();
drop function if exists public.contest_payouts(p_contest uuid);
drop function if exists public.my_contest_cards(p_include text);

-- 8. all thirty bodies, rewritten.
--
--    ORDER MATTERS HERE. These functions call each other and a SQL-language
--    body is parsed at CREATE time, so a caller defined before its callee
--    fails outright -- which is exactly how the first attempt at this
--    migration died, on contest_payouts. The seven dropped above are
--    therefore emitted FIRST, ahead of the twenty-three that only needed
--    replacing, so every callee exists by the time a caller is read.
--
--    That ordering is load-bearing rather than tidy: `supabase db push` does
--    not wrap a migration in a transaction, so there is no SET LOCAL to fall
--    back on and no rollback if a body fails to parse. This applied with
--    check_function_bodies at its default ON, which means every one of the
--    thirty was validated by Postgres on the way in.
CREATE OR REPLACE FUNCTION public.board_collection(p_season integer DEFAULT NULL::integer, p_limit integer DEFAULT 100)
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, value_coins bigint, held bigint, in_sets bigint, in_sets_coins bigint, players bigint, gold_plus bigint, diamond bigint, career_fp numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with owned as (
    select ci.user_id,
           count(*) filter (where ci.is_held)                     as held,
           count(*) filter (where ci.committed_at is not null)     as in_sets,
           count(distinct ci.card_id)                             as players,
           sum(t.sell_value)::bigint                              as value_coins,
           sum(t.sell_value) filter (where ci.committed_at is not null)::bigint as in_sets_coins,
           count(*) filter (where ci.tier in ('gold', 'diamond'))  as gold_plus,
           count(*) filter (where ci.tier = 'diamond')             as diamond,
           sum(ci.career_fp)                                       as career_fp
      from public.card_instances ci
      join public.cards c            on c.id = ci.card_id
      join public.tier_thresholds t  on t.tier = ci.tier
     where ci.sold_at is null
       and (p_season is null or c.season = p_season)
     group by ci.user_id
  )
  select rank() over (order by o.value_coins desc, pr.display_name asc),
         o.user_id,
         pr.display_name,
         o.value_coins,
         o.held,
         o.in_sets,
         coalesce(o.in_sets_coins, 0),
         o.players,
         o.gold_plus,
         o.diamond,
         o.career_fp
    from owned o
    join public.profiles pr on pr.id = o.user_id
   order by o.value_coins desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$
;

CREATE OR REPLACE FUNCTION public.board_sets(p_limit integer DEFAULT 100)
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, rungs bigint, sets bigint, completed bigint, dailies bigint, burned bigint, coins bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with claims as (
    select cl.user_id, cl.set_id, s.family, cl.threshold_pct, cl.reward_coins
      from public.set_milestone_claims cl
      join public.card_sets s on s.id = cl.set_id
  ),
  burnt as (
    select ci.user_id, count(*) as burned
      from public.card_instances ci
     where ci.committed_at is not null
     group by ci.user_id
  ),
  -- Driven by the union rather than by claims alone, so somebody who has burnt
  -- cards into a set and not yet reached its first rung still appears — showing
  -- a cost with nothing bought yet, which is a true and useful row.
  people as (
    select user_id from claims
    union
    select user_id from burnt
  ),
  tallied as (
    select pe.user_id,
           count(c.set_id) filter (where c.family <> 'daily')                       as rungs,
           count(distinct c.set_id) filter (where c.family <> 'daily')              as sets,
           count(c.set_id) filter (where c.family <> 'daily' and c.threshold_pct = 100) as completed,
           count(distinct c.set_id) filter (where c.family = 'daily')               as dailies,
           coalesce(sum(c.reward_coins), 0)::bigint                                  as coins
      from people pe
      left join claims c on c.user_id = pe.user_id
     group by pe.user_id
  )
  select rank() over (
           order by ta.rungs desc, ta.dailies desc, ta.coins desc, pr.display_name asc
         ),
         ta.user_id,
         pr.display_name,
         ta.rungs,
         ta.sets,
         ta.completed,
         ta.dailies,
         coalesce(b.burned, 0),
         ta.coins
    from tallied ta
    join public.profiles pr on pr.id = ta.user_id
    left join burnt b on b.user_id = ta.user_id
   order by ta.rungs desc, ta.dailies desc, ta.coins desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$
;

CREATE OR REPLACE FUNCTION public.contest_history(p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contest_id uuid, code text, name text, kind text, season integer, season_type text, week integer, points numeric, rnk bigint, entrants bigint, result text, hearts_delta smallint, prize_coins integer, finalized_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with mine as (
    select l.id, l.contest_id, l.total_points, l.finalized_at
      from public.lineups l
     where l.user_id = auth.uid()
       and l.finalized_at is not null
       -- KEYSET. Strictly older than the cursor, ties broken by id so a slate
       -- settled in one sweep pages without repeating or skipping.
       and (
         p_before is null
         or l.finalized_at < p_before
         or (l.finalized_at = p_before and p_before_id is not null and l.contest_id < p_before_id)
       )
     order by l.finalized_at desc, l.contest_id desc
     limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  select c.id,
         c.code,
         c.name,
         c.kind::text,
         c.season,
         c.season_type::text,
         c.week,
         m.total_points,
         cr.rnk,
         cr.entrants,
         cr.result,
         rcr.hearts_delta,
         cp.coins,
         m.finalized_at
    from mine m
    join public.contests c on c.id = m.contest_id
    -- Ranked against the field as it finished. Called per row rather than once,
    -- which is what the page size is for: twenty of these is twenty small
    -- window queries, and an unpaged season would be fifty.
    left join lateral (
      select r.rnk, r.entrants, r.result
        from public.contest_results(m.contest_id) r
       where r.lineup_id = m.id
    ) cr on true
    left join lateral (
      select p.coins from public.contest_payouts(m.contest_id) p where p.lineup_id = m.id
    ) cp on true
    -- Frozen at settlement. Absent for every contest that staked nothing, which
    -- is why it is a LEFT join and why it is not the driving table.
    left join public.run_contest_results rcr
           on rcr.contest_id = m.contest_id and rcr.user_id = auth.uid()
   order by m.finalized_at desc, c.id desc;
$function$
;

CREATE OR REPLACE FUNCTION public.contest_lineup(p_contest uuid, p_user uuid)
 RETURNS TABLE(slot text, player_id uuid, player_name text, pos text, team text, tier card_tier, points numeric, started boolean, career_fp numeric, tier_floor_fp numeric, next_tier_at numeric, next_tier_label card_tier, coins integer, bonus_coins integer, awarded boolean, opponent text, home boolean, starts_at timestamp with time zone, status_state text, status_text text, team_score integer, opp_score integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_exists boolean;
begin
  select true into v_exists from public.lineups l
   where l.contest_id = p_contest and l.user_id = p_user limit 1;
  if v_exists is null then
    raise exception 'that player is not in this contest' using errcode = '22023';
  end if;
  return query
    select ls.slot, p.id, p.full_name,
           coalesce(p.position_abbreviation, p.position), t.abbreviation,
           ci.tier, ls.points,
           coalesce(public.game_has_started(g.status_state, g.starts_at), false),
           ci.career_fp, cur.min_career_fp, nxt.min_career_fp, nxt.tier,
           ls.coins_awarded, ls.bonus_coins, ls.coins_awarded is not null,
           case
             when p.team_id = g.home_team_id    then vt.abbreviation
             when p.team_id = g.visitor_team_id then ht.abbreviation
           end,
           case when p.team_id is null then null else p.team_id = g.home_team_id end,
           g.starts_at, g.status_state, g.status,
           case
             when p.team_id = g.home_team_id    then g.home_score
             when p.team_id = g.visitor_team_id then g.visitor_score
           end,
           case
             when p.team_id = g.home_team_id    then g.visitor_score
             when p.team_id = g.visitor_team_id then g.home_score
           end
      from public.lineups l
      join public.contests ct on ct.id = l.contest_id
      join public.lineup_slots ls on ls.lineup_id = l.id
      join public.card_instances ci on ci.id = ls.card_instance_id
      join public.cards cd on cd.id = ci.card_id
      join public.players p on p.id = cd.player_id
      left join public.teams t on t.id = p.team_id
      join public.tier_thresholds cur on cur.tier = ci.tier
      left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1
      left join public.contest_format_slots fs
             on fs.format_code = ct.format_code and fs.slot = ls.slot
      left join public.games g
             on g.season = l.season and g.season_type = l.season_type and g.week = l.week
            and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
      left join public.teams ht on ht.id = g.home_team_id
      left join public.teams vt on vt.id = g.visitor_team_id
     where l.contest_id = p_contest and l.user_id = p_user
     order by fs.display_order nulls last, ls.slot;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.contest_lobby()
 RETURNS TABLE(id uuid, code text, kind contest_kind, name text, format_code text, format_name text, slot_count smallint, entry_fee_coins integer, max_entrants integer, entrants integer, season integer, season_type smallint, week integer, my_lineup_id uuid, my_filled integer, affordable boolean, win_condition contest_win_condition, win_rank integer, hearts_at_risk smallint, hearts_on_win smallint, my_hearts smallint, prize_pool_bps smallint, prize_pool integer, recap boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with slate as (select * from public.lineup_slate() limit 1),
  past as (select * from public.recap_slate() limit 1),
  wallet as (
    select coalesce((select balance from public.coin_balances where user_id = auth.uid()), 0) as balance
  ),
  run as (
    select hearts from public.runs where user_id = auth.uid() and ended_at is null
  ),
  rows as (
    select c.*, false as recap
      from public.contests c
      join slate s
        on s.season = c.season and s.season_type = c.season_type and s.week = c.week
    union all
    select c.*, true
      from public.contests c
      join past p
        on p.season = c.season and p.season_type = c.season_type and p.week = c.week
     where exists (
       select 1 from public.lineups l
        where l.contest_id = c.id and l.user_id = auth.uid()
     )
  )
  select c.id, c.code, c.kind, c.name,
         c.format_code, f.name, f.slot_count,
         c.entry_fee_coins, c.max_entrants,
         public.contest_entrants(c.id),
         c.season, c.season_type, c.week,
         l.id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = l.id), 0),
         (l.id is not null or (select balance from wallet) >= c.entry_fee_coins),
         c.win_condition, c.win_rank,
         c.hearts_at_risk, c.hearts_on_win,
         (select hearts from run),
         c.prize_pool_bps,
         public.contest_prize_pool(c.id),
         c.recap
    from rows c
    join public.contest_formats f on f.code = c.format_code
    left join public.lineups l
           on l.contest_id = c.id and l.user_id = auth.uid()
   order by c.recap, c.kind, c.hearts_at_risk, c.entry_fee_coins, c.name;
$function$
;

CREATE OR REPLACE FUNCTION public.contest_payouts(p_contest uuid)
 RETURNS TABLE(user_id uuid, lineup_id uuid, rnk bigint, coins integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with c as (
    select win_condition, win_rank from public.contests where id = p_contest
  ),
  pool as (select public.contest_prize_pool(p_contest) as coins),
  winners as (
    select r.user_id, r.lineup_id, r.rnk,
           (case when c.win_condition = 'top_n'
                 then greatest(1, c.win_rank + 1 - r.rnk)
                 else 1 end)::numeric as weight
      from public.contest_results(p_contest) r
      cross join c
     -- Null is NO RESULT — week not final, field too small to be a contest.
     -- Nothing is owed until there is a result.
     where r.result = 'W'
  ),
  total as (select sum(weight) as weight from winners)
  select w.user_id, w.lineup_id, w.rnk,
         floor((select coins from pool) * w.weight
               / nullif((select weight from total), 0))::integer
    from winners w
   where (select coins from pool) > 0;
$function$
;

CREATE OR REPLACE FUNCTION public.my_contest_cards(p_include text DEFAULT NULL::text)
 RETURNS TABLE(contest_id uuid, code text, kind contest_kind, name text, format_code text, format_name text, slot_count smallint, entry_fee_coins integer, season integer, season_type smallint, week integer, lineup_id uuid, filled integer, entrants bigint, low numeric, median numeric, average numeric, high numeric, final boolean, my_points numeric, my_rank bigint, ahead bigint, result text, hearts_at_risk smallint, hearts_on_win smallint, win_condition contest_win_condition, win_rank integer, cut numeric, prize_pool integer, my_prize integer, my_coins integer, recap boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with slate as (select * from public.lineup_slate() limit 1),
  past as (select * from public.recap_slate() limit 1),
  mine as (
    select c.*, l.id as lineup_id, l.total_points as my_points, false as recap
      from public.contests c
      join slate s on s.season = c.season and s.season_type = c.season_type and s.week = c.week
      left join public.lineups l on l.contest_id = c.id and l.user_id = auth.uid()
     where l.id is not null or c.code = p_include or c.kind = 'free'
    union all
    select c.*, l.id, l.total_points, true
      from public.contests c
      join past p on p.season = c.season and p.season_type = c.season_type and p.week = c.week
      join public.lineups l on l.contest_id = c.id and l.user_id = auth.uid()
  ),
  entries as (
    select l.contest_id, l.user_id, l.total_points as pts
      from public.lineups l
      join mine m on m.id = l.contest_id
     where exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select e.contest_id, count(*) as entrants, min(e.pts) as low,
           round((percentile_cont(0.5) within group (order by e.pts::double precision))::numeric, 2) as median,
           round(avg(e.pts), 2) as average, max(e.pts) as high
      from entries e group by e.contest_id
  ),
  ranked as (
    select e.contest_id, e.user_id, e.pts,
           rank() over (partition by e.contest_id order by e.pts desc) as rnk
      from entries e
  ),
  cutline as (
    select r.contest_id, min(r.pts) as cut
      from ranked r join mine m on m.id = r.contest_id
     where m.win_condition = 'top_n' and r.rnk <= m.win_rank
     group by r.contest_id
  )
  select m.id, m.code, m.kind, m.name,
         m.format_code, f.name, f.slot_count, m.entry_fee_coins,
         m.season, m.season_type, m.week, m.lineup_id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = m.lineup_id), 0),
         coalesce(fl.entrants, 0), fl.low, fl.median, fl.average, fl.high,
         coalesce(fin.final, false), m.my_points, r.rnk,
         case when r.pts is null then null
              else (select count(*) from entries x where x.contest_id = m.id and x.pts < r.pts) end,
         cr.result, m.hearts_at_risk, m.hearts_on_win,
         m.win_condition, m.win_rank, cl.cut,
         public.contest_prize_pool(m.id),
         cp.coins,
         (select sum(coalesce(ls.coins_awarded, 0) + coalesce(ls.bonus_coins, 0))::integer
            from public.lineup_slots ls
           where ls.lineup_id = m.lineup_id and ls.coins_awarded is not null),
         m.recap
    from mine m
    join public.contest_formats f on f.code = m.format_code
    left join field fl on fl.contest_id = m.id
    left join ranked r on r.contest_id = m.id and r.user_id = auth.uid()
    left join cutline cl on cl.contest_id = m.id
    left join lateral (
      select bool_and(lower(coalesce(g.status_state, '')) in ('final','complete','completed')) as final
        from public.games g
       where g.season = m.season and g.season_type = m.season_type and g.week = m.week
    ) fin on true
    left join lateral (
      select res.result from public.contest_results(m.id) res where res.user_id = auth.uid()
    ) cr on true
    left join lateral (
      select pay.coins from public.contest_payouts(m.id) pay where pay.user_id = auth.uid()
    ) cp on true
   order by m.recap, m.kind, m.entry_fee_coins, m.name;
$function$
;

CREATE OR REPLACE FUNCTION public.award_contest_prizes(p_season integer, p_season_type smallint, p_week integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_paid integer := 0;
  v_coins bigint  := 0;
begin
  if not public.week_is_complete(p_season, p_season_type, p_week) then
    return jsonb_build_object(
      'week', p_week, 'awarded_to', 0, 'skipped', 'week is not complete');
  end if;

  with payable as (
    select p.user_id, p.lineup_id, p.coins,
           format('contest_prize:%s', p.lineup_id) as key
      from public.contests c
      join lateral public.contest_payouts(c.id) p on true
     where c.season = p_season
       and c.season_type = p_season_type
       and c.week = p_week
       and c.prize_pool_bps > 0
       and p.coins > 0
  ),
  -- ONE LEDGER ROW PER PRIZE. Which contest paid what is the whole audit trail
  -- and the only way to check a pool balanced, so this stays per-entry even
  -- though the wallet below does not.
  inserted as (
    insert into public.coins_ledger (user_id, amount, reason, reference_id, idempotency_key)
    select user_id, coins, 'contest_prize', lineup_id, key from payable
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id, amount
  ),
  -- ONE WALLET MOVE PER PLAYER. See the header: the conflict target is the
  -- user, so two prizes for one player in a single statement is an error rather
  -- than two additions.
  totals as (
    select user_id, sum(amount)::integer as amount from inserted group by user_id
  ),
  moved as (
    -- Upsert rather than update. A prize is the first coins some accounts will
    -- ever be paid outside the signup bonus, and an UPDATE against a missing
    -- balance row moves nothing and reports success — a prize that appears in
    -- the ledger and never in the wallet.
    insert into public.coin_balances (user_id, balance, updated_at)
    select user_id, amount, now() from totals
    on conflict (user_id) do update
      set balance = coin_balances.balance + excluded.balance, updated_at = now()
    returning user_id
  )
  select count(*), coalesce(sum(amount), 0) into v_paid, v_coins
    from inserted;

  return jsonb_build_object('week', p_week, 'awarded_to', v_paid, 'coins', v_coins);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.award_position_bonuses(p_season integer, p_season_type smallint, p_week integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_version integer;
  v_mvp     integer;
  v_slots   integer;
  v_pos     bigint;
  v_mvps    bigint;
begin
  select version into v_version from public.scoring_rules where is_active limit 1;
  if v_version is null then
    raise exception 'no active scoring rules' using errcode = '22023';
  end if;

  -- Same gate, same reason as award_score_coins: ranks computed over a partial
  -- slate would be stamped and never revisited.
  if not public.week_is_complete(p_season, p_season_type, p_week) then
    return jsonb_build_object(
      'week', p_week, 'awarded_to', 0, 'skipped', 'week is not complete');
  end if;

  v_mvp := public.game_config_value('mvp_bonus_coins', 150);

  with scored_players as (
    select pl.id                       as player_id,
           pl.position_abbreviation    as pos,
           sum(fp.points)              as pts
      from public.stat_lines sl
      join public.fantasy_points fp on fp.stat_line_id = sl.id
                                   and fp.rules_version = v_version
      join public.players pl on pl.id = sl.player_id
     where sl.season = p_season
       and sl.season_type = p_season_type
       and sl.week = p_week
       and pl.position_abbreviation is not null
     group by pl.id, pl.position_abbreviation
    having sum(fp.points) > 0            -- zero is not a rank
  ),
  ranked as (
    select player_id, pos, pts,
           rank() over (partition by pos order by pts desc) as pos_rank,
           rank() over (order by pts desc)                  as overall_rank
      from scored_players
  ),
  slot_bonus as (
    select ls.id,
           l.user_id,
           r.pos_rank,
           (r.overall_rank = 1)                                  as is_mvp,
           coalesce(ladder.reward_coins, 0)
             + case when r.overall_rank = 1 then v_mvp else 0 end as coins
      from public.lineup_slots ls
      join public.lineups        l  on l.id  = ls.lineup_id
      join public.card_instances ci on ci.id = ls.card_instance_id
      join public.cards          cd on cd.id = ci.card_id
      join ranked                r  on r.player_id = cd.player_id
      -- Lowest matching rung wins: rank 2 matches max_rank 3 and 10, and 3 is
      -- the one that pays.
      left join lateral (
        select pb.reward_coins
          from public.position_bonus_tiers pb
         where r.pos_rank <= pb.max_rank
         order by pb.max_rank asc
         limit 1
      ) ladder on true
     where l.season = p_season
       and l.season_type = p_season_type
       and l.week = p_week
       and l.scored_at is not null
       and ls.bonus_coins is null
  ),
  stamped as (
    update public.lineup_slots ls
       set position_rank = sb.pos_rank,
           bonus_coins    = sb.coins,
           was_week_mvp  = sb.is_mvp
      from slot_bonus sb
     where ls.id = sb.id
    returning ls.id
  )
  select count(*) into v_slots from stamped;

  -- Two ledger rows per user, because the two answer different questions and a
  -- combined row could not be re-tuned independently. See the enum migrations.
  with paid as (
    select l.user_id,
           sum(coalesce(ls.bonus_coins, 0)) filter (where not coalesce(ls.was_week_mvp, false))
             + sum(greatest(0, coalesce(ls.bonus_coins, 0) - v_mvp)) filter (where coalesce(ls.was_week_mvp, false))
             as position_coins,
           (count(*) filter (where coalesce(ls.was_week_mvp, false)) * v_mvp) as mvp_coins
      from public.lineups l
      join public.lineup_slots ls on ls.lineup_id = l.id
     where l.season = p_season
       and l.season_type = p_season_type
       and l.week = p_week
       and l.scored_at is not null
     group by l.user_id
  ),
  rows_to_write as (
    select user_id, position_coins::integer as amount, 'position_bonus'::public.coin_reason as reason,
           format('position_bonus:%s:%s:%s:%s', user_id, p_season, p_season_type, p_week) as key
      from paid where position_coins > 0
    union all
    select user_id, mvp_coins::integer, 'mvp_bonus'::public.coin_reason,
           format('mvp_bonus:%s:%s:%s:%s', user_id, p_season, p_season_type, p_week)
      from paid where mvp_coins > 0
  ),
  inserted as (
    insert into public.coins_ledger (user_id, amount, reason, idempotency_key)
    select r.user_id, r.amount, r.reason, r.key from rows_to_write r
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id, amount, reason
  ),
  moved as (
    update public.coin_balances gb
       set balance = gb.balance + i.amount, updated_at = now()
      from inserted i
     where gb.user_id = i.user_id
    returning i.amount, i.reason
  )
  select coalesce(sum(amount) filter (where reason = 'position_bonus'), 0),
         coalesce(sum(amount) filter (where reason = 'mvp_bonus'), 0)
    into v_pos, v_mvps
    from moved;

  return jsonb_build_object(
    'week', p_week, 'slots_priced', v_slots,
    'position_coins', v_pos, 'mvp_coins', v_mvps);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.award_score_coins(p_season integer, p_season_type smallint, p_week integer, p_per_point numeric DEFAULT 1.5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_awarded integer;
  v_slots   integer;
  v_coins    bigint;
begin
  if p_per_point <= 0 then
    raise exception 'per_point must be positive' using errcode = '22023';
  end if;

  -- See the header: a mid-slate payout would stamp a multiplier that stops
  -- being true, and the idempotency key means nothing would ever fix it.
  if not public.week_is_complete(p_season, p_season_type, p_week) then
    return jsonb_build_object(
      'week', p_week, 'awarded_to', 0, 'skipped', 'week is not complete');
  end if;

  -- 1. Price every slot, at the tier its card held going INTO the week.
  with slot_award as (
    select ls.id,
           l.user_id,
           prior.tier                                              as prior_tier,
           prior.coin_multiplier                                    as mult,
           greatest(0, floor(ls.points * p_per_point * prior.coin_multiplier))::integer as coins
      from public.lineup_slots ls
      join public.lineups        l  on l.id  = ls.lineup_id
      join public.card_instances ci on ci.id = ls.card_instance_id
      -- The highest tier the card's PRIOR career total would have bought. Ties
      -- resolve by sort_order, so a threshold sitting exactly on the boundary
      -- reads the same way sync_card_tier reads it.
      join lateral (
        select tt.tier, tt.coin_multiplier
          from public.tier_thresholds tt
         where tt.min_career_fp <= greatest(0, ci.career_fp - ls.points)
         order by tt.sort_order desc
         limit 1
      ) prior on true
     where l.season = p_season
       and l.season_type = p_season_type
       and l.week = p_week
       and l.scored_at is not null
       -- Never re-price a slot that has already been paid. The ledger's
       -- idempotency key protects the wallet; this protects the stamp.
       and ls.coins_awarded is null
  ),
  stamped as (
    update public.lineup_slots ls
       set coin_multiplier = sa.mult,
           tier_at_award  = sa.prior_tier,
           coins_awarded   = sa.coins
      from slot_award sa
     where ls.id = sa.id
    returning ls.id
  )
  select count(*) into v_slots from stamped;

  -- 2. One ledger row per user, summing what their slots were just stamped
  --    with. Read back from the slots rather than carried in a variable, so the
  --    wallet and the recap can never disagree about what was paid.
  with payable as (
    select l.user_id,
           sum(coalesce(ls.coins_awarded, 0))::integer as amount,
           format('score_reward:%s:%s:%s:%s', l.user_id, p_season, p_season_type, p_week) as key
      from public.lineups l
      join public.lineup_slots ls on ls.lineup_id = l.id
     where l.season = p_season
       and l.season_type = p_season_type
       and l.week = p_week
       and l.scored_at is not null
     group by l.user_id
    having sum(coalesce(ls.coins_awarded, 0)) > 0
  ),
  inserted as (
    insert into public.coins_ledger (user_id, amount, reason, idempotency_key)
    select p.user_id, p.amount, 'weekly_score_reward', p.key
      from payable p
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id, amount
  ),
  moved as (
    update public.coin_balances gb
       set balance = gb.balance + i.amount, updated_at = now()
      from inserted i
     where gb.user_id = i.user_id
    returning i.amount
  )
  select count(*), coalesce(sum(amount), 0) into v_awarded, v_coins from moved;

  return jsonb_build_object(
    'week', p_week, 'per_point', p_per_point,
    'slots_priced', v_slots, 'awarded_to', v_awarded, 'coins', v_coins);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.card_actions(p_card_instance_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- The UNFLOORED candidate, which is what `burns_this_copy` at the top level
  -- has always meant: which of your copies of this player a commit takes, asked
  -- of the collection rather than of a particular set.
  burn as (
    select c.id,
           b.burn_id
      from copy c
      cross join lateral (select public.commit_candidate(c.card_id) as burn_id) b
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
           s.min_tier,
           -- PER SET, under that set's floor. Null means "you hold nothing this
           -- set would accept", which is the whole of `can_commit` below.
           cand.burn_id,
           coalesce(ctt.sell_value, 0) as burn_sell_value,
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
      cross join lateral (
        select public.commit_candidate(c.card_id, s.min_tier) as burn_id
      ) cand
      left join public.card_instances ci on ci.id = cand.burn_id
      left join public.tier_thresholds ctt on ctt.tier = ci.tier
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
                      -- The floor this set puts on a copy, so the client can
                      -- say why an offer is dark instead of just darkening it.
                      'min_tier',     e.min_tier,
                      -- floor(), matching the commit exactly. A client rounding
                      -- this the other way would over-promise by a coin. Priced
                      -- off THIS set's candidate, so a floored offer quotes the
                      -- copy it would really burn.
                      'pays',         floor(e.burn_sell_value * e.commit_payout_pct / 100.0)::integer,
                      'committed',    e.committed,
                      'required',     e.required_count,
                      'slot_filled',  e.slot_filled,
                      'set_complete', e.committed >= e.required_count,
                      -- Whether the copy being asked about is the one THIS set
                      -- would take. Differs from the top-level flag only on a
                      -- floored set, which is exactly where it is needed.
                      'burns_this_copy', e.burn_id is not distinct from c.id,
                      'can_commit',   e.burn_id is not null
                                        and not e.slot_filled
                                        and e.committed < e.required_count
                    )
                    -- A daily expires at midnight, a weekly on Monday, and a
                    -- team set not at all, so the things with a deadline on
                    -- them are offered first and the shorter clock leads.
                    order by (e.family = 'daily') desc, (e.family = 'weekly') desc,
                             e.name, e.code
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
$function$
;

CREATE OR REPLACE FUNCTION public.claim_set_reward(p_set_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user      uuid := auth.uid();
  v_set       public.card_sets%rowtype;
  v_balance   integer;
  v_committed integer;
  v_paid      integer;
  v_rungs     integer;
  v_pcts      smallint[];
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

  -- Wallet first, always. Same lock order as open_pack, sell_card and
  -- commit_card_to_set, and it is what serialises a double-tapped claim.
  select balance into v_balance
    from public.coin_balances
   where user_id = v_user
     for update;

  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;

  -- SECURITY DEFINER bypasses RLS, so the owner is filtered explicitly —
  -- without the user_id predicate this would count the whole game's commits.
  select count(distinct card_id)::integer into v_committed
    from public.card_instances
   where committed_to = v_set.id
     and user_id = v_user
     and committed_at is not null;

  with due as (
    select ml.threshold_pct, ml.reward_coins
      from public.card_set_milestones ml
     where ml.set_id = v_set.id
       and v_committed >= ceil(v_set.required_count * ml.threshold_pct / 100.0)
       and not exists (
         select 1
           from public.set_milestone_claims c
          where c.user_id = v_user
            and c.set_id = v_set.id
            and c.threshold_pct = ml.threshold_pct
       )
  ),
  ins as (
    insert into public.set_milestone_claims
                (user_id, set_id, threshold_pct, committed_at_claim, reward_coins)
    select v_user, v_set.id, d.threshold_pct, v_committed, d.reward_coins
      from due d
    returning threshold_pct, reward_coins
  ),
  led as (
    -- One ledger row per rung rather than one for the sweep: the ledger is the
    -- audit trail for "what has the set economy paid out", and a single lumped
    -- row would make a 25% tranche and a 100% tranche indistinguishable.
    insert into public.coins_ledger (user_id, amount, reason, reference_id, idempotency_key)
    select v_user, i.reward_coins, 'set_reward', v_set.id,
           format('set_reward:%s:%s:%s', v_user, v_set.id, i.threshold_pct)
      from ins i
     where i.reward_coins > 0
    returning amount
  )
  select coalesce(sum(i.reward_coins), 0)::integer,
         count(*)::integer,
         coalesce(array_agg(i.threshold_pct order by i.threshold_pct), '{}')
    into v_paid, v_rungs, v_pcts
    from ins i;

  if v_rungs = 0 then
    raise exception 'nothing to claim on this set yet' using errcode = '55006';
  end if;

  if v_paid > 0 then
    update public.coin_balances
       set balance = balance + v_paid, updated_at = now()
     where user_id = v_user;
  end if;

  return jsonb_build_object(
    'set_code',    v_set.code,
    'set_name',    v_set.name,
    'committed',   v_committed,
    'required',    v_set.required_count,
    'milestones',  v_pcts,
    'rungs',       v_rungs,
    'reward_coins', v_paid,
    'balance',     v_balance + v_paid
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.commit_card_to_set(p_set_code text, p_card_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_best      public.card_tier;
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
    from public.coin_balances
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
   where id = public.commit_candidate(p_card_id, v_set.min_tier)
     for update;

  -- TWO DIFFERENT REFUSALS, and telling them apart is the whole point of this
  -- block. "You hold none" and "you hold three but they are all bronze" are
  -- different problems with different fixes, and one message covering both
  -- would send a player to open packs when what they need is to start the card
  -- they already have.
  if not found then
    if v_set.min_tier is not null then
      -- ORDER BY rather than max(): Postgres ships no max() aggregate for an
      -- enum type, and `max(ci.tier)` fails to resolve at CREATE FUNCTION time
      -- only if plpgsql happened to plan it — which it does not, so it would
      -- have failed at the first bronze-only refusal instead. The enum's btree
      -- ordering is bronze < silver < gold < diamond, so this is the same
      -- question asked in the form Postgres answers.
      select ci.tier into v_best
        from public.card_instances ci
       where ci.card_id = p_card_id
         and ci.user_id = v_user
         and ci.is_held
       order by ci.tier desc
       limit 1;

      if v_best is not null then
        raise exception
          'this set needs a % copy or better, and your best copy of that card is %',
          v_set.min_tier, v_best
          using errcode = '55006';
      end if;
    end if;

    raise exception 'you do not hold a copy of that card' using errcode = '42501';
  end if;

  -- Re-checked under the lock. commit_candidate read without one, so a
  -- concurrent sale of the same copy could have landed in between. The tier
  -- cannot fall between the two reads — career_fp only rises — so the floor
  -- does not need re-checking here, only ownership.
  if not v_copy.is_held or v_copy.user_id <> v_user then
    raise exception 'you do not hold a copy of that card' using errcode = '42501';
  end if;

  -- Kicked off is the one thing that cannot be undone. See the header of
  -- 20260821230000_commit_frees_lineup_slot.sql.
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
       and l.finalized_at is null
       and public.game_has_started(g.status_state, g.starts_at)
  ) then
    raise exception 'that player has already kicked off and cannot leave your lineup'
      using errcode = '55006';
  end if;

  -- Free whatever LIVE slots hold this copy. See the header: the test is
  -- `finalized_at`, not `scored_at`, because a week can carry a scored_at
  -- stamp while every one of its games is still days away — and under the old
  -- predicate that stamp silently switched this delete off and left burnt
  -- cards sitting in the upcoming lineup.
  --
  -- Finalized lineups are still history and are still untouched: their slots
  -- record what was started that week, and rewriting them would change a
  -- result that has already been paid out.
  delete from public.lineup_slots ls
   using public.lineups l
   where ls.lineup_id = l.id
     and ls.card_instance_id = v_copy.id
     and l.finalized_at is null;
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

  -- coins_ledger has CHECK (amount <> 0), so a zero payout is recorded on the
  -- card and nothing in the ledger, rather than failing the commit.
  if v_payout > 0 then
    update public.coin_balances
       set balance = balance + v_payout, updated_at = now()
     where user_id = v_user;

    insert into public.coins_ledger (user_id, amount, reason, reference_id)
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
$function$
;

CREATE OR REPLACE FUNCTION public.commit_cards_to_set(p_set_code text, p_card_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  if array_length(p_card_ids, 1) > 64 then
    raise exception 'too many cards in one request: % (max 64)', array_length(p_card_ids, 1)
      using errcode = '22023';
  end if;

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
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('card_id', v_card, 'reason', sqlerrm)
      );
    end;
  end loop;

  select balance into v_balance from public.coin_balances where user_id = v_user;

  return jsonb_build_object(
    'set_code',     v_set.code,
    'set_name',     v_set.name,
    'added',        jsonb_array_length(v_done),
    'skipped',      jsonb_array_length(v_skipped),
    'paid',         v_paid,
    'lineup_freed', v_freed,
    'cards',        v_done,
    'refusals',     v_skipped,
    'committed',    (select count(distinct card_id)::integer
                       from public.card_instances
                      where committed_to = v_set.id
                        and user_id = v_user
                        and committed_at is not null),
    'required',     v_set.required_count,
    'balance',      v_balance
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.contest_field(p_contest uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_key text, lineup_id uuid, filled integer, points numeric, rnk bigint, result text, prize integer, is_me boolean, locked boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with c as (
    select id, season, season_type, week from public.contests where id = p_contest
  ),
  entries as (
    select l.id, l.user_id, l.total_points as pts,
           (select count(*)::integer from public.lineup_slots s where s.lineup_id = l.id) as filled
      from public.lineups l
      join c on c.id = l.contest_id
     where exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  lock as (
    select e.id,
           not exists (
             select 1
               from public.lineup_slots ls
               join public.card_instances ci on ci.id = ls.card_instance_id
               join public.cards   cd on cd.id = ci.card_id
               join public.players p  on p.id  = cd.player_id
               join public.games   g
                 on g.season = (select season from c)
                and g.season_type = (select season_type from c)
                and g.week = (select week from c)
                and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
              where ls.lineup_id = e.id
                and not public.game_has_started(g.status_state, g.starts_at)
           ) as locked
      from entries e
  )
  select e.user_id,
         pr.display_name,
         pr.avatar_key,
         e.id,
         e.filled,
         e.pts,
         rank() over (order by e.pts desc),
         cr.result,
         cp.coins,
         coalesce(e.user_id = auth.uid(), false),
         lk.locked
    from entries e
    join public.profiles pr on pr.id = e.user_id
    join lock lk on lk.id = e.id
    left join lateral (
      select r.result from public.contest_results(p_contest) r where r.lineup_id = e.id
    ) cr on true
    left join lateral (
      select p.coins from public.contest_payouts(p_contest) p where p.lineup_id = e.id
    ) cp on true
   order by e.pts desc, pr.display_name;
$function$
;

CREATE OR REPLACE FUNCTION public.contest_prize_pool(p_contest uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select floor(
           coalesce((
             -- Entry rows are negative; the pool is what was taken. Joined
             -- through `lineups` so a refunded entry — whose lineup was
             -- deleted by `leave_contest` — cannot contribute to a pool it
             -- has taken its coins back out of.
             select -sum(g.amount)
               from public.coins_ledger g
               join public.lineups l on l.id = g.reference_id
              where l.contest_id = p_contest
                and g.reason = 'contest_entry'
           ), 0)::numeric
           * coalesce((select prize_pool_bps from public.contests where id = p_contest), 0)
           / 10000
         )::integer;
$function$
;

CREATE OR REPLACE FUNCTION public.daily_pack_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
   order by coin_cost, code limit 1;

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
$function$
;

CREATE OR REPLACE FUNCTION public.grant_weekly_coins(p_season integer, p_season_type smallint, p_week integer, p_amount integer DEFAULT 150)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_granted integer;
begin
  if p_amount <= 0 then
    raise exception 'grant must be positive' using errcode = '22023';
  end if;

  with eligible as (
    select gb.user_id,
           format('weekly_grant:%s:%s:%s:%s', gb.user_id, p_season, p_season_type, p_week) as key
      from public.coin_balances gb
  ),
  inserted as (
    insert into public.coins_ledger (user_id, amount, reason, idempotency_key)
    select e.user_id, p_amount, 'weekly_grant', e.key
      from eligible e
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id
  )
  update public.coin_balances gb
     set balance = gb.balance + p_amount, updated_at = now()
    from inserted i
   where gb.user_id = i.user_id;

  get diagnostics v_granted = row_count;
  return jsonb_build_object('week', p_week, 'amount', p_amount, 'granted_to', v_granted);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  signup_grant constant integer := 500;
  chosen_name  text;
  derived_name text;
begin
  -- 1. What they asked to be called, if it survives the length rule.
  chosen_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if char_length(chosen_name) < 2 or char_length(chosen_name) > 24 then
    chosen_name := null;
  end if;

  -- 2. Otherwise the email local part, as before.
  derived_name := left(coalesce(split_part(new.email, '@', 1), 'player'), 24);
  if char_length(derived_name) < 2 then
    derived_name := 'player';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, coalesce(chosen_name, derived_name))
  on conflict (id) do nothing;

  insert into public.coin_balances (user_id, balance)
  values (new.id, signup_grant)
  on conflict (user_id) do nothing;

  insert into public.coins_ledger (user_id, amount, reason)
  values (new.id, signup_grant, 'signup_bonus');

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_contest(p_contest_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_c       record;
  v_lineup  uuid;
  v_played  text;
  v_refund  integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id, kind, name, entry_fee_coins, season, season_type, week
    into v_c
    from public.contests where code = p_contest_code;
  if v_c.id is null then
    raise exception 'no such contest: %', p_contest_code using errcode = '22023';
  end if;

  if v_c.kind = 'free' then
    raise exception 'you cannot leave %, everybody is in it', v_c.name
      using errcode = '22023';
  end if;

  select id into v_lineup
    from public.lineups where user_id = v_user and contest_id = v_c.id;
  if v_lineup is null then
    raise exception 'you are not in %', v_c.name using errcode = '22023';
  end if;

  -- Any of YOUR cards having kicked off ends it. Same test the lineup editor
  -- applies per row, asked here of the whole entry.
  select string_agg(format('%s %s', p.first_name, p.last_name), '; ' order by p.last_name)
    into v_played
    from public.lineup_slots ls
    join public.card_instances ci on ci.id = ls.card_instance_id
    join public.cards   cd on cd.id = ci.card_id
    join public.players p  on p.id  = cd.player_id
    left join public.games g
           on g.season = v_c.season and g.season_type = v_c.season_type
          and g.week = v_c.week
          and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
   where ls.lineup_id = v_lineup
     and public.game_has_started(g.status_state, g.starts_at);

  if v_played is not null then
    raise exception 'too late to leave %: already playing — %', v_c.name, v_played
      using errcode = '55006';
  end if;

  -- Refund only what was actually taken. Reading the ledger rather than the
  -- contest's CURRENT fee, so a price changed since they entered cannot pay
  -- them more than they paid — or less.
  select coalesce(-sum(amount), 0)::integer into v_refund
    from public.coins_ledger
   where user_id = v_user and reason = 'contest_entry' and reference_id = v_lineup;

  -- Slots go with it on cascade. The lineup row IS the entry, so deleting it
  -- is what leaving means; there is no separate membership to tidy up.
  delete from public.lineups where id = v_lineup;

  if v_refund > 0 then
    update public.coin_balances
       set balance = balance + v_refund, updated_at = now()
     where user_id = v_user;

    insert into public.coins_ledger (user_id, amount, reason, idempotency_key)
    values (v_user, v_refund, 'contest_refund',
            format('contest_refund:%s', v_lineup));
  end if;

  return jsonb_build_object('contest', v_c.name, 'refunded', v_refund);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.open_pack(p_pack_code text)
 RETURNS TABLE(card_instance_id uuid, player_name text, position_abbreviation text, team_abbreviation text, rarity rarity)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.rebuild_card_sets(p_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sets    integer := 0;
  v_members integer := 0;
begin
  -- ---------------------------------------------------------------- teams
  with rostered as (
    select t.id            as team_id,
           t.abbreviation,
           coalesce(t.full_name, t.abbreviation) as full_name,
           t.conference,
           t.division,
           c.id            as card_id
      from public.cards c
      join public.players p on p.id = c.player_id
      join public.teams   t on t.id = p.team_id
     where c.season = p_season
       and c.is_mintable
  ),
  defs as (
    select distinct
           format('team-%s-%s', lower(abbreviation), p_season) as code,
           full_name as name,
           nullif(trim(upper(coalesce(conference, '')) || ' ' ||
                       initcap(lower(coalesce(division, '')))), '') as subtitle,
           team_id,
           abbreviation
      from rostered
  ),
  upserted as (
    insert into public.card_sets (code, name, family, subtitle, season, required_count,
                                  sort_order, is_active)
    select d.code, d.name, 'team', d.subtitle, p_season,
           1,
           (row_number() over (order by d.subtitle nulls last, d.name))::integer,
           true
      from defs d
    on conflict (code) do update
       set name       = excluded.name,
           subtitle   = excluded.subtitle,
           sort_order = excluded.sort_order,
           is_active  = true
    returning id, code
  ),
  members as (
    insert into public.card_set_members (set_id, card_id)
    select u.id, r.card_id
      from upserted u
      join defs d on d.code = u.code
      join rostered r on r.team_id = d.team_id
    on conflict do nothing
    returning 1
  )
  select (select count(*) from upserted), (select count(*) from members)
    into v_sets, v_members;

  update public.card_sets s
     set required_count = m.total::smallint
    from (
      select set_id, count(*)::integer as total
        from public.card_set_members
       group by set_id
    ) m
   where m.set_id = s.id
     and s.season = p_season
     and s.family = 'team'
     and s.required_count <> m.total;

  -- ---------------------------------------------------------------- retired
  update public.card_sets
     set is_active = false
   where family = 'position'
     and is_active;

  -- ---------------------------------------------------------------- the ladder
  --
  -- THE ONE CHANGED BLOCK. Figures come from card_set_ladder_defaults, so
  -- re-tuning a rung is an UPDATE against that table and a rebuild will not
  -- undo it. `where d.family = s.family` keeps the join family-scoped exactly
  -- as the inline VALUES list did, so a family with no defaults row (the
  -- retired 'position' family) is left alone rather than zeroed.
  insert into public.card_set_milestones (set_id, threshold_pct, reward_coins)
  select s.id, d.threshold_pct, d.reward_coins
    from public.card_sets s
    join public.card_set_ladder_defaults d on d.family = s.family
   where s.season = p_season
  on conflict (set_id, threshold_pct) do update
     set reward_coins = excluded.reward_coins;

  update public.card_sets s
     set is_active = false
   where s.season = p_season
     and s.family = 'team'
     and not exists (select 1 from public.card_set_members m where m.set_id = s.id);

  return jsonb_build_object('season', p_season, 'sets', v_sets, 'members_added', v_members);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rebuild_daily_set(p_season integer, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_required constant smallint := 3;
  v_reward   constant integer  := 40;
  v_pos      text;
  v_code     text;
  v_set      uuid;
  v_members  integer := 0;
begin
  v_pos  := public.daily_set_position(p_day);
  v_code := format('daily-%s-%s', lower(v_pos), to_char(p_day, 'YYYY-MM-DD'));

  insert into public.card_sets (code, name, family, subtitle, season, required_count,
                                sort_order, is_active, opens_on)
  values (v_code,
          format('%s of the day', initcap(
            case v_pos
              when 'QB' then 'quarterback'
              when 'RB' then 'running back'
              when 'WR' then 'wide receiver'
              when 'TE' then 'tight end'
              else 'kicker'
            end)),
          'daily',
          to_char(p_day, 'FMDay DD FMMonth'),
          p_season,
          v_required,
          0,
          true,
          p_day)
  on conflict (code) do update
     set name           = excluded.name,
         subtitle       = excluded.subtitle,
         required_count = excluded.required_count,
         is_active      = true,
         opens_on       = excluded.opens_on
  returning id into v_set;

  -- The whole position pool. A daily has to be clearable out of whatever is in
  -- hand or it is not a faucet, and membership this wide is what guarantees it.
  with added as (
    insert into public.card_set_members (set_id, card_id)
    select v_set, c.id
      from public.cards c
      join public.players p on p.id = c.player_id
     where c.season = p_season
       and c.is_mintable
       -- The feed spells a kicker 'PK', which is what the rotation holds, so
       -- this is a straight match rather than the client's PK/K normalisation.
       and upper(p.position_abbreviation) = v_pos
    on conflict do nothing
    returning 1
  )
  select count(*) into v_members from added;

  -- ONE RUNG, at completion. A three-card set with four rungs would pay at one
  -- card, which is the trickle this migration exists to remove.
  insert into public.card_set_milestones (set_id, threshold_pct, reward_coins)
  values (v_set, 100, v_reward)
  on conflict (set_id, threshold_pct) do update
     set reward_coins = excluded.reward_coins;

  delete from public.card_set_milestones
   where set_id = v_set
     and threshold_pct <> 100;

  -- Yesterday's is over. Deactivating rather than deleting, for the same
  -- reason the position sets survive: cards were burnt into it.
  update public.card_sets
     set is_active = false
   where family = 'daily'
     and opens_on < p_day
     and is_active;

  return jsonb_build_object('day', p_day, 'position', v_pos, 'code', v_code,
                            'members_added', v_members);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rebuild_weekly_set(p_season integer, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_required constant smallint         := 3;
  v_floor    constant public.card_tier := 'silver';
  v_monday   date := public.weekly_set_monday(p_day);
  v_code     text;
  v_set      uuid;
  v_members  integer := 0;
begin
  v_code := format('weekly-%s', to_char(v_monday, 'YYYY-MM-DD'));

  insert into public.card_sets (code, name, family, subtitle, season, required_count,
                                sort_order, is_active, opens_on, min_tier)
  values (v_code,
          'Proven three',
          'weekly',
          format('Week of %s', to_char(v_monday, 'FMDD FMMonth')),
          p_season,
          v_required,
          0,
          true,
          v_monday,
          v_floor)
  on conflict (code) do update
     set name           = excluded.name,
         subtitle       = excluded.subtitle,
         required_count = excluded.required_count,
         is_active      = true,
         opens_on       = excluded.opens_on,
         min_tier       = excluded.min_tier
  returning id into v_set;

  -- THE WHOLE POOL. Position is not the constraint here, tier is, and narrowing
  -- the membership as well would stack two scarcities on one three-card ask.
  with added as (
    insert into public.card_set_members (set_id, card_id)
    select v_set, c.id
      from public.cards c
     where c.season = p_season
       and c.is_mintable
    on conflict do nothing
    returning 1
  )
  select count(*) into v_members from added;

  insert into public.card_set_milestones (set_id, threshold_pct, reward_coins)
  select v_set, d.threshold_pct, d.reward_coins
    from public.card_set_ladder_defaults d
   where d.family = 'weekly'
  on conflict (set_id, threshold_pct) do update
     set reward_coins = excluded.reward_coins;

  -- Last week's is over. Deactivated rather than deleted, for the reason every
  -- other retirement in this schema gives: cards were burnt into it, and
  -- `set_milestone_claims` is never rewritten.
  update public.card_sets
     set is_active = false
   where family = 'weekly'
     and opens_on < v_monday
     and is_active;

  return jsonb_build_object('monday', v_monday, 'code', v_code,
                            'min_tier', v_floor, 'members_added', v_members);
end;
$function$
;

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
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Wallet first, then the card. open_pack takes the wallet lock first too, and
  -- two functions that lock the same pair in opposite orders deadlock under
  -- concurrency. Consistent ordering is the cheapest way to never find out.
  select balance into v_balance
    from public.coin_balances
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

  -- THE ONLY CONTEST-SHAPED REFUSAL LEFT, and it is about this card rather than
  -- about your run. A card still attached to an unscored lineup is either about
  -- to play or has played and not been swept. Selling it would leave a starter
  -- that silently scores nothing, or take the card away while it is still
  -- earning. Both are worse than a refusal the client can explain.
  --
  -- `lineup_slots` holds starters only — there is no bench row — so this is
  -- exactly "started somewhere that has not settled" and nothing wider.
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

  -- coins_ledger has CHECK (amount <> 0), so a zero-value tier is recorded as a
  -- sale on the card and nothing in the ledger, rather than failing the sale.
  if v_price > 0 then
    update public.coin_balances
       set balance = balance + v_price, updated_at = now()
     where user_id = v_user;

    insert into public.coins_ledger (user_id, amount, reason, reference_id)
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
$function$
;

CREATE OR REPLACE FUNCTION public.sell_cards(p_card_instance_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_card    uuid;
  v_one     jsonb;
  v_done    jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_paid    integer := 0;
  v_balance integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_card_instance_ids is null or array_length(p_card_instance_ids, 1) is null then
    raise exception 'no cards were named' using errcode = '22023';
  end if;

  if array_length(p_card_instance_ids, 1) > 64 then
    raise exception 'too many cards in one request: % (max 64)',
      array_length(p_card_instance_ids, 1) using errcode = '22023';
  end if;

  foreach v_card in array p_card_instance_ids loop
    begin
      v_one := public.sell_card(v_card);
      v_paid := v_paid + coalesce((v_one ->> 'sold_for')::integer, 0);
      v_done := v_done || jsonb_build_array(v_one);
    exception when others then
      -- `sell_card`'s refusals are short technical sentences rather than
      -- player-facing ones (which is what `sellErrorMessage` exists to fix on
      -- the client), so they are passed through verbatim for it to map.
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('card_instance_id', v_card, 'reason', sqlerrm)
      );
    end;
  end loop;

  -- Read back rather than accumulated: the loop's own sales moved it, and a
  -- figure derived here would be one more thing that could disagree with the
  -- wallet.
  select balance into v_balance from public.coin_balances where user_id = v_user;

  return jsonb_build_object(
    'sold',     jsonb_array_length(v_done),
    'skipped',  jsonb_array_length(v_skipped),
    'paid',     v_paid,
    'cards',    v_done,
    'refusals', v_skipped,
    'balance',  v_balance
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_lineup(p_season integer, p_season_type smallint, p_week integer, p_slots jsonb, p_contest_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_lineup  uuid;
  v_games   integer;
  v_blocked text;
  v_held    integer;
  v_cap     integer;
  v_contest uuid;
  v_format  text;
  v_clash   text;
  v_c       record;
  v_balance integer;
  v_entrants integer;
  v_run     public.runs;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be a json array' using errcode = '22023';
  end if;

  v_cap := public.game_config_value('roster_cap', 30);
  select count(*) into v_held
    from public.card_instances where user_id = v_user and is_held;

  if v_held > v_cap then
    raise exception
      'roster is over the limit: % of % cards. Commit % to a set or sell them to set your lineup.',
      v_held, v_cap, v_held - v_cap
      using errcode = '55006';
  end if;

  if p_contest_code is null then
    v_contest := public.ensure_free_contest(p_season, p_season_type, p_week);
  else
    select id into v_contest from public.contests where code = p_contest_code;
    if v_contest is null then
      raise exception 'no such contest: %', p_contest_code using errcode = '22023';
    end if;
  end if;

  select season, season_type, week, format_code, kind, entry_fee_coins, max_entrants, name,
         hearts_at_risk
    into v_c
    from public.contests where id = v_contest;

  -- THE RUN IS RESOLVED BEFORE ANYTHING IS CHARGED, and only for a contest
  -- that can actually take a heart.
  --
  -- THE FREE CONTEST IS ALWAYS ENTERABLE, EVEN DEAD, and that is what keeps
  -- this from being a lockout. It stakes a heart now, so it goes through this
  -- branch — but it is also auto-entered, unleaveable, and the only contest a
  -- player is guaranteed. Refusing it to somebody whose run has ended would
  -- take away their main lineup as well as their run, which is a suspension
  -- rather than a death.
  --
  -- Entered with a null run, so it stakes nothing: `settle_run_week` skips an
  -- entry with no run, which is exactly the right behaviour for a player who
  -- has no run to stake.
  if v_c.hearts_at_risk > 0 then
    v_run := public.current_run();
    if v_run.ended_at is not null then
      if v_c.kind = 'free' then
        v_run := null;
      else
        raise exception
          'your run ended — take your carry before entering % again', v_c.name
          using errcode = '55006';
      end if;
    end if;
  end if;

  if (p_season, p_season_type, p_week) is distinct from (v_c.season, v_c.season_type, v_c.week) then
    raise exception 'contest % is for %/%/%, not %/%/%',
      coalesce(p_contest_code, 'free'), v_c.season, v_c.season_type, v_c.week,
      p_season, p_season_type, p_week
      using errcode = '22023';
  end if;
  v_format := v_c.format_code;

  select count(*) into v_games
    from public.games g
   where g.season = p_season and g.season_type = p_season_type and g.week = p_week;
  if v_games = 0 then
    raise exception 'no scheduled games for season % type % week %',
      p_season, p_season_type, p_week using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
      left join public.contest_format_slots c
             on c.format_code = v_format and c.slot = x.slot
     where c.slot is null or x.slot is null or x.card_instance_id is null
  ) then
    raise exception 'unknown or malformed lineup slot for format %', v_format
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
     group by x.slot having count(*) > 1
  ) then
    raise exception 'duplicate slot in payload' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
     group by x.card_instance_id having count(*) > 1
  ) then
    raise exception 'the same card cannot fill two slots' using errcode = '22023';
  end if;

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

  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
      join public.contest_format_slots c on c.format_code = v_format and c.slot = x.slot
      join public.card_instances     ci on ci.id  = x.card_instance_id
      join public.cards              cd on cd.id  = ci.card_id
      join public.players            p  on p.id   = cd.player_id
     where cd.season <> p_season
        or p.position_abbreviation is null
        or not (p.position_abbreviation = any (c.eligible_positions))
  ) then
    raise exception 'player is not eligible for that slot' using errcode = '22023';
  end if;

  select id into v_lineup
    from public.lineups
   where user_id = v_user and contest_id = v_contest;

  -- ONE CARD, ONE CONTEST, ONE WEEK — named, so the player can act on it.
  select string_agg(distinct format('%s %s (in %s)',
           p.first_name, p.last_name,
           case when oc.kind = 'free' then 'your main lineup' else oc.name end), '; ')
    into v_clash
    from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
    join public.lineup_slots ls on ls.card_instance_id = x.card_instance_id
    join public.lineups      ol on ol.id = ls.lineup_id
    join public.contests     oc on oc.id = ol.contest_id
    join public.card_instances ci on ci.id = x.card_instance_id
    join public.cards   cd on cd.id = ci.card_id
    join public.players p  on p.id  = cd.player_id
   where ol.user_id = v_user
     and ol.season = p_season and ol.season_type = p_season_type and ol.week = p_week
     and ol.id is distinct from v_lineup;

  if v_clash is not null then
    raise exception 'already playing elsewhere this week: %', v_clash
      using errcode = '55006';
  end if;

  with submitted as (
    select x.slot, x.card_instance_id
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
  ),
  stored as (
    select ls.slot, ls.card_instance_id
      from public.lineup_slots ls
     where ls.lineup_id = v_lineup
  ),
  changed as (
    select coalesce(s.slot, t.slot) as slot,
           t.card_instance_id as leaving,
           s.card_instance_id as arriving
      from submitted s
      full outer join stored t on t.slot = s.slot
     where s.card_instance_id is distinct from t.card_instance_id
  ),
  touched as (
    select slot, leaving as card_instance_id, 'remove' as direction from changed
     where leaving is not null
    union all
    select slot, arriving, 'add' from changed
     where arriving is not null
  )
  select string_agg(
           format('%s %s (%s)',
                  p.first_name, p.last_name,
                  case when t.direction = 'remove' then 'already playing — cannot be taken out'
                       else 'already playing — cannot be added' end),
           '; ' order by p.last_name)
    into v_blocked
    from touched t
    join public.card_instances ci on ci.id = t.card_instance_id
    join public.cards   cd on cd.id = ci.card_id
    join public.players p  on p.id  = cd.player_id
    left join public.games g
           on g.season = p_season
          and g.season_type = p_season_type
          and g.week = p_week
          and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
   where public.game_has_started(g.status_state, g.starts_at);

  if v_blocked is not null then
    raise exception 'lineup locked for %', v_blocked using errcode = '55006';
  end if;

  if v_lineup is null then
    -- 6b. ENTERING. Everything below runs ONLY on the transition from not
    --     entered to entered, which is what makes the charge idempotent: an
    --     edit finds `v_lineup` already set and never reaches here.
    if v_c.entry_fee_coins > 0 then
      -- An empty payload must not buy an entry. The client autosaves, and a
      -- screen opened and closed without a card placed would otherwise take
      -- the fee for a lineup that scores nothing.
      if jsonb_array_length(p_slots) = 0 then
        raise exception 'name at least one card to enter %', v_c.name
          using errcode = '22023';
      end if;

      -- Lock the wallet for the transaction. Without this two concurrent
      -- entries both pass the affordability check — the same trap
      -- `open_pack` documents.
      select balance into v_balance
        from public.coin_balances where user_id = v_user for update;
      if not found then
        raise exception 'no wallet for this user' using errcode = '22023';
      end if;
      if v_balance < v_c.entry_fee_coins then
        raise exception 'entering % costs % coins and you have %',
          v_c.name, v_c.entry_fee_coins, v_balance using errcode = '22023';
      end if;
    end if;

    -- Checked INSIDE the wallet lock so a contest cannot be oversold by two
    -- entries racing, and after affordability so the commoner refusal wins.
    if v_c.max_entrants is not null then
      select count(*) into v_entrants from public.lineups where contest_id = v_contest;
      if v_entrants >= v_c.max_entrants then
        raise exception '% is full (% of %)', v_c.name, v_entrants, v_c.max_entrants
          using errcode = '55006';
      end if;
    end if;

    -- Stamped at ENTRY rather than looked up at settlement. A week can end
    -- with the run already dead — killed by another contest on the same slate
    -- — and settlement still has to know which run this entry belonged to.
    -- Reading the live run at settlement time would attribute it to whatever
    -- run happened to be live then, which is the NEXT one.
    insert into public.lineups (user_id, season, season_type, week, contest_id, run_id)
    values (v_user, p_season, p_season_type, p_week, v_contest, v_run.id)
    returning id into v_lineup;

    if v_c.entry_fee_coins > 0 then
      update public.coin_balances
         set balance = balance - v_c.entry_fee_coins, updated_at = now()
       where user_id = v_user;

      -- `reference_id` is the lineup, which IS the entry — see the header.
      --
      -- KEYED ON THE LINEUP, NOT ON (user, contest). The old key could not tell
      -- a retry from a RE-entry, which did not matter while an entry could
      -- never be undone. With `leave_contest` it does: leaving and coming back
      -- is a second, real charge, and the old key collided with the first one's
      -- — and this insert has no `on conflict` clause, so the re-entry would
      -- have failed on a ledger constraint rather than charging. A new entry is
      -- a new lineup row with a new id; a retry against the same entry is the
      -- same id and is still refused.
      insert into public.coins_ledger (user_id, amount, reason, reference_id, idempotency_key)
      values (v_user, -v_c.entry_fee_coins, 'contest_entry', v_lineup,
              format('contest_entry:%s', v_lineup));
    end if;
  else
    update public.lineups set submitted_at = now() where id = v_lineup;

    -- SELF-HEALING STAMP. An entry can exist with no run: it was filed before
    -- runs existed, or into a contest whose stake was raised above zero after
    -- the fact. Such an entry can never be settled — `settle_run_week` skips a
    -- null `run_id` — so the lobby advertises a heart on a row that cannot cost
    -- one, which is the confusion 20260825260000 is fixing.
    --
    -- Touching the entry at all is enough to adopt it into the live run. Only
    -- ever from null: an entry already stamped keeps the run it was made with,
    -- because re-pointing it at whatever run is live now is exactly the
    -- wrong-run bug 20260825150000 exists to prevent.
    if v_c.hearts_at_risk > 0 and v_run.id is not null then
      update public.lineups
         set run_id = v_run.id
       where id = v_lineup and run_id is null;
    end if;
  end if;

  delete from public.lineup_slots ls
   where ls.lineup_id = v_lineup
     and not exists (
       select 1 from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
        where x.slot = ls.slot and x.card_instance_id = ls.card_instance_id
     );

  insert into public.lineup_slots (lineup_id, slot, card_instance_id)
  select v_lineup, x.slot, x.card_instance_id
    from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
   where not exists (
     select 1 from public.lineup_slots ls
      where ls.lineup_id = v_lineup and ls.slot = x.slot
        and ls.card_instance_id = x.card_instance_id
   );

  return v_lineup;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.settle_week_payouts(p_season integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_season integer;
  v_week   record;
  v_paid   jsonb := '[]'::jsonb;
  v_runs   jsonb;
begin
  v_season := coalesce(p_season, (select max(season) from public.games));
  if v_season is null then
    return jsonb_build_object('settled', 0, 'reason', 'no games');
  end if;
  for v_week in
    select g.season, g.season_type, g.week
      from public.games g
     where g.season = v_season
       and g.week is not null
     group by g.season, g.season_type, g.week
    having count(*) filter (where g.status_state is distinct from 'final') = 0
     order by g.season_type, g.week
  loop
    perform public.grant_weekly_coins(v_week.season, v_week.season_type::smallint, v_week.week);
    perform public.award_score_coins(v_week.season, v_week.season_type::smallint, v_week.week);
    perform public.award_position_bonuses(v_week.season, v_week.season_type::smallint, v_week.week);
    perform public.award_contest_prizes(v_week.season, v_week.season_type::smallint, v_week.week);
    v_runs := public.settle_run_week(v_week.season, v_week.season_type::smallint, v_week.week);
    v_paid := v_paid || jsonb_build_array(
      jsonb_build_object('season_type', v_week.season_type, 'week', v_week.week,
                         'runs', v_runs));
  end loop;
  return jsonb_build_object('season', v_season, 'weeks', v_paid,
                            'settled', jsonb_array_length(v_paid));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.week_recap(p_season integer, p_season_type smallint, p_week integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user   uuid := auth.uid();
  v_lineup public.lineups%rowtype;
  v_cards  jsonb;
  v_sets   jsonb;
  v_rank   bigint;
  v_of     bigint;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- `l.*`, and the join, are both load-bearing. This was `select * from
  -- public.lineups where user_id/season/type/week` — a SELECT INTO with no
  -- LIMIT, which was an exact key until a week could hold two lineups and is
  -- now a coin toss between your main lineup and a three-card lobby entry.
  -- plpgsql does not raise on multiple rows unless INTO STRICT; it just takes
  -- one. The recap is about the season contest, so it takes the free one.
  select l.* into v_lineup
    from public.lineups l
    join public.contests c_free on c_free.id = l.contest_id and c_free.kind = 'free'
   where l.user_id = v_user and l.season = p_season
     and l.season_type = p_season_type and l.week = p_week;

  if not found then
    return jsonb_build_object(
      'season', p_season, 'season_type', p_season_type, 'week', p_week,
      'has_lineup', false);
  end if;

  -- Where the week finished against everyone else who played it. Computed over
  -- scored lineups only, so an unscored week does not rank you above people who
  -- simply have not been swept yet.
  select r.rk, r.total into v_rank, v_of
    from (
      select l.user_id,
             rank() over (order by l.total_points desc) as rk,
             count(*) over ()                           as total
        from public.lineups l
      join public.contests c_free on c_free.id = l.contest_id and c_free.kind = 'free'
       where l.season = p_season and l.season_type = p_season_type
         and l.week = p_week and l.scored_at is not null
    ) r
   where r.user_id = v_user;

  -- ------------------------------------------------------------- the cards
  select coalesce(jsonb_agg(row order by row->>'display_order'), '[]'::jsonb)
    into v_cards
    from (
      select jsonb_build_object(
               'slot',            ls.slot,
               'display_order',   lpad(c.display_order::text, 3, '0'),
               'card_instance_id',ci.id,
               'player_id',       pl.id,
               'player_name',     pl.full_name,
               'position',        pl.position_abbreviation,
               'team',            tm.abbreviation,
               'points',          ls.points,
               -- Null until the week is awarded. The client draws a "pending"
               -- row rather than a zero, because those are different states.
               'awarded',         ls.coins_awarded is not null,
               'tier_at_award',   ls.tier_at_award,
               'coin_multiplier',  ls.coin_multiplier,
               'coins',            ls.coins_awarded,
               'position_rank',   ls.position_rank,
               'bonus_coins',      ls.bonus_coins,
               'was_week_mvp',    coalesce(ls.was_week_mvp, false),
               'tier_now',        ci.tier,
               -- The forward pull. True only when the card has climbed since it
               -- was paid, which is what makes next week worth turning up for.
               'promoted',        ls.tier_at_award is not null
                                    and ci.tier is distinct from ls.tier_at_award,
               'career_fp',       ci.career_fp
             ) as row
        from public.lineup_slots ls
        join public.lineup_slot_config c on c.slot = ls.slot
        join public.card_instances ci on ci.id = ls.card_instance_id
        join public.cards          cd on cd.id = ci.card_id
        join public.players        pl on pl.id = cd.player_id
        left join public.teams     tm on tm.id = pl.team_id
       where ls.lineup_id = v_lineup.id
    ) rows;

  -- ------------------------------------------------------- what you're near
  --
  -- The three unfinished rungs this player is closest to, counted in cards
  -- they ALREADY HOLD and could commit today. A rung that is close only in
  -- theory is not a call to action, so `ready` is what orders this and cards
  -- still to be pulled are not counted.
  select coalesce(jsonb_agg(row order by (row->>'still_needed')::int asc), '[]'::jsonb)
    into v_sets
    from (
      select jsonb_build_object(
               'code',         s.code,
               'name',         s.name,
               'family',       s.family,
               'committed',    p.committed,
               'next_at',      k.cards,
               'next_reward',  k.coins,
               'still_needed', k.cards - p.committed,
               'ready_now',    least(r.ready, k.cards - p.committed)
             ) as row
        from public.card_sets s
        cross join lateral (
          select count(distinct ci.card_id)::integer as committed
            from public.card_instances ci
           where ci.committed_to = s.id
             and ci.committed_at is not null
             and ci.user_id = v_user
        ) p
        cross join lateral (
          select count(distinct mm.card_id)::integer as ready
            from public.card_set_members mm
            join public.card_instances ci
              on ci.card_id = mm.card_id
             and ci.is_held
             and ci.user_id = v_user
           where mm.set_id = s.id
             and not exists (
               select 1 from public.card_instances cc
                where cc.committed_to = s.id and cc.card_id = mm.card_id
                  and cc.committed_at is not null and cc.user_id = v_user
             )
        ) r
        join lateral (
          select ceil(s.required_count * ms.threshold_pct / 100.0)::integer as cards,
                 ms.reward_coins as coins
            from public.card_set_milestones ms
           where ms.set_id = s.id
             and ceil(s.required_count * ms.threshold_pct / 100.0) > p.committed
           order by ms.threshold_pct asc
           limit 1
        ) k on true
       where s.is_active
         and s.family <> 'daily'      -- a daily expires tonight; not a chase
         and r.ready > 0              -- only rungs they can act on right now
       order by (k.cards - p.committed) asc, r.ready desc
       limit 3
    ) rows;

  return jsonb_build_object(
    'season',       p_season,
    'season_type',  p_season_type,
    'week',         p_week,
    'has_lineup',   true,
    'scored',       v_lineup.scored_at is not null,
    'finalized',    v_lineup.finalized_at is not null,
    'total_points', v_lineup.total_points,
    'rank',         v_rank,
    'of',           v_of,
    'cards',        v_cards,
    -- Summed from the same stamped columns the ledger was written from.
    'coins_points',  (select coalesce(sum(coins_awarded), 0) from public.lineup_slots where lineup_id = v_lineup.id),
    'coins_bonus',   (select coalesce(sum(bonus_coins), 0)   from public.lineup_slots where lineup_id = v_lineup.id),
    'closest_sets', v_sets,
    'roster',       public.roster_status());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.wipe_run(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run   public.runs;
  v_cards integer := 0;
  v_coins  integer := 0;
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
  select balance into v_coins from public.coin_balances
   where user_id = v_run.user_id for update;
  v_coins := coalesce(v_coins, 0);

  if v_coins > 0 then
    update public.coin_balances set balance = 0, updated_at = now()
     where user_id = v_run.user_id;
    -- Keyed on the run, which can only die once. Ledgered rather than silently
    -- zeroed so the balance still reconciles: the screen a player will scour
    -- hardest for an accounting error is the one that just took everything.
    insert into public.coins_ledger (user_id, amount, reason, reference_id, idempotency_key)
    values (v_run.user_id, -v_coins, 'run_wipe', p_run, format('run_wipe:%s', p_run));
  end if;

  return jsonb_build_object('run', p_run, 'cards', v_cards, 'coins', v_coins);
end;
$function$
;
;

-- 9. re-grant the seven that were dropped
grant execute on function public.board_collection(p_season integer, p_limit integer) to authenticated, service_role;
grant execute on function public.board_sets(p_limit integer) to authenticated, service_role;
grant execute on function public.contest_history(p_limit integer, p_before timestamp with time zone, p_before_id uuid) to authenticated, service_role;
grant execute on function public.contest_lineup(p_contest uuid, p_user uuid) to authenticated, service_role;
grant execute on function public.contest_lobby() to authenticated, service_role;
grant execute on function public.contest_payouts(p_contest uuid) to authenticated, service_role;
grant execute on function public.my_contest_cards(p_include text) to authenticated, service_role;

--    A dropped function loses its ACL, and CREATE hands EXECUTE to PUBLIC --
--    and, on this project, to anon by default privilege. The seven above were
--    postgres/authenticated/service_role before and must be again, so the
--    default grants are taken back explicitly. community_boards.test.sql is
--    what caught this: it asserts every board function refuses anon.
revoke execute on function public.board_collection(p_season integer, p_limit integer) from public, anon;
revoke execute on function public.board_sets(p_limit integer) from public, anon;
revoke execute on function public.contest_history(p_limit integer, p_before timestamp with time zone, p_before_id uuid) from public, anon;
revoke execute on function public.contest_lineup(p_contest uuid, p_user uuid) from public, anon;
revoke execute on function public.contest_lobby() from public, anon;
revoke execute on function public.contest_payouts(p_contest uuid) from public, anon;
revoke execute on function public.my_contest_cards(p_include text) from public, anon;
