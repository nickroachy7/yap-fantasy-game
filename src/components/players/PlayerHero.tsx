/**
 * The identity block at the top of BOTH profiles.
 *
 * WHY THE TWO PAGES SHARE IT
 *
 * `/player/<player_id>` and `/card/<card_instance_id>` answer different
 * questions, but they open on the same person, and the first thing either
 * reader needs is the same: who is this, where does he play, and how is he
 * doing. Drawing that twice invites the two to drift, and the moment they drift
 * the pages stop feeling like two views of one thing.
 *
 * So the hero is fixed and shared, and everything BELOW it — the tabs — is
 * where the two diverge.
 *
 * NO PHOTO, NO LOGO, NO JERSEY. Unlicensed, and the established rule for card
 * art. What the hero carries instead is the empty portrait frame — the same
 * `PlayerAvatar` the directory row draws. It is the slot, not a picture: it
 * reserves the space a licensed headshot will land in, so the day one arrives
 * the identity block does not have to be relaid out around it.
 *
 * IT IS 48 NOW, NOT 64, AND THE HEADER ANSWERS A QUESTION
 *
 * The frame at 64 was the largest thing on a page it told you nothing about —
 * an empty grey square out-shouting the name beside it, above a header whose
 * entire output was two lines of text a reader already knew from the row they
 * tapped. Meanwhile "how is he doing" and "what has this copy earned" were two
 * scrolls down, in a stat row on Overview and a panel on Card respectively.
 *
 * So the frame came down to 48 and the figures came up. `figures` is a strip of
 * three fused to the bottom of the wash: the page now says who and how well
 * before anything scrolls. The strip is a PROP rather than a branch because
 * which three differ — this copy's earnings on one page, the player's season on
 * the other — while the arrangement must not. Same rule as `figure` and
 * `trailing`: the caller owns the contents, this file owns the shape.
 *
 * Overview's stat row and the top half of `CardStanding` are what the strip
 * replaced. Do not put them back; two places to read the same number is how
 * they end up disagreeing.
 *
 * The colour band behind all of this is NOT drawn here; it belongs to
 * `PlayerSheetFrame`, which can reach the sheet's edges and the title bar. See
 * its `tone` prop. What separates the two pages is that wash, the tier edge on
 * the portrait, and the three figures. Everything else is the same code with no
 * branch in it.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PlayerAvatar } from '@/components/cards/PlayerAvatar';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryCode, injuryWeight } from '@/lib/injury';
import type { PlayerBio } from './profile';

/**
 * Side of the hero's portrait frame.
 *
 * 48, against a two-line text column of about 40pt. The frame overhangs that
 * slightly, which anchors the block rather than squaring off flush with it. It
 * was 64 when the header had nothing else in it — see the note above.
 */
export const HERO_PORTRAIT = 48;

/** One cell of the strip. Three fit a phone; a fourth truncates its label. */
export type HeroFigure = {
  label: string;
  value: string;
  /** A qualifier set small and inline after the figure — "of 84". */
  hint?: string;
};

export function PlayerHero({
  name,
  bio,
  team,
  position,
  injuryStatus,
  figure,
  trailing,
  figures,
}: {
  name: string;
  /** Null until the profile RPC lands; the hero still draws from the fallbacks. */
  bio: PlayerBio | null;
  team: string | null;
  position: string | null;
  injuryStatus: string | null;
  /**
   * What sits in the portrait slot, at `HERO_PORTRAIT` either way. Defaults to
   * the plain `PlayerAvatar` the directory row draws; the card profile passes
   * the same avatar wearing its copy's tier edge.
   *
   * It is a slot rather than a flag because what goes in it is the caller's
   * business, but the SIZE is not — a header whose portrait changes size
   * between two pages is the thing this component exists to prevent.
   */
  figure?: ReactNode;
  /**
   * The right end of the identity row: the tier chip on a card, how many copies
   * you hold on a player. One short thing, or nothing — it is the narrowest
   * part of the row and it gives way to the name, not the other way round.
   */
  trailing?: ReactNode;
  /** Three figures, fused to the foot of the wash. See the note above. */
  figures?: HeroFigure[];
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* The shirt number rides with the club and the position, because it is the
     same KIND of fact as they are: it is how you refer to a player, not
     something you measure about him. */
  const identity = [team?.toUpperCase(), position, bio?.jerseyNumber ? `#${bio.jerseyNumber}` : null]
    .filter(Boolean)
    .join(' · ');

  /* The designation rides ON the identity line as a one- or two-character
     code, which is what both rows do. It used to be a full-width `InjuryChip`
     printing QUESTIONABLE at detail size — a whole row of the header, in the
     loudest colour on it, for a qualifier that is true of a quarter of the
     league most weeks. See `injuryCode`. */
  const weight = injuryWeight(injuryStatus);

  const portrait = figure ?? <PlayerAvatar size={HERO_PORTRAIT} />;

  return (
    <View>
      <View style={styles.head}>
        {portrait}

        <View style={styles.headText}>
          <Text style={[Type.page, styles.name, { color: c.text }]} numberOfLines={2}>
            {name}
          </Text>

          {identity ? (
            /* SPELLED OUT for a screen reader, because the printed form is a
               letter. "CAR · QB Q" read aloud is not a designation, it is a
               typo. */
            <Text
              style={[Type.label, { color: c.textSecondary }]}
              numberOfLines={1}
              accessibilityLabel={
                weight && injuryStatus ? `${identity}, ${injuryStatus}` : identity
              }>
              {identity}
              {weight && injuryStatus ? (
                <Text style={{ color: weight === 'blocking' ? c.negative : c.warning }}>
                  {`  ${injuryCode(injuryStatus)}`}
                </Text>
              ) : null}
            </Text>
          ) : null}
        </View>

        {trailing}
      </View>

      {/**
        * FUSED TO THE WASH, NOT FLOATING ON IT. The strip climbs back out to
        * the sheet's edges the way `SectionStack` does — same numbers, same
        * reason — so its rules run edge to edge and it reads as the foot of the
        * coloured band rather than as a card dropped on one.
        *
        * `borderStrong` rather than `border`, which is the one place on these
        * pages that is true: everywhere else a hairline sits on the page
        * background, and here it sits on a tinted wash that eats the lighter
        * grey. On the dark clubs `border` is simply not there.
        */}
      {figures && figures.length > 0 ? (
        <View style={[styles.strip, { borderTopColor: c.borderStrong }]}>
          {figures.map((f, i) => (
            <View
              key={f.label}
              style={[
                styles.cell,
                i < figures.length - 1 && styles.cellDivided,
                { borderRightColor: c.borderStrong },
              ]}>
              <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
                {f.label}
              </Text>
              <Text numberOfLines={1} style={[NUMERIC, styles.cellValue, { color: c.text }]}>
                {f.value}
                {f.hint ? (
                  <Text style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
                    {` ${f.hint}`}
                  </Text>
                ) : null}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    /* Centred against the portrait: the column is two lines, ~40pt against a
       48pt frame, so top-aligning left the name riding high with the frame
       hanging below it. A name that wraps to three lines outgrows the frame
       instead, and then the frame centres against the text — the same rule
       reading the other way. */
    alignItems: 'center',
    gap: Spacing.two + Spacing.one,
    paddingBottom: Spacing.three,
  },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  /* Two points off `Type.page`. The name shares its row with a chip now, and at
     26 a long one wrapped to two lines on a phone often enough to matter. */
  name: { fontSize: 24, lineHeight: 28 },
  strip: {
    flexDirection: 'row',
    marginHorizontal: -Spacing.three,
    /* The pair puts the outer cells' text back on the hero's 16pt gutter while
       the rule above them still runs to the sheet's edges: 6 out here plus 10
       inside a cell. Change one and the first label stops lining up with the
       name above it. */
    paddingHorizontal: Spacing.one + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cell: { flex: 1, minWidth: 0, gap: 1, paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.two },
  cellDivided: { borderRightWidth: StyleSheet.hairlineWidth },
  cellValue: { fontSize: 17, lineHeight: 21, fontWeight: '700' },
});
