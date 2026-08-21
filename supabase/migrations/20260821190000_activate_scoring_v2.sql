-- Activate version 2.
--
-- SEPARATE FROM 20260821180000 ON PURPOSE, and the gap between them is not
-- ceremony. `score_week` joins `fantasy_points` on the active version, so
-- between activating a ruleset and finishing its recompute, every lineup in the
-- database resolves to zero through a LEFT JOIN to rows that do not exist. The
-- seed migration therefore leaves v2 inactive, and this one may only be applied
-- after `supabase/functions/rescore` has run against it.
--
-- It did, before this was written: 32,812 stat lines scanned and 32,812 v2 rows
-- written in 7.9s, no provider call. 105 lines changed, every one of them
-- downward — a ruleset that only subtracts cannot raise a score, and a single
-- positive delta here would have meant something else had moved.
--
-- The guard below is not decoration either. If this is ever applied to a fresh
-- environment where the recompute has not run — a restore, a rebuilt branch, a
-- `db reset` — it fails loudly with a message naming the fix, instead of
-- silently zeroing every score in the database.
do $$
declare
  v_lines integer;
  v_v2    integer;
begin
  select count(*) into v_lines from public.stat_lines;
  select count(*) into v_v2
    from public.fantasy_points where rules_version = 2;

  if v_lines > 0 and v_v2 < v_lines then
    raise exception
      'refusing to activate v2: % of % stat lines have no v2 points. Run the rescore function first: POST /rescore {"version":2}',
      v_lines - v_v2, v_lines
      using errcode = '22023';
  end if;
end $$;

-- Two statements rather than one. `scoring_rules_single_active_idx` is unique on
-- is_active where is_active, and a single UPDATE touching both rows can violate
-- it mid-statement depending on the order it happens to visit them.
update public.scoring_rules set is_active = false where version = 1;
update public.scoring_rules set is_active = true  where version = 2;
