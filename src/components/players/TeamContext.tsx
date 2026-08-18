/**
 * Who he plays for, and whether they are any good — the context a player row
 * cannot carry. Standings are the most recent season we hold, which through the
 * preseason means last year's record; the season is printed so that is never
 * ambiguous.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { PlayerBio, TeamStandings } from './profile';

export function TeamContext({
  bio,
  standings,
}: {
  bio: PlayerBio;
  standings: TeamStandings | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (!bio.teamName) return null;

  const division = [bio.conference, bio.division].filter(Boolean).join(' ');
  const diff = standings?.pointDifferential;

  return (
    <View style={[styles.card, { backgroundColor: c.backgroundElement }]}>
      <Text style={[styles.team, { color: c.text }]}>{bio.teamName}</Text>
      {division ? <Text style={[styles.meta, { color: c.textSecondary }]}>{division}</Text> : null}

      {standings ? (
        <Text style={[styles.meta, { color: c.textSecondary }]}>
          {standings.season} record {standings.overallRecord ?? '—'}
          {standings.divisionRecord ? ` · ${standings.divisionRecord} in division` : ''}
          {diff !== null && diff !== undefined
            ? ` · ${diff > 0 ? '+' : ''}${diff} point differential`
            : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: Spacing.three, gap: 2 },
  team: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, lineHeight: 17 },
});
