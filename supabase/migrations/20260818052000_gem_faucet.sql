-- Gem faucet v1 (build plan task 22): a weekly grant plus an earn-from-score
-- trickle. Start stingy — you can always grant more, you cannot claw back.
--
-- Both grants run from cron, which means they WILL be retried. Idempotency is
-- enforced by the database rather than by the caller remembering: every faucet
-- row carries a deterministic key and a unique index rejects the duplicate.

alter table public.gems_ledger add column if not exists idempotency_key text;

create unique index if not exists gems_ledger_idempotency_key_idx
  on public.gems_ledger (idempotency_key)
  where idempotency_key is not null;

create or replace function public.grant_weekly_gems(
  p_season      integer,
  p_season_type smallint,
  p_week        integer,
  p_amount      integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_granted integer;
begin
  if p_amount <= 0 then
    raise exception 'grant must be positive' using errcode = '22023';
  end if;

  with eligible as (
    select gb.user_id,
           format('weekly_grant:%s:%s:%s:%s', gb.user_id, p_season, p_season_type, p_week) as key
      from public.gem_balances gb
  ),
  inserted as (
    insert into public.gems_ledger (user_id, amount, reason, idempotency_key)
    select e.user_id, p_amount, 'weekly_grant', e.key
      from eligible e
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id
  )
  update public.gem_balances gb
     set balance = gb.balance + p_amount, updated_at = now()
    from inserted i
   where gb.user_id = i.user_id;

  get diagnostics v_granted = row_count;
  return jsonb_build_object('week', p_week, 'amount', p_amount, 'granted_to', v_granted);
end;
$$;

create or replace function public.award_score_gems(
  p_season      integer,
  p_season_type smallint,
  p_week        integer,
  p_per_point   numeric default 0.5
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_awarded integer;
begin
  with scored as (
    select l.user_id,
           greatest(0, floor(l.total_points * p_per_point))::integer as amount,
           format('score_reward:%s:%s:%s:%s', l.user_id, p_season, p_season_type, p_week) as key
      from public.lineups l
     where l.season = p_season
       and l.season_type = p_season_type
       and l.week = p_week
       and l.scored_at is not null
  ),
  payable as (
    select * from scored where amount > 0
  ),
  inserted as (
    insert into public.gems_ledger (user_id, amount, reason, idempotency_key)
    select p.user_id, p.amount, 'weekly_score_reward', p.key
      from payable p
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id, amount
  )
  update public.gem_balances gb
     set balance = gb.balance + i.amount, updated_at = now()
    from inserted i
   where gb.user_id = i.user_id;

  get diagnostics v_awarded = row_count;
  return jsonb_build_object('week', p_week, 'per_point', p_per_point, 'awarded_to', v_awarded);
end;
$$;

revoke execute on function public.grant_weekly_gems(integer, smallint, integer, integer) from public, anon, authenticated;
revoke execute on function public.award_score_gems(integer, smallint, integer, numeric) from public, anon, authenticated;
