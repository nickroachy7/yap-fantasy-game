-- Scoring rules live as data, not code, so changing them is an INSERT of a new
-- version plus a recompute against stored stat_lines.raw — never a re-ingest.
-- The plan lists the exact ruleset as an open question; v1 is full PPR with
-- yardage bonuses, and superseding it costs one row.
insert into public.scoring_rules (version, name, rules, is_active)
values (
  1,
  'Full PPR with yardage bonuses',
  '{
     "perStat": {
       "passing_yards": 0.04,
       "passing_touchdowns": 4,
       "passing_interceptions": -2,
       "rushing_yards": 0.1,
       "rushing_touchdowns": 6,
       "receptions": 1,
       "receiving_yards": 0.1,
       "receiving_touchdowns": 6,
       "fumbles_lost": -2,
       "field_goals_made": 3,
       "extra_points_made": 1,
       "kick_return_touchdowns": 6,
       "punt_return_touchdowns": 6,
       "fumbles_touchdowns": 6,
       "interception_touchdowns": 6
     },
     "bonuses": [
       { "stat": "passing_yards",   "atLeast": 300, "points": 3 },
       { "stat": "rushing_yards",   "atLeast": 100, "points": 3 },
       { "stat": "receiving_yards", "atLeast": 100, "points": 3 }
     ]
   }'::jsonb,
  true
)
on conflict (version) do update
  set rules = excluded.rules,
      name  = excluded.name;
