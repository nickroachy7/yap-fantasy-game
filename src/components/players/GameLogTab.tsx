/**
 * The Game log tab: STRICTLY the game log.
 *
 * The career table used to sit above it, on the argument that a season-grained
 * view and a game-grained view of the same thing belong together. That argument
 * was about zoom levels and it was the wrong axis. The tabs on this profile
 * split by KIND of question — who is he (Overview), what is this copy (Card),
 * what happened week by week (here) — and a season-by-season summary is an
 * answer to the first. It has moved to Overview, where it sits under the
 * season's headline figures as the next level of the same story.
 *
 * What is left is one thing, which is the point: open a season, read the weeks.
 */
import { GameLog } from './GameLog';
import type { GameLogSection } from './game-log';
import type { PlayerProfile } from './profile';

export function GameLogTab({
  profile,
  sections,
  startedWeeks,
}: {
  profile: PlayerProfile | null;
  sections: GameLogSection[];
  /** Card profile only — marks the weeks the viewer's copy was started. */
  startedWeeks?: Set<string>;
}) {
  return (
    <GameLog
      sections={sections}
      position={profile?.player.positionAbbreviation ?? null}
      startedWeeks={startedWeeks}
    />
  );
}
