-- ===========================================================================
-- THE SHELF READS ITS OWN ODDS IN ONE QUERY
-- ===========================================================================
--
-- `pack_odds(code)` returns four rows for one pack, which is the right shape
-- for asking about a pack and the wrong shape for drawing a shelf: six packs
-- would be six round trips on a sheet that is already waiting on the wallet and
-- the opening history.
--
-- So the shelf gets a view that does the lateral join once. Nothing here is new
-- arithmetic — every number still comes out of `pack_odds`, which still reads
-- exactly the columns `open_pack` deals from. THAT IS THE WHOLE POINT AND IT IS
-- WORTH RESTATING: the client is not allowed to compute a published rate. A
-- rate the client derives is a rate that goes wrong the first time either side
-- is touched, and it goes wrong silently — the number still renders, it is just
-- no longer what the deal does.
--
-- ONE ROW PER PACK, with the four tiers folded into a jsonb object rather than
-- four rows the client has to regroup:
--
--     {"depth": {"per_card": 93.3, "at_least_one": 100.0}, ...}
--
-- `security_invoker = on` for the reason `card_pull_tiers` now carries it: a
-- view in `public` that runs as its owner bypasses RLS on everything it reads,
-- and `view_security` fails the build over it. `packs` allows select to
-- authenticated, so an invoker read returns the same rows.
-- ===========================================================================

create or replace view public.pack_shelf
with (security_invoker = on) as
select p.id,
       p.code,
       p.name,
       p.coin_cost,
       p.card_count,
       p.once_per_user,
       p.daily_limit,
       p.guaranteed_positions,
       /* The guarantee as the shelf needs to say it: a tier and a count, or
          nothing at all. Passed through rather than rendered into a sentence
          here — copy belongs in the client, and a phrase built in SQL is a
          phrase nobody can find when it needs changing. */
       p.guarantee,
       (select jsonb_object_agg(o.pull_tier,
                 jsonb_build_object('per_card',     o.per_card_pct,
                                    'at_least_one', o.at_least_one_pct))
          from public.pack_odds(p.code) o) as odds
  from public.packs p
 where p.is_active;

comment on view public.pack_shelf is
  'Every active pack with its published odds folded in, one row each. The shelf''s single read; see 20260905220000.';

grant select on public.pack_shelf to authenticated, service_role;
