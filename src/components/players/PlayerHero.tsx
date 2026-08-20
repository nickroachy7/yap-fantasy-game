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
 * ONE ARRANGEMENT, BOTH PAGES, and that is a decision rather than an accident.
 *
 * The card page briefly had its own: a 140pt card face with the bio running
 * down its side as a list. It read well on its own and was wrong next to its
 * sibling — two headers with different portraits, different fact shapes and
 * different proportions stop looking like two views of one player and start
 * looking like two apps. The identity block is the part a reader uses to
 * confirm they are where they think they are, so it is the last part that
 * should vary.
 *
 * What separates the two pages is therefore COLOUR ALONE: the wash behind this
 * block (`PlayerSheetFrame`'s `tone` — the club on one page, the tier on the
 * other) and the tier edge on the portrait. Everything else — the portrait's
 * size, the type, the fact tiles and their order — is identical by
 * construction, because it is the same code with no branch in it.
 *
 * The colour band behind all of this is NOT drawn here; it belongs to
 * `PlayerSheetFrame`, which can reach the sheet's edges and the title bar. See
 * its `tone` prop.
 *
 * There is no `accessory` slot any more. It existed for the card profile's
 * large tier badge, which hung off the hero's right edge; the badge is gone and
 * the slot went with it rather than sitting here waiting for a caller.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PlayerAvatar } from '@/components/cards/PlayerAvatar';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryCode, injuryWeight } from '@/lib/injury';
import type { PlayerBio } from './profile';

/**
 * Side of the hero's portrait frame.
 *
 * 64. It was 56 against a two-line block and 84 when the vitals were briefly in
 * the column beside it; the vitals have gone to the Overview tab, so the text
 * is two lines again — 30pt of name over a 15pt identity run. The frame
 * overhangs that slightly on purpose, which anchors the block rather than
 * squaring off flush with it.
 */
export const HERO_PORTRAIT = 64;

export function PlayerHero({
  name,
  bio,
  team,
  position,
  injuryStatus,
  figure,
  meta,
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
   * A line under the identity run, in the text column beside the portrait.
   *
   * The card profile's copy line lives here — tier mark, career total, and how
   * far it is from promotion — which is the same line the lineup row prints
   * under the same name. A reader who has learned to read that row does not
   * have to learn this page.
   *
   * It replaced the large tier badge that used to hang off the hero's right
   * edge. The badge said one word the line says as well, in a lozenge big
   * enough to compete with the player's name for the top of the page, and it
   * could not say the two things a reader actually wants next to a tier: what
   * the copy has banked, and what is left to run.
   */
  meta?: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* The shirt number rides with the club and the position, because it is the
     same KIND of fact as they are: it is how you refer to a player, not
     something you measure about him. In the vitals it was the one cell nobody
     compares between two players — 28 against 25 is a fact, #12 against #16 is
     not — and moving it up left four columns, which is what the row wanted. */
  const identity = [team?.toUpperCase(), position, bio?.jerseyNumber ? `#${bio.jerseyNumber}` : null]
    .filter(Boolean)
    .join(' · ');

  /* The designation rides ON the identity line as a one- or two-character
     code, which is what both rows do. It used to be a full-width `InjuryChip`
     on a line of its own printing QUESTIONABLE at detail size — a whole row of
     the header, in the loudest colour on it, for a qualifier that is true of a
     quarter of the league most weeks. See `injuryCode`. */
  const weight = injuryWeight(injuryStatus);

  const portrait = figure ?? <PlayerAvatar size={HERO_PORTRAIT} />;

  return (
    <View style={styles.head}>
      {portrait}

      {/* IDENTITY ONLY: the name, and the run that qualifies it. The
          measurements that used to sit under here have gone to the Overview
          tab — see `BioFacts`, which has the argument. */}
      <View style={styles.headText}>
        <Text style={[Type.page, { color: c.text }]} numberOfLines={2}>
          {name}
        </Text>

        {identity ? (
          /* SPELLED OUT for a screen reader, because the printed form is a
             letter. `InjuryChip` used to carry this label and the chip went
             with the big designation; the obligation did not. "CAR · QB Q"
             read aloud is not a designation, it is a typo. */
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

        {meta}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    /* Centred against the portrait. The column is two lines again now the
       measurements have gone to Overview — ~47pt against a 64pt frame — so
       top-aligning left the name riding high with the frame hanging below it.
       Centring squares the two off. A name that wraps to three lines outgrows
       the frame instead, and then the frame centres against the text, which is
       the same rule reading the other way. */
    alignItems: 'center',
    gap: Spacing.two + Spacing.one,
  },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  /**
   * NO FILL, and no wrap. The cells divide the width evenly however many there
   * are, which is the invariant that lets them lose their boxes: five filled
   * tiles needed a `flexBasis` to keep a sane width when they wrapped, and the
   * basis is what let one long value escape onto a line of its own.
   *
   * Losing the fills is also what lets the header's colour wash be seen. Six
   * `backgroundElement` boxes over a tinted band left the tint visible only in
   * the gaps between them, which is a strange thing to build a colour system
   * for and then cover up.
   */
});
