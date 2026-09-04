/**
 * The contests sheet's header: a title and the week, and nothing else.
 *
 * ---------------------------------------------------------------------------
 * IT STOPPED BEING THE SET CHECKLIST'S HERO
 * ---------------------------------------------------------------------------
 *
 * It was built as that hero pointed at a run — a title, a rack, the record at
 * page size, the rule in full, a progress bar, and the carry ladder as four
 * rows. On the set sheet that shape is right, because the set IS the page. A
 * lobby is not: you come here to ENTER something, the contests are the page,
 * and the run was only the context you priced them against. Measured off the
 * real sheet, the header and its tab bar ran to 348pt of an 874pt screen —
 * forty per cent — so the first contest sat below the fold on every visit.
 *
 * That cut it to two lines. Removing hearts cut it again, to one and a label:
 *
 *     Contests
 *     Week 1
 *
 * ---------------------------------------------------------------------------
 * WHAT LEFT, AND WHY THE FILE IS STILL HERE
 * ---------------------------------------------------------------------------
 *
 * Everything this header said was about the run: a rack of hearts riding, the
 * count still free in the masthead's pill, the record on the title, and a
 * sentence doing the arithmetic on how close the run was to being wiped. The
 * mechanic is gone and all four went with it.
 *
 * What is left is a title and a week, which is little enough that folding it
 * back into `LobbyView` is tempting. It stays a component because the sheet's
 * band geometry is not: `SheetToneBand` paints a plane that reaches over the
 * grabber and 900pt into the overscroll, and `band`'s padding is measured
 * against it. That pairing is the thing worth keeping in one named place.
 *
 * ---------------------------------------------------------------------------
 * NO WASH. THE BAND IS PAINTED BY `SheetToneBand`
 * ---------------------------------------------------------------------------
 *
 * It wore `Brand.lime`, and at `TONE_PEAK` 0.26 over #101010 that resolves to
 * about rgb(64,76,28) — a dark olive. A brand hue at 26% is not read as brand;
 * at that weight it reads as a STATE, and olive is not one anybody wants to be
 * told they are in. `backgroundElement` does the job on the dark scale alone.
 *
 * The plane is painted by `SheetToneBand`, not here: it reaches up over the
 * floating grabber and 900pt into the overscroll, so neither a seam at the top
 * nor a hard flick back to it can show the sheet's colour above the band.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function LobbyHero({ week }: { week?: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.band}>
      <View style={styles.titleRow}>
        <Text style={[Type.page, { color: c.text }]}>Contests</Text>
        <View style={styles.spacer} />
      </View>

      {week ? <Text style={[Type.body, { color: c.textTertiary }]}>{week}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* No plane of its own: `SheetToneBand` paints it and owns the geometry that
     makes it reach. A background or a negative margin here would double the
     escape and hang the fill 16pt off each edge of the screen. */
  band: { paddingTop: Spacing.two, paddingBottom: Spacing.two + 2, gap: Spacing.half },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  /* Holds the title's row open to the full width so the band's height does not
     depend on what sits beside the title. Nothing does today; the row kept its
     shape because this header has gained and lost trailing marks twice. */
  spacer: { flex: 1 },
});
