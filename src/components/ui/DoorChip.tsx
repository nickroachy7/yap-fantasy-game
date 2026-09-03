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
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Spacing } from "@/constants/theme";

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

/**
 * A `large` door, for a row where there is only ONE.
 *
 * The height above is set against a PAIR: two 32pt chips at the end of a
 * readout are plainly the biggest object on their row, and a door has to rank
 * below the thing the readout serves. That objection is about the pair, not
 * about the size — a single call to action under the card it belongs to is
 * allowed to be the loudest chip on a quiet band.
 *
 * So this is opt-in and stays rare. The collection's toolbar draws two and must
 * never take it; the lineup's rail draws one and does. If a second door ever
 * joins a large one, the pair goes back to `DOOR_HEIGHT` rather than both
 * growing.
 */
export const DOOR_HEIGHT_LARGE = 32;

/** The `+` ahead of a door's label. See `Plus`. */
const PLUS_SIZE = 9;

export function DoorChip({
  label,
  accessibilityLabel,
  onPress,
  fill,
  ink,
  lead,
  large = false,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  fill: string;
  ink: string;
  /** The mark before the word. Null draws the word alone — see `chipBare`. */
  lead: React.ReactNode;
  /** The only door on its row, and sized for it. See `DOOR_HEIGHT_LARGE`. */
  large?: boolean;
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
        large && styles.chipLarge,
        !lead && (large ? styles.chipBareLarge : styles.chipBare),
        { backgroundColor: fill },
        pressed && styles.pressed,
      ]}
    >
      {lead}
      <Text
        style={[
          styles.chipLabel,
          large && styles.chipLabelLarge,
          { color: ink },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A `+` from two bars, sized to sit inside a door's label. */
export function Plus({ color }: { color: string }) {
  return (
    <View style={styles.plus}>
      <View style={[styles.plusBar, { backgroundColor: color }]} />
      <View
        style={[styles.plusBar, styles.plusBarUp, { backgroundColor: color }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexShrink: 0,
    height: DOOR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two - 2,
    /* TIGHTER ON THE MARK SIDE. A `+` is mostly air where a letter is mostly
       ink, so equal padding leaves the left visibly slacker than the right. Two
       points back is the optical correction, and it happens to pay for a third
       of what the mark costs in width. */
    paddingLeft: Spacing.two + 2,
    paddingRight: Spacing.three - 4,
    borderRadius: DOOR_HEIGHT / 2,
  },
  /* Taller, and the horizontal padding grows with it — a 32pt pill on 28pt
     padding reads as a chip somebody stretched. The optical correction on the
     mark side survives the change because it is a subtraction from whatever
     the base padding is, not a number of its own. */
  chipLarge: {
    height: DOOR_HEIGHT_LARGE,
    paddingLeft: Spacing.two + 4,
    paddingRight: Spacing.three - 2,
    borderRadius: DOOR_HEIGHT_LARGE / 2,
  },
  /* NO MARK, NO OPTICAL CORRECTION. The tighter left padding above exists to
     pay for the air inside a `+`; with the word alone it just parks the label
     off-centre in its own pill. */
  chipBare: { paddingLeft: Spacing.three - 4 },
  /* The same correction against the large chip's own padding, so a labelled
     door that has dropped its mark is symmetric at either size. */
  chipBareLarge: { paddingLeft: Spacing.three - 2 },
  /* The `+`'s box. 9 against a 12pt label — a shade under the cap height, so it
     reads as punctuation to the word rather than as a second word. */
  plus: {
    width: PLUS_SIZE,
    height: PLUS_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Both bars are the same rule; one of them stood on its end. 1.5 because a
     stroke this short needs the weight to hold its own beside 12pt type. */
  plusBar: {
    position: "absolute",
    width: PLUS_SIZE,
    height: 1.5,
    borderRadius: 0.75,
  },
  plusBarUp: { width: 1.5, height: PLUS_SIZE },
  /* 12/500. At 13/600 the label was the heaviest text on the screen below the
     object it serves — a button does not have to outweigh that. */
  chipLabel: { fontSize: 12, lineHeight: 15, fontWeight: "500" },
  /* 13/600 — the weight the small chip refuses, for the reason above it: alone
     on its row this IS the screen's button, and at 12/500 a 32pt pill is mostly
     empty. */
  chipLabelLarge: { fontSize: 13, lineHeight: 16, fontWeight: "600" },
  pressed: { opacity: 0.6 },
});
