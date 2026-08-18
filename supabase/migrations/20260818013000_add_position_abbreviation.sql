-- The API returns both forms: position "Running Back" and
-- position_abbreviation "RB". Cards render the abbreviation and lineup slots
-- filter on it, so mirror both and index the one we query.
alter table public.players add column position_abbreviation text;

drop index if exists players_position_idx;
create index players_position_abbr_idx on public.players (position_abbreviation);
