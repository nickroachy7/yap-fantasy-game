-- A new ledger reason for completing a set.
--
-- Alone in its own migration for the same reason 'card_sale' was: Postgres
-- allows ALTER TYPE ... ADD VALUE inside a transaction, but the new label
-- cannot be USED until that transaction commits, so a single migration that
-- both adds the label and writes a row with it fails with "unsafe use of new
-- value of enum type". Splitting is the documented way round it.

alter type public.gem_reason add value if not exists 'set_reward';
