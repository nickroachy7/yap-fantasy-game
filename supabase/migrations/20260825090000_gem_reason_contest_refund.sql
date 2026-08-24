-- The ledger line for leaving a contest before it starts.
--
-- Its own migration because `alter type ... add value` cannot be used by other
-- statements in the transaction that adds it — same shape as `20260825040000`.
alter type public.gem_reason add value if not exists 'contest_refund';
