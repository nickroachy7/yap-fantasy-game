-- The ledger line for paying into a contest.
--
-- Its own migration because `alter type ... add value` cannot be used by other
-- statements in the transaction that adds it, so the function that writes this
-- reason has to land in a later one. Same shape as `20260819235000` and
-- `20260824200100` before it.
alter type public.gem_reason add value if not exists 'contest_entry';
