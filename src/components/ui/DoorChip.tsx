/**
 * A DOOR: a small pill that leads somewhere else, with an optional mark in
 * front of the word.
 *
 * ---------------------------------------------------------------------------
 * IT WAS `RailChip`, PRIVATE TO THE CONTEST CAROUSEL
 * ---------------------------------------------------------------------------
 *
 * `+ Contests` and `+ Packs` sit at the end of the lineup's rail, and the note
 * where they are drawn is worth reading for WHY they look like this — why the
 * gold is on the mark rather than the slab, why the glyph carries the act and
 * the word carries the room, why the height is 28 and not the app's 32pt
 * `ControlDiameter`.
 *
 * None of that reasoning was about the rail. It is about a pair of quiet doors
 * at the end of a readout, under the object they serve — and the collection's
 * toolbar is now exactly that shape: what your cards are worth, how many you
 * hold, and the two places you go from there. `+ Sets` and `+ Packs`.
 *
 * SO IT IS ONE COMPONENT. Two hand-built copies drifted a point in height the
 * first time either was touched even when both were in the same file (which is
 * why `RailChip` existed at all); across two files, with the two rows one tab
 * apart, they would not have stood a week. The rule the carousel already
 * applied to a pair now applies to four.
 *
 * WHAT A CALLER STILL DECIDES: the fill, the ink, and whether there is a mark.
 * Those are the three things that differ between a door offering something the
 * player can afford and one that is merely a room — see the accent rule at the
 * carousel's doors, and note that only ONE mark on a row may take the accent.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';

/**
 * The chip's height. 28 rather than the app's 32pt `ControlDiameter`, which is
 * a decision worth keeping wherever these appear: at 32, a PAIR of them is
 * plainly the biggest object on its row, and a filter chip is not the
 * comparison that matters — those sit in a row of their own peers, these sit at
 * the end of a readout and have to rank below the thing the readout serves.
 *
 * The touch target does not shrink with it: `hitSlop` reaches past 44.
 */
export const DOOR_HEIGHT = 28;

/** The `+` ahead of a door's label. See `Plus`. */
const PLUS_SIZE = 9;

export function DoorChip({
  label,
  accessibilityLabel,
  onPress,
  fill,
  ink,
  lead,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  fill: string;
  ink: string;
  /** The mark before the word. Null draws the word alone — see `chipBare`. */
  lead: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      /* Drawn at `DOOR_HEIGHT` and reached out past the platform's 44 — the
         same trick `Pip` uses, and the reason these can be quiet chips without
         being small targets. */
      hitSlop={9}
      style={({ pressed }) => [
        styles.chip,
        !lead && styles.chipBare,
        { backgroundColor: fill },
        pressed && styles.pressed,
      ]}>
      {lead}
      <Text style={[styles.chipLabel, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

/** A `+` from two bars, sized to sit inside a door's label. */
export function Plus({ color }: { color: string }) {
  return (
    <View style={styles.plus}>
      <View style={[styles.plusBar, { backgroundColor: color }]} />
      <View style={[styles.plusBar, styles.plusBarUp, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexShrink: 0,
    height: DOOR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two - 2,
    /* TIGHTER ON THE MARK SIDE. A `+` is mostly air where a letter is mostly
       ink, so equal padding leaves the left visibly slacker than the right. Two
       points back is the optical correction, and it happens to pay for a third
       of what the mark costs in width. */
    paddingLeft: Spacing.two + 2,
    paddingRight: Spacing.three - 4,
    borderRadius: DOOR_HEIGHT / 2,
  },
  /* NO MARK, NO OPTICAL CORRECTION. The tighter left padding above exists to
     pay for the air inside a `+`; with the word alone it just parks the label
     off-centre in its own pill. */
  chipBare: { paddingLeft: Spacing.three - 4 },
  /* The `+`'s box. 9 against a 12pt label — a shade under the cap height, so it
     reads as punctuation to the word rather than as a second word. */
  plus: { width: PLUS_SIZE, height: PLUS_SIZE, alignItems: 'center', justifyContent: 'center' },
  /* Both bars are the same rule; one of them stood on its end. 1.5 because a
     stroke this short needs the weight to hold its own beside 12pt type. */
  plusBar: { position: 'absolute', width: PLUS_SIZE, height: 1.5, borderRadius: 0.75 },
  plusBarUp: { width: 1.5, height: PLUS_SIZE },
  /* 12/500. At 13/600 the label was the heaviest text on the screen below the
     object it serves — a button does not have to outweigh that. */
  chipLabel: { fontSize: 12, lineHeight: 15, fontWeight: '500' },
  pressed: { opacity: 0.6 },
});
