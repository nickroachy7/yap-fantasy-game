-- Injury sync needs a per-row UPDATE keyed on external_id. An upsert would
-- clobber first_name/last_name (upsert UPDATEs every column it is given), and
-- 300+ single-row updates is 300+ round trips. One set-based call does both
-- jobs: apply the current injury list, and clear anyone who has recovered.
create or replace function public.apply_injuries(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  touched integer;
begin
  with incoming as (
    select *
    from jsonb_to_recordset(payload) as x(
      external_id integer,
      status text,
      comment text,
      reported_at timestamptz
    )
  ),
  applied as (
    update public.players p
       set injury_status     = i.status,
           injury_comment    = i.comment,
           injury_updated_at = i.reported_at
      from incoming i
     where p.external_id = i.external_id
    returning p.id
  ),
  -- Anyone previously flagged but absent from the current list has recovered.
  cleared as (
    update public.players p
       set injury_status     = null,
           injury_comment    = null,
           injury_updated_at = null
     where p.injury_status is not null
       and p.external_id not in (select external_id from incoming)
    returning p.id
  )
  select (select count(*) from applied) into touched;

  return touched;
end;
$$;

revoke execute on function public.apply_injuries(jsonb) from public, anon, authenticated;
