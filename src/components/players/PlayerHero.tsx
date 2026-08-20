/**
 * The identity block at the top of BOTH profiles.
 *
 * WHY THE TWO PAGES SHARE IT
 *
 * `/player/<player_id>` and `/card/<card_instance_id>` answer different
 * questions, but they open on the same person, and the first thing either
 * reader needs is the same: who is this, where does he play, how old and how
 * big is he. Drawing that twice invites the two to drift, and the moment they
 * drift the pages stop feeling like two views of one thing.
 *
 * So the hero is fixed and shared, and everything BELOW it — the tabs — is
 * where the two diverge.
 *
 * NO PHOTO, NO LOGO, NO JERSEY. Unlicensed, and the established rule for card
 * art. The reference leans on a cut-out player photo over a team-coloured band;
 * we have neither, so the identity is carried by type and by the bio row, which
 * is the part that was actually information rather than decoration.
 *
 * What the hero DOES carry is the empty portrait frame — the same `PlayerAvatar`
 * the directory row draws, at hero size. It is the slot, not a picture: it
 * reserves the space a licensed headshot will land in, so the day one arrives
 * the identity block does not have to be relaid out around it. Drawing it here
 * as well as in the row also means a player looks like the same player on the
 * list you tapped and the page you land on.
 *
 * `accessory` is the one seam: the card profile hangs its tier badge here so
 * the copy's identity sits with the player's rather than a scroll away.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { InjuryChip } from '@/components/cards/InjuryChip';
import { PlayerAvatar } from '@/components/cards/PlayerAvatar';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { PlayerBio } from './profile';

/**
 * Side of the hero's portrait frame. 56 is the height of the name over the
 * identity line beneath it, so the frame squares off against the text block it
 * sits beside rather than overhanging it — and it stays clear of the fact tiles
 * below, which are the row that should be widest on the page.
 */
const HERO_PORTRAIT = 56;

/**
 * "10th Season" -> "10th". The tile is 62pt wide and the label above it already
 * says EXP, so the word "Season" is the half that gets truncated AND the half
 * that carries no information — it rendered as "10th …" on a phone. "Rookie"
 * has no suffix and is left alone.
 */
function experienceLabel(raw: string): string {
  return raw.replace(/\s*seasons?$/i, '').trim() || raw;
}

export function PlayerHero({
  name,
  bio,
  team,
  position,
  injuryStatus,
  accessory,
}: {
  name: string;
  /** Null until the profile RPC lands; the hero still draws from the fallbacks. */
  bio: PlayerBio | null;
  team: string | null;
  position: string | null;
  injuryStatus: string | null;
  /** Card-profile extras — the tier badge — beside the identity line. */
  accessory?: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* Each fact is omitted entirely when unknown rather than rendered as a dash:
     an empty "COLLEGE —" cell tells the reader nothing they wanted. College is
     last and drops first, because it is the widest and the least load-bearing
     of the six on a phone. */
  const facts: { label: string; value: string }[] = [];
  if (bio?.jerseyNumber) facts.push({ label: 'NO.', value: `#${bio.jerseyNumber}` });
  if (bio?.age !== null && bio?.age !== undefined) facts.push({ label: 'AGE', value: String(bio.age) });
  if (bio?.height) facts.push({ label: 'HT', value: bio.height });
  if (bio?.weight) facts.push({ label: 'WT', value: bio.weight });
  if (bio?.experience) facts.push({ label: 'EXP', value: experienceLabel(bio.experience) });
  if (bio?.college) facts.push({ label: 'COLLEGE', value: bio.college });

  const identity = [team?.toUpperCase(), position].filter(Boolean).join(' · ');

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {/* Portrait and type are one unit, centred against each other, and the
            accessory hangs off the OUTSIDE of it still aligned to the top — a
            tier badge belongs at the top edge of the block, not halfway down
            beside a name that may run to two lines. */}
        <View style={styles.identity}>
          <PlayerAvatar size={HERO_PORTRAIT} />
          <View style={styles.headText}>
            <Text style={[Type.page, { color: c.text }]} numberOfLines={2}>
              {name}
            </Text>
            {identity ? (
              <Text style={[Type.label, { color: c.textSecondary }]} numberOfLines={1}>
                {identity}
              </Text>
            ) : null}
          </View>
        </View>
        {accessory}
      </View>

      {/* The designation is the one part of this block that is NEWS, so it sits
          on its own line rather than being folded into the identity run. */}
      {injuryStatus ? (
        <View style={styles.injuryRow}>
          <InjuryChip status={injuryStatus} size="detail" />
        </View>
      ) : null}

      {facts.length > 0 ? (
        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f.label} style={[styles.fact, { backgroundColor: c.backgroundElement }]}>
              <Text style={[Type.micro, { color: c.textTertiary }]}>{f.label}</Text>
              <Text numberOfLines={1} style={[Type.strong, NUMERIC, { color: c.text }]}>
                {f.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.one,
  },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  injuryRow: { flexDirection: 'row' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one + 2 },
  fact: {
    flexGrow: 1,
    flexBasis: 62,
    minWidth: 62,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
    gap: 1,
  },
});
