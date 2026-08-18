-- Card tier is EARNED, not assigned (corrects schema v1).
--
-- A card_instance accumulates fantasy points every time it is started in a
-- lineup, and climbs Bronze -> Silver -> Gold -> Diamond as that total crosses
-- configured thresholds. Sitting on a collection earns nothing.
--
-- This is a property of the owned copy, not of the player: two users holding
-- the same player have independent tiers. `cards.rarity` stays as the separate
-- pull-difficulty axis and is untouched by progression.

create type card_tier as enum ('bronze', 'silver', 'gold', 'diamond');

-- Tunable without a deploy.
create table public.tier_thresholds (
  tier          card_tier primary key,
  min_career_fp numeric(10,2) not null check (min_career_fp >= 0),
  sort_order    smallint not null unique
);

insert into public.tier_thresholds (tier, min_career_fp, sort_order) values
  ('bronze',     0,    1),
  ('silver',   200,    2),
  ('gold',     750,    3),
  ('diamond', 2500,    4);

alter table public.tier_thresholds enable row level security;
create policy "tier thresholds are readable"
  on public.tier_thresholds for select to authenticated using (true);

-- rarity_at_mint froze a template's rarity onto the copy. Progression replaces
-- that idea: what the owner watches is the tier they earned.
alter table public.card_instances drop column rarity_at_mint;

alter table public.card_instances
  add column career_fp     numeric(10,2) not null default 0 check (career_fp >= 0),
  add column tier          card_tier     not null default 'bronze',
  add column lineup_starts integer       not null default 0 check (lineup_starts >= 0);

create index card_instances_tier_idx on public.card_instances (user_id, tier);

-- Keep tier consistent with career_fp at all times, so no writer can forget to
-- recompute it and no reader has to.
create or replace function public.sync_card_tier()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select t.tier into new.tier
    from public.tier_thresholds t
   where new.career_fp >= t.min_career_fp
   order by t.sort_order desc
   limit 1;

  -- Below the lowest threshold (or table empty): fall back to the base tier.
  if new.tier is null then
    new.tier := 'bronze';
  end if;

  return new;
end;
$$;

create trigger card_instances_sync_tier
  before insert or update of career_fp on public.card_instances
  for each row execute function public.sync_card_tier();
