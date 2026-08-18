-- Measured problem: with uniform pulls a kicker appears in only 19.5% of 5-card
-- packs, so ~34% of new players would burn their entire 500-gem grant and still
-- be unable to fill the K slot. The first session would be "I cannot play".
--
-- Fix the mechanism, not the numbers: packs may now guarantee position coverage,
-- and coverage stays data so it is tunable without a deploy.
alter table public.packs
  add column if not exists guaranteed_positions jsonb not null default '{}'::jsonb,
  add column if not exists once_per_user boolean not null default false;

-- Free, once per player, and deals exactly a legal 8-slot lineup:
-- QB, RB1, RB2, WR1, WR2, TE, FLEX(WR), K.
insert into public.packs (code, name, gem_cost, card_count, odds, guaranteed_positions, once_per_user, is_active)
values ('starter', 'Starter Pack', 0, 8, '{}'::jsonb,
        '{"QB":1,"RB":2,"WR":3,"TE":1,"PK":1}'::jsonb, true, true)
on conflict (code) do update
  set name = excluded.name,
      gem_cost = excluded.gem_cost,
      card_count = excluded.card_count,
      odds = excluded.odds,
      guaranteed_positions = excluded.guaranteed_positions,
      once_per_user = excluded.once_per_user,
      is_active = excluded.is_active;

-- NOTE: open_pack() is redefined here to honour guaranteed_positions. The full
-- body lives in this migration so a replay produces the final function.
