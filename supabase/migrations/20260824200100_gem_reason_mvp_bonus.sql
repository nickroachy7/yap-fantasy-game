-- The third of the play-economy reasons, alone for the enum reason above.
--
-- Separate from 'position_bonus' because it answers a different question. A
-- position bonus is earned dozens of times a season across a league and is the
-- mechanic that teaches lineup skill. An MVP bonus fires once a week for the
-- single highest scorer in football, to whoever had the nerve to start them —
-- it is the story, not the teacher, and its payout is tuned as such. Folded
-- together, neither could be re-tuned without moving the other.
alter type public.gem_reason add value if not exists 'mvp_bonus';
