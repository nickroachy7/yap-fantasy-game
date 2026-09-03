/**
 * WHAT A ROW SAYS, UNDER EACH ORDER — and the one band that never changes.
 *
 * ===========================================================================
 * TWO SUBJECTS, TWO BANDS, AND ONLY ONE OF THEM MOVES
 * ===========================================================================
 *
 * A `PlayerRow` is two bands, and they are about two different things. The
 * identity band is about the FOOTBALLER: who he is, when he plays, where he
 * ranks, what he scores. The grey tray under it is about the CARD: how many
 * copies of him exist, at what tiers, and what the best one has done.
 *
 * The order owns the first and NOTHING owns the second. The tray is the
 * community's band, always, on every order and on the search takeover:
 *
 *     B 21   S 9   G 3   D 1              BEST CARD  812.4 FPTS
 *
 * That is a product claim as much as a layout one. What makes this a collecting
 * game rather than a stats site is that other people hold these cards, and
 * "where do I look for that" has to have one answer. A band that means the card
 * market under one order and a receiver's targets under another has no answer —
 * a reader glancing at `REC 6 · TGT 9` first has to remember which order they
 * are in to know what they are reading.
 *
 * THIS RESTORES A DECISION THIS ROW HAD ALREADY MADE. The tray held the stat
 * strip once and was deliberately changed to the ownership band, and the note
 * on `PlayerRow` still carries the argument: the row already tells you the
 * season, so receptions and targets underneath were "a second telling of the
 * same story", while "what is NOT anywhere else is the market". Making the tray
 * order-specific quietly reversed that. It should not have.
 *
 * ===========================================================================
 * SO THE ORDER GETS THE FIGURE AND ONE LINE
 * ===========================================================================
 *
 *     figure   ONE number: the quantity the board is ordered by
 *     detail   what that quantity is made of, or where it sits
 *
 * Two slots, and everything an order wants to say has to fit in them. That is a
 * real constraint and it is the good kind: it forced each order down to the one
 * or two facts that actually explain its ordering, where a whole spare band had
 * invited five.
 *
 *   MARKET RANK   500 COINS
 *                 RB #1 · OF 163
 *
 *     (the left column carries his overall market rank on every order, so this
 *     line is free to carry the positional one, which is the rank that fills a
 *     lineup slot)
 *
 *     THE RANK IS NOT ON THE RIGHT, and that is the newest rule here. The
 *     column at the LEFT of every row holds his market rank — on this order and
 *     on the other two, because it is a fact about him rather than about the
 *     page — so printing `#1` in the figure column put the same number on the
 *     row twice. Left is where a rank goes. Right is the VALUE behind it, which
 *     for a board ranked by the market is what the market says he is worth.
 *
 *     The two can disagree by a place or two and that is not a bug:
 *     `player_base_price` derives from the market's board but scales by
 *     position percentile, so a quarterback and a receiver ranked a place apart
 *     need not be priced a place apart. The ORDER is the market's football
 *     judgement, which has complete coverage; the number is what that judgement
 *     costs in the currency the game is actually played in.
 *
 *     The detail line keeps his position standing, because the pool is what
 *     makes a rank a fact: "RB1" is a different player at 1-of-163 than at
 *     1-of-30. `marketPosRank` is derived rather than read; see there.
 *
 *   TRENDING      +186 PLACES
 *                 RK #201→#15 · FP 8.2→24.6
 *
 *     The move, then where it landed him, then the two weeks that caused it —
 *     all on one line, because `+186` is ambiguous in the way that matters
 *     (300th to 114th and 201st to 15th are the same number and not the same
 *     news) and because a delta with no working is a claim.
 *
 *     THIS RETIRES AN APOLOGY. The old trend board was ordered by a delta it
 *     did not print, and said so in its own header: "a board ranked by a number
 *     it does not show cannot explain itself... being accepted rather than
 *     answered." It is answered.
 *
 *   SCORING · TOTAL      142.6 FP
 *                        GP 12 · FP/G 11.9
 *
 *   SCORING · PER GAME   11.9 FP/G
 *                        GP 12 · FP 142.6
 *
 *     ONE ORDER READ TWO WAYS, and the detail line is why it can be. A total is
 *     the numerator of something, so the denominator and the rate go beside it
 *     — 142.6 cannot then be mistaken for a good season by a man who played
 *     sixteen quiet games. Flip the reading and the same three facts rotate:
 *     the rate leads, the total supports, and games played stays put in both
 *     because a rate off two games is not a rate.
 *
 *     They were two menu entries until the switch beside the bar took over
 *     choosing between them. See `ORDERS`.
 *
 * AND THE PRICE IS NOT ON THE OTHER THREE. It used to ride under every figure —
 * a fact about the player over what a card of him is worth — which is the pair
 * the collection row draws and the right pair THERE, on a screen about copies
 * you hold. Here it made every row carry two answers when the reader had picked
 * one measure out of a menu to get a board about that measure. Sorting by the
 * market is how you ask what he costs; the other three are how you ask how he
 * plays, and they answer that and stop.
 *
 * WHAT WENT WITH THE SPARE BAND: the five-stat position line. It is on the
 * player's own screen, laid out with room to read, one tap from every row here
 * — which is the same argument that moved it off this row the first time.
 *
 * DASHES, NOT NOUGHTS, throughout. A player who has not been measured and one
 * measured at zero are different claims, and this app draws them differently
 * everywhere else.
 */
import { StyleSheet, Text, View } from 'react-native';

import type { Slate } from '@/components/scores/use-scores';
import type { Mover } from '@/components/trend/movers';
import { deltaText } from '@/components/trend/movers';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { variantOf, type BoardSort, type SortDir } from './board-view';
import type { RowFigure } from './PlayerRow';
import type { DirectoryPlayer } from './player-directory';

const DASH = '—';

/**
 * Everything the three slots need beyond the player himself.
 *
 * One object rather than five parameters, because the board builds a thousand
 * rows in a memo and every one of them wants the same four facts — and because
 * a new order needing a fifth should not re-punctuate three call sites.
 */
export type RowContext = {
  sort: BoardSort;
  /**
   * Needed only to name the unit: two of the three orders read the same measure
   * from either end and share a unit, so the pair is what identifies a reading.
   * See `variantOf`.
   */
  dir: SortDir;
  /** Live base price, or undefined until the second read lands. */
  coins?: number | null;
  /** His movement, for the trend order. Absent when unmeasured. */
  mover?: Mover | null;
  /** The two weeks the trend order is comparing, for naming them. */
  weeks?: { previous: Slate | null; recent: Slate | null };
  /* Resolved by the screen once. These are called per row inside a memo, so a
     hook here would be a hook in a loop. */
  positive: string;
  negative: string;
};

/* -------------------------------------------------------------------------- *
 * THE FIGURE
 * -------------------------------------------------------------------------- */

/**
 * The number at the right: ONE value, the one the board is ordered by.
 *
 * IT WAS TWO — the measure over a coin line — and collapsing it is the whole of
 * the note in the header above. The short version: the left column is the rank,
 * so a rank on the right was the same number twice; and a price under every
 * other measure was a second answer on a row the reader had narrowed to get
 * one.
 */
export function figureFor(player: DirectoryPlayer, ctx: RowContext): RowFigure {
  const label = variantOf(ctx.sort, ctx.dir).unit;

  switch (ctx.sort) {
    case 'market': {
      /* The caller's live price where it has landed, the cached snapshot until
         it does: `refresh-player-values` rewrites prices hourly, so a figure
         taken from the session's directory snapshot is quoting breakfast's
         number at lunch. See `useDirectoryBoard`. */
      const coins = ctx.coins ?? player.baseCoins;
      return { value: coins?.toLocaleString() ?? null, label };
    }
    case 'trend': {
      const delta = ctx.mover?.delta ?? null;
      return {
        /* PLACES GAINED, signed, formatted by the module that defines what the
           number means — see `deltaText`. `0` is possible and correct: he
           played both weeks and finished in the same place.

           Zero takes the POSITIVE colour rather than getting a third, neutral
           ink. A player who held his place did not fall, and a grey here would
           be a fourth colour on a row that already carries three. */
        value: delta == null ? null : deltaText(delta),
        label,
        color: delta == null ? undefined : delta < 0 ? ctx.negative : ctx.positive,
      };
    }
    case 'points':
      return {
        value: player.gamesPlayed > 0 ? player.seasonFp.toFixed(1) : null,
        label,
      };
    case 'perGame':
      return {
        /* Per-game off zero games is 0/0, not 0 — the classic rate-stat bug,
           and in preseason it would be every row on the board. */
        value: player.gamesPlayed > 0 ? player.fpPerGame.toFixed(1) : null,
        label,
      };
  }
}

/* -------------------------------------------------------------------------- *
 * THE DETAIL LINE
 * -------------------------------------------------------------------------- */

/** The row's third baseline: what the figure is made of, or where it sits. */
export function BoardDetail({
  player,
  ctx,
}: {
  player: DirectoryPlayer;
  ctx: RowContext;
}) {
  switch (ctx.sort) {
    case 'market':
      return (
        <>
          {/* HIS POSITION AND HIS PLACE IN IT, as two tokens rather than the
              fused `WR4` this row used to draw. Fused, the rank hides inside a
              label and the pool has nowhere to go; split, the pool can follow
              it — and the pool is what turns a rank into a fact. */}
          <Pair label={(player.position ?? '—').toUpperCase()} value={rankText(player.marketPosRank)} />
          <Pair label="OF" value={player.marketPosPool?.toLocaleString() ?? DASH} />
        </>
      );
    case 'trend':
      /* WHERE THE MOVE LANDED HIM, AND WHAT CAUSED IT, on one line — because
         the tray is the community's and this order has nowhere else to put its
         working. `+186` is the same number for 300th → 114th as for 201st →
         15th, and only one of those is worth a pack.
 
         NO SPACES AROUND THE ARROWS. Two pairs on one baseline is the tightest
         thing this line ever draws, and at 375pt the four spaces a padded arrow
         costs are the difference between fitting and ellipsising a rank. */
      return (
        <>
          <Pair
            label="RK"
            value={ctx.mover ? `#${ctx.mover.rankBefore}→#${ctx.mover.rankAfter}` : DASH}
          />
          <Pair
            label="FP"
            value={
              ctx.mover
                ? `${ctx.mover.before.toFixed(1)}→${ctx.mover.after.toFixed(1)}`
                : DASH
            }
          />
        </>
      );
    case 'points':
      return (
        <>
          <Pair label="GP" value={countText(player.gamesPlayed)} />
          <Pair
            label="FP/G"
            value={player.gamesPlayed > 0 ? player.fpPerGame.toFixed(1) : DASH}
          />
        </>
      );
    case 'perGame':
      return (
        <>
          <Pair label="GP" value={countText(player.gamesPlayed)} />
          <Pair
            label="FP"
            value={player.gamesPlayed > 0 ? player.seasonFp.toFixed(1) : DASH}
          />
        </>
      );
  }
}

/* -------------------------------------------------------------------------- *
 * Parts
 * -------------------------------------------------------------------------- */

const rankText = (n: number | null) => (n === null ? DASH : `#${n}`);
const countText = (n: number) => (n > 0 ? n.toLocaleString() : DASH);

/**
 * A heading and its number, read across rather than stacked.
 *
 * The same construction the tier histogram uses one tray over, and for the same
 * reason its note gives: `B 21` is one fact, not a heading and a figure, and
 * stacking makes a row of small numbers look like a table of different things.
 */
function Pair({ label, value }: { label: string; value: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.pair}>
      <Text numberOfLines={1} style={[Type.micro, styles.unit, { color: c.textTertiary }]}>
        {label}
      </Text>
      <Text numberOfLines={1} style={[styles.meta, NUMERIC, { color: c.textSecondary }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Label and value tight together, so the pairs separate from each other by
     more than their own halves do. */
  pair: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },
  /* Never shrinks: a unit clipped to `FPT…` is worse than a name clipped by a
     character, and these name the figure beside them. */
  unit: { flexShrink: 0, lineHeight: 16 },
  /* Matches the weight the rank line has always drawn at, so swapping what is
     on that baseline does not change how heavy the row looks. */
  meta: { fontSize: 12, lineHeight: 15, fontWeight: '600' },
});
