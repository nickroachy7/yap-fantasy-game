/**
 * HOW TO PLAY — the rules, presented over the app.
 *
 * ---------------------------------------------------------------------------
 * IT IS A SHEET, AND IT IS THE MASTHEAD'S TRAILING SLOT
 * ---------------------------------------------------------------------------
 *
 * The slot at the right of the masthead held the settings gear, and it holds
 * the door to this instead — see `AppHeader` for why that trade is safe, which
 * is entirely about Settings having its own tab on the profile and this having
 * nowhere at all.
 *
 * Reading the rules is the definition of something you open over what you were
 * doing, read, and put down: it never wants to be the thing behind another
 * screen, it has no state to come back to, and a player who goes looking for it
 * is mid-decision on the page they left. So it takes `sheetOptions` — the same
 * presentation as a player profile, a set checklist and packs — rather than a
 * fifth arrangement invented for it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS NOT, YET
 * ---------------------------------------------------------------------------
 *
 * THE PROSE IS A FIRST PASS AND IS MARKED AS ONE. It was written to give the
 * screen its shape — how many sections a phone holds before it becomes a wall,
 * where the numbers go, what a reader needs before their first pack — and not
 * as the final word on any rule in it. Two things follow from that and are
 * worth stating so nobody has to guess later:
 *
 *   NUMBERS ARE NAMED ONCE AND ONLY WHERE THEY ARE THE POINT. The tier ladder's
 *   50/200/600 and the roster cap are here because a player cannot plan without
 *   them. Pack prices, reward ladders and contest fees are NOT, because they
 *   are the numbers most likely to move — and a rules page that disagrees with
 *   the shop is worse than one that never mentioned it. Anything priced is
 *   described by its shape and priced on the screen that charges for it.
 *
 *   IT DOES NOT READ THE PLAYER'S STATE. No hooks, no queries, no `usePlayer`.
 *   It is the same page for somebody who has never opened a pack and somebody
 *   three weeks into a run, which is what makes it safe to reach from anywhere
 *   including a cold deep link. If it ever wants "you have 3 hearts" it should
 *   get its own section rather than threading state through the prose.
 *
 * ---------------------------------------------------------------------------
 * THE SHAPE: FIVE STEPS, THEN THE TWO THINGS THAT KILL A RUN
 * ---------------------------------------------------------------------------
 *
 * The steps are the loop in the order a new player meets it — cards, lineup,
 * contest, scoring, tiers — each one sentence of what it is and one of what it
 * costs. The two notes under them are the rules that are surprising rather than
 * sequential: a heart is spent whether you win or lose, and a committed card is
 * gone. Those are where a player who skipped the rules gets hurt, so they are
 * separated from the walkthrough rather than buried as step six.
 *
 * NUMBERED MARKS RATHER THAN BULLETS, because the steps are genuinely ordered
 * and a bullet says they are not. The numeral sits in the app's own gold on a
 * washed disc — the same treatment a tier badge gets — so the column of them
 * reads as a ladder down the page.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PlayerSheetFrame, SheetToneBand } from '@/components/players/PlayerSheetFrame';
import { Colors, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The walkthrough. One object per step so the list cannot drift out of order
 * and the numeral is derived rather than typed — a hand-numbered list is a list
 * with two 4s in it the first time somebody inserts a step.
 */
const STEPS: { title: string; body: string }[] = [
  {
    title: 'Open packs to get cards',
    body: 'Every card is one real NFL player, and you can hold thirty of them at a time. Packs are bought with coins; your first one is free.',
  },
  {
    title: 'Fill a lineup',
    body: 'Eight slots — a quarterback, running backs, receivers, a tight end, a kicker and a flex. Only cards you own can start.',
  },
  {
    title: 'Enter a contest',
    body: 'A contest takes your lineup for one week. Most cost a heart, some cost coins as well, and the prize pool is split among whoever finishes on top.',
  },
  {
    title: 'Score the week',
    body: 'Your players score fantasy points from their real Sunday — the same PPR scoring the rest of the sport uses. Points land as the games do.',
  },
  {
    title: 'Climb the tiers',
    body: 'Every card starts at bronze. Fantasy points earned while starting move it up: 50 to silver, 200 to gold, 600 to diamond. A higher tier is worth more and scores more.',
  },
];

/** The rules that are surprising rather than sequential. See the header. */
const WARNINGS: { title: string; body: string }[] = [
  {
    title: 'A heart is spent, not returned',
    body: 'Entering costs the heart whether you win or lose. Run out and the run is over — you keep your cards, but the week stops until a new run starts.',
  },
  {
    title: 'Committing a card burns it',
    body: 'Sets pay out for completing a checklist, and the cards you commit are gone from your collection for good. Selling gives coins back; committing does not.',
  },
];

export default function HowToPlay() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;
  const router = useRouter();

  /* THE SAME GUARD EVERY PRESENTED ROUTE IN THIS APP CARRIES. `back()` on a
     cold arrival — a deep link, a refreshed browser tab — has nothing to go
     back to and leaves the sheet stuck; `dismissTo` names where it lands. */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/compete');
  }, [router]);

  return (
    <PlayerSheetFrame
      title="How to play"
      tone={gold}
      onClose={close}
      closeLabel="Close how to play">
      {/* The masthead's own gold, for the reason the packs sheet takes it: the
          band names what the sheet is about, and this one is about the game
          every gold mark in the app belongs to. */}
      <SheetToneBand tone={gold}>
        <View style={styles.hero}>
          <Text style={[Type.page, { color: c.text }]}>How to play</Text>
          <Text style={[Type.body, styles.measure, { color: c.textTertiary }]}>
            Collect NFL players as cards, start eight of them each week, and enter contests
            against other managers. Your cards get better the more they score.
          </Text>
        </View>
      </SheetToneBand>

      <View style={styles.body}>
        {STEPS.map((step, i) => (
          <View key={step.title} style={styles.step}>
            {/* Derived, never typed. See `STEPS`. */}
            <View style={[styles.mark, { backgroundColor: c.surface }]}>
              <Text style={[Type.strong, { color: gold }]}>{i + 1}</Text>
            </View>
            <View style={styles.stepText}>
              <Text style={[Type.section, { color: c.text }]}>{step.title}</Text>
              <Text style={[Type.body, { color: c.textTertiary }]}>{step.body}</Text>
            </View>
          </View>
        ))}

        {/* NO HEADING OVER THE PAIR, deliberately. "Watch out" or "Important"
            above two cards that are already visually separated from the steps
            is a label saying what the reader can see — and it would be the only
            section head on a page that otherwise runs as one list. */}
        <View style={styles.warnings}>
          {WARNINGS.map((w) => (
            <View key={w.title} style={[styles.warning, { backgroundColor: c.surface }]}>
              <Text style={[Type.strong, { color: c.text }]}>{w.title}</Text>
              <Text style={[Type.body, { color: c.textTertiary }]}>{w.body}</Text>
            </View>
          ))}
        </View>
      </View>
    </PlayerSheetFrame>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.two },
  /* A line length rather than the full width. Prose set to the edge of a phone
     is the one thing on this page that would make it look unread. */
  measure: { maxWidth: 420 },
  body: { paddingTop: Spacing.four, gap: Spacing.four },
  step: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  /* 28 rather than the app's 32pt `ControlDiameter`: this is a mark, not a
     button, and at 32 a column of five outweighs the headings beside them. */
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  /* `flex: 1` and NOT `flex` shorthand — the shorthand pins `flexBasis` to 0%,
     which collapses a text column beside a fixed mark. */
  stepText: { flex: 1, gap: Spacing.one },
  warnings: { gap: Spacing.two },
  warning: { padding: Spacing.three, borderRadius: Radius.panel, gap: Spacing.one },
});
