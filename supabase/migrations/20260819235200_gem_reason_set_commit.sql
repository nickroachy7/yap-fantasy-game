-- A new ledger reason for committing a card into a set.
--
-- Alone in its own migration, for the third time and the same reason: Postgres
-- allows ALTER TYPE ... ADD VALUE inside a transaction but forbids USING the
-- new label until that transaction commits, so a migration that both adds
-- 'set_commit' and writes a row with it fails with "unsafe use of new value of
-- enum type".
--
-- It is deliberately NOT 'card_sale'. A commit and a sale both destroy a card
-- and both pay gems, but they are different events with different rates and
-- different consequences, and a ledger that called them the same thing could
-- not answer "how much has the set economy actually paid out" — which is the
-- number that says whether the rate below is right.

alter type public.gem_reason add value if not exists 'set_commit';
