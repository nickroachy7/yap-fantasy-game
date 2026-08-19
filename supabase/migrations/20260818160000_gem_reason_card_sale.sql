-- A new ledger reason for selling a card.
--
-- Alone in its own migration on purpose. Postgres allows ALTER TYPE ... ADD
-- VALUE inside a transaction, but the new label cannot be USED until that
-- transaction commits — so a single migration that both adds 'card_sale' and
-- inserts a row with it fails with "unsafe use of new value of enum type".
-- Splitting is the documented way round it, not a stylistic choice.

alter type public.gem_reason add value if not exists 'card_sale';
