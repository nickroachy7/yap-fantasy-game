-- Two indexes the set pages actually read through.
--
-- `my_sets` draws 37 rows and each one asks card_instances "what has this user
-- committed to THIS set" and set_completions "have they claimed it". Both are
-- lookups by set_id, and neither had an index that could serve one:
--
--   * the partial unique index added with the commit mechanic is
--     (user_id, committed_to, card_id), so `committed_to = $1` cannot use it —
--     it is not the leading column. Thirty-seven sequential scans of
--     card_instances per page load, growing with every card every user has
--     ever pulled.
--   * set_completions had no index on set_id at all, only its primary key
--     (user_id, set_id), which has the same leading-column problem.
--
-- Caught by the database linter rather than by anything going wrong, which is
-- the point of running it after a schema change: at 23 card instances neither
-- scan is measurable, and at 23,000 both are.

-- Partial: only committed rows are ever looked up this way, and the index then
-- holds one row per filled slot rather than one per card ever minted.
create index if not exists card_instances_committed_to_idx
  on public.card_instances (committed_to, card_id)
  where committed_at is not null;

create index if not exists set_completions_set_idx
  on public.set_completions (set_id);
