/**
 * One entry on any of the six boards, drawn as the lineup screen draws a card.
 *
 * WHY THE TABLE WENT
 *
 * Every board used to be a column table: a rank, a name, and three or four
 * right-aligned numerics under 9pt headers, with half the columns dropped on a
 * phone because they would not fit. That is the right shape for a spreadsheet
 * and the wrong one for this app, and the lineup screen already proved it —
 * `LineupRow`'s note records the same table being abandoned there for the same
 * reason. At 375pt a five-column row squeezes the NAME, which is the one thing
 * a reader is actually scanning for, and the columns it protects instead are
 * abbreviations nobody can expand without a legend.
 *
 * So this borrows that row wholesale: a fixed lead column, identity in three
 * lines, one
 * figure on the right, a hairline inset to the gutter, and nothing boxed.
 * Numbers that used to be columns are value/unit pairs on line three — `31 GS`,
 * `84.3 PER START` — set the way the lineup row sets `0.0 TFP`, with the figure
 * carrying and the unit in 9pt caps behind it. Nothing is dropped on a narrow
 * screen any more, because nothing is competing for width: the lines stack.
 *
 * The type scale, the line heights, the 62pt box, the 64pt right column and the
 * inset rule are all LineupRow's, deliberately and to the point. A card on the
 * bench and a card on the leaderboard are the same object; two different row
 * designs for it would be two designs to keep in step.
 *
 * THE RANK COLUMN IS THE LINEUP ROW'S BADGE COLUMN
 *
 * Same 40pt, same place, same job: it is the fixed left edge every name on the
 * page starts against. What it holds is a NUMBER rather than a position — there
 * is no position to announce, since five of the six boards rank managers, and
 * on the one that ranks cards the position follows the name in its own accent
 * exactly as it does on a lineup row.
 *
 * It is not a badge: no box, no fill, no border. A boxed rank would read as the
 * `BN` chip and imply a category where there is only an ordinal.
 *
 * The rank sat INLINE on line one for a while, first at 13pt and then at 15,
 * and neither worked. A rank is about the ROW, not about the name — so it
 * belongs beside all three lines rather than in front of one of them — and
 * inline it pushed the name right by a variable amount, because 1, 10 and 100
 * are different widths. A fixed column is what stops the page twitching as you
 * scan it, and it is exactly why the badge column is a fixed 40 next door.
 *
 * MOVEMENT SITS UNDER THE RANK, for the same reason it used to sit beside it:
 * the two answer one question — where they are, and which way they got there.
 * Stacked in the column they read as one mark and cost the name nothing.
 *
 * WHAT THE THREE LINES ARE FOR, ON EVERY BOARD
 *
 *   1. WHO. Rank, name, and — on the cards board — the position and club.
 *   2. THE HEADLINE'S CONTEXT. The one sentence that qualifies the figure on
 *      the right: which week a best week was, who holds a card.
 *   3. THE REST OF THE NUMBERS. What used to be the dropped columns.
 *
 * LINE 2 IS DROPPED ENTIRELY BY A BOARD THAT PASSES `''`, and the row gets
 * shorter rather than keeping an empty line. It was kept — the box held its
 * height so the rows stayed a column — and the collection board showed what
 * that costs: `No card above silver yet` on every row in the game, a sentence
 * whose only content was that it had none. A board with nothing to say on line
 * 2 should say nothing and take up no room saying it. The rows still form a
 * column, because a board's rows are all the same shape as each other; it is
 * only ACROSS boards that the height now varies, and no screen shows two.
 */
import type { ReactNode } from 'react';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TierMark } from '@/components/cards/TierMark';
import { Coin } from '@/components/shell/AppHeader';
import { TeamLogo } from '@/components/shell/TeamLogo';
import { Colors, NUMERIC, selectionAccent, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MovementMark } from './Movement';
import type { BoardRowModel } from './community';

/**
 * Three lines — 20 for the name, 15 and 15 for the two under it — plus the two
 * 2pt gaps, in a box with 4pt of air top and bottom. `LINEUP_ROW_HEIGHT`'s
 * arithmetic exactly, because it is the same row.
 */
/**
 * 20 for the name, 15 for the detail line, one 2pt gap, 4pt of air top and
 * bottom.
 *
 * ONE HEIGHT, ON EVERY BOARD. It was two — three-line rows on four boards and
 * two-line rows on the roster board — and the difference was the sentence that
 * used to sit between the name and the numbers. Six boards each wrote that
 * sentence differently: `Beat the median in 0 of 2 graded weeks` restated the
 * W-L-T under it, `No card above silver yet` said nothing at all, and switching
 * boards changed the row's height and rhythm for no reason a reader could name.
 *
 * A constant rather than an intrinsic height because the lists measure rows
 * without rendering them — `getItemLayout` is what lets the pinned row jump to
 * row four hundred — and a row that sizes itself cannot be measured in advance.
 */
export const BOARD_ROW_HEIGHT = 45;

/** The page's own heading inset, as on the lineup board. */
export const GUTTER = Spacing.three;

/**
 * The lead column, at the lineup row's `BADGE_WIDTH` exactly.
 *
 * Matched rather than measured: the two screens are read one after the other,
 * and a name that starts at a different x on each would be the sort of drift
 * that is invisible in one screenshot and obvious in the app.
 */
export const RANK_COL = 40;

/** Set by the widest label the column holds, as on the lineup row. */
export const RIGHT_WIDTH = 64;

export const COL_GAP = Spacing.two;

/**
 * The logo column, and the reason the name on a board no longer starts at the
 * same x as the name on the lineup.
 *
 * That alignment was deliberate — `RANK_COL` is matched to the lineup row's
 * badge width for exactly that reason — and this breaks it knowingly. A board
 * is the one screen in the app that is a list of PEOPLE, and the argument for
 * the logo being there at all is that a manager should be recognisable on the
 * board they are ranked in without reading. That cannot be had without the
 * column.
 *
 * 26 against a 45pt row: big enough to read a mark at a glance, small enough
 * that it does not compete with the rank numeral beside it, which is still the
 * thing the row is about.
 */
export const LOGO_COL = 26;

export function BoardRow({
  row,
  isMe,
  /** Reads the headline out after the name — "148.2 points". */
  unit,
  expanded,
  onToggle,
  onPress,
  pressHint,
  onOpenProfile,
  profileOn = 'name',
  rule = true,
  children,
}: {
  row: BoardRowModel;
  isMe: boolean;
  unit: string;
  /** Only the points board expands, into its week-by-week breakdown. */
  expanded?: boolean;
  onToggle?: () => void;
  /**
   * A press that is NOT an expansion — the copy of your row inside `BoardTop`
   * uses it to scroll the list to where you actually are.
   *
   * Separate from `onToggle` rather than sharing it, because the two say
   * different things to a screen reader: one reveals a breakdown in place, the
   * other moves the page. Overloading one prop would have announced "shows
   * this player's week by week scores" on a control that does nothing of the
   * kind.
   */
  onPress?: () => void;
  /** What `onPress` does, for the reader who cannot see the list move. */
  pressHint?: string;
  /**
   * Open the manager this row is about.
   *
   * A LINK ON ONE LINE, not a press on the row. Two of the six boards already
   * spend the row's own press on something else — the points board expands into
   * a week-by-week breakdown, the pinned copy of your row jumps the list — so a
   * profile could not be the row's press everywhere, and a name that is a door
   * on four boards and not on the other two is worse than a name that is always
   * a door.
   *
   * `accessibilityRole="link"`, and that is load-bearing rather than pedantry:
   * `link` is the one interactive role react-native-web does NOT render as a
   * real `<button>`, so this can sit inside the row's own pressable without
   * being a `<button>` in a `<button>` — the nesting React rejects at runtime,
   * documented on `SwapSheet`, `DropdownChip` and `PlayerSheetFrame`.
   */
  onOpenProfile?: () => void;
  /**
   * WHICH TEXT CARRIES THE LINK, because the manager is not always the name.
   *
   * On five boards line 1 IS the manager. On the cards board line 1 is the
   * footballer and the manager is the phrase that ends line 2 — "Held by dmb" —
   * so the link belongs there instead. Linking the name on that board would
   * take a reader who tapped a player's name to somebody's account, which is
   * the wrong page for the word they pressed.
   *
   * It used to be `'secondary'`, naming the sentence line that every board has
   * now dropped. The phrase moved to the `note` slot at the end of the detail
   * line and the link moved with it.
   */
  profileOn?: 'name' | 'note';
  /**
   * False for a row that is the last thing inside a frame. The rule is the
   * divider between this row and the next one, and against the bottom edge of
   * `BoardTop`'s frame it doubles with the border a hairline above it.
   */
  rule?: boolean;
  children?: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const [pressed, setPressed] = useState(false);
  /* One handler, whichever prop supplied it. A row never has both: the list
     expands, the pinned copy jumps. */
  const press = onToggle ?? onPress;

  const summary = [
    `Rank ${row.rank}`,
    row.name,
    row.accentToken?.text,
    `${row.figure} ${unit}`,
    row.detail.map((p) => [p.value, p.unit?.toLowerCase()].filter(Boolean).join(' ')).join(', '),
    row.note,
    isMe ? 'your row' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const body = (
    <View style={styles.content}>
      {/* The lead column: where a lineup row puts its slot badge. */}
      <View style={styles.rankCol}>
        <Text style={[styles.rank, NUMERIC, { color: c.text }]}>{row.rank}</Text>
        {row.movement ? (
          <MovementMark movement={row.movement.places} known={row.movement.known} />
        ) : null}
      </View>

      {/* ONLY WHERE LINE 1 IS A MANAGER.

          `row.userId` is set on every board, including the cards board — where
          it is the HOLDER of the card and line 1 is the footballer. Drawing it
          there would put a manager's picture beside a player's name, which is
          the same mistake `profileOn` exists to prevent for the link. So it
          reuses that signal rather than inventing a second one: the board that
          says the name is not the manager gets no logo. */}
      {profileOn === 'name' ? (
        <View style={styles.logoCol}>
          <TeamLogo userId={row.userId} name={row.name} size={LOGO_COL} />
        </View>
      ) : null}

      <View style={styles.lines}>
        <View style={styles.nameLine}>
          {onOpenProfile && profileOn === 'name' ? (
            <Pressable
              onPress={onOpenProfile}
              accessibilityRole="link"
              accessibilityLabel={row.name}
              accessibilityHint="Opens this manager's profile"
              hitSlop={6}
              style={({ pressed }) => [styles.nameLink, pressed && styles.linkPressed]}>
              <Text numberOfLines={1} style={[styles.name, { color: c.text }]}>
                {row.name}
              </Text>
            </Pressable>
          ) : (
            <Text numberOfLines={1} style={[styles.name, { color: c.text }]}>
              {row.name}
            </Text>
          )}
          {row.accentToken ? (
            <Text numberOfLines={1} style={[styles.meta, { color: row.accentToken.color }]}>
              {row.accentToken.text}
            </Text>
          ) : null}
          {row.mutedToken ? (
            <Text numberOfLines={1} style={[styles.meta, { color: c.textTertiary }]}>
              {row.mutedToken}
            </Text>
          ) : null}
          {/* A word as well as a tint: the tint alone is a colour-only cue. */}
          {isMe ? <Text style={[Type.micro, styles.you, { color: c.textSecondary }]}>YOU</Text> : null}
        </View>

        {/* The value/unit strip. Each figure reads at body weight in the
            secondary ink with its unit in 9pt caps beside it — the lineup row's
            `0.0 TFP` exactly.
   
            THE GROUPS ARE SEPARATED BY A MIDDOT, and they were separated by a
            wider gap: 4pt inside a pair against 8pt between them, on the
            argument that spacing alone would make them read as groups "without
            a separator character doing the work". Four points of difference is
            not enough at 11pt, and `0.0 AVG 2 WEEKS` ran together into one
            string of five tokens with no structure in it. The dot is tertiary
            and is what makes the line scan as `0.0 AVG · 2 WEEKS`. */}
        <View style={styles.detailLine}>
          {row.tier ? <TierMark tier={row.tier} /> : null}
          {row.coin ? <Coin size={9} color={selectionAccent(scheme)} /> : null}
          {row.detail.map((p, i) => (
            <Fragment key={p.key}>
              {i > 0 ? (
                <Text style={[styles.value, styles.sep, { color: c.textTertiary }]}>·</Text>
              ) : null}
              <Text
                numberOfLines={1}
                style={[styles.value, NUMERIC, { color: p.accent ?? c.textSecondary }]}>
                {p.value}
              </Text>
              {p.unit ? (
                <Text numberOfLines={1} style={[Type.micro, styles.unit, { color: c.textTertiary }]}>
                  {p.unit}
                </Text>
              ) : null}
            </Fragment>
          ))}
          {/* The tail phrase gets the same separator, so the line has one
              rhythm rather than a dot between figures and a bare gap before a
              word. */}
          {row.note && row.detail.length > 0 ? (
            <Text style={[styles.value, styles.sep, { color: c.textTertiary }]}>·</Text>
          ) : null}
          {row.note ? (
            onOpenProfile && profileOn === 'note' ? (
              /* `link`, not `button`: react-native-web renders a button role as
                 a real <button>, and this one sits inside the row's own
                 pressable. See the note on `onOpenProfile`. */
              <Pressable
                onPress={onOpenProfile}
                accessibilityRole="link"
                accessibilityLabel={row.note}
                accessibilityHint="Opens this manager's profile"
                hitSlop={6}
                style={({ pressed }) => [styles.noteLink, pressed && styles.linkPressed]}>
                <Text
                  numberOfLines={1}
                  style={[styles.value, styles.note, { color: c.textTertiary }]}>
                  {row.note}
                </Text>
              </Pressable>
            ) : (
              <Text numberOfLines={1} style={[styles.value, styles.note, { color: c.textTertiary }]}>
                {row.note}
              </Text>
            )
          ) : null}
        </View>
      </View>

      {/* The figure over its unit. The label is what stops a bare number being
          a second unlabelled quantity in the same glance — the lineup row's
          `PROJ —` earns its keep the same way. */}
      <View style={styles.right}>
        <Text numberOfLines={1} style={[styles.figure, NUMERIC, { color: c.text }]}>
          {row.figure}
        </Text>
        <Text numberOfLines={1} style={[Type.micro, styles.figureLabel, { color: c.textTertiary }]}>
          {row.figureLabel}
        </Text>
      </View>
    </View>
  );

  return (
    <View
      style={{
        backgroundColor: isMe ? c.backgroundMine : c.background,
      }}>
      {press ? (
        <Pressable
          onPress={press}
          accessibilityRole="button"
          accessibilityLabel={summary}
          accessibilityHint={
            onToggle ? "Shows this player's week by week scores" : pressHint
          }
          accessibilityState={onToggle ? { expanded: Boolean(expanded) } : undefined}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          style={[styles.row, pressed && { backgroundColor: c.backgroundElement }]}>
          {body}
          {rule ? <View style={[styles.rule, { backgroundColor: c.border }]} /> : null}
        </Pressable>
      ) : (
        <View accessible accessibilityRole="text" accessibilityLabel={summary} style={styles.row}>
          {body}
          {rule ? <View style={[styles.rule, { backgroundColor: c.border }]} /> : null}
        </View>
      )}
      {expanded ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* The rule is a child, so the row's own height is exactly the content box
     and the hairline sits inside it rather than adding half a point to it. */
  row: { height: BOARD_ROW_HEIGHT, justifyContent: 'center' },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: COL_GAP,
    paddingHorizontal: GUTTER,
  },
  lines: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one + 2, minWidth: 0 },
  /* Centred against all three lines rather than pinned to the first: the rank
     is about the ROW, exactly as the lineup row's badge is. */
  rankCol: { width: RANK_COL, alignSelf: 'center', alignItems: 'center', gap: 2 },
  /* Centred against the whole row for the same reason the rank is: it is about
     the row, not about line 1. */
  logoCol: { alignSelf: 'center' },
  /* Full ink and figure weight. It is the second thing read after the name and
     the first thing scanned when hunting a position on the board, so it carries
     like a figure rather than sitting back like a label. */
  rank: { fontSize: 15, lineHeight: 19, fontWeight: '800', letterSpacing: -0.3 },
  name: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
    minWidth: 0,
  },
  /* `flexShrink: 0`, as on the lineup row: these are two- and three-character
     tokens beside a name that may be twenty, and left to shrink with it they
     collapse to noise. The NAME is the only thing on the line allowed to give
     way. */
  meta: { fontSize: 11, lineHeight: 15, fontWeight: '500', flexShrink: 0 },
  you: { flexShrink: 0 },
  /* The link is a wrapper around the name, so it inherits the name's own right
     to give way and adds nothing to the line's height. */
  nameLink: { flexShrink: 1, minWidth: 0 },
  linkPressed: { opacity: 0.6 },
  /* Wraps the note so the link adds nothing to the line's height, exactly as
     `nameLink` wraps the name. */
  noteLink: { flexShrink: 1, minWidth: 0 },
  detailLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    /* One gap everywhere on the line: 4pt between a figure and its unit, and
       4pt either side of the separator. The rhythm is carried by the dot now,
       not by two different gaps — see the note above. */
    gap: Spacing.one,
    minWidth: 0,
    height: 15,
    /* IT STOPS AT THE FIGURE COLUMN, and that is a fix rather than a
       restriction. This line used to bleed out under the right column on a
       negative margin, justified as "nothing is drawn opposite this line" —
       true while the row was three lines tall and the figure and its unit sat
       opposite lines 1 and 2. The row is two lines now, so the detail line is
       level with the unit label, and the bleed put `Leading by 33` straight
       through `RUNGS`.
   
       What it costs is width: the line gives up about 72pt and its tail phrase
       ellipsises earlier. `note` is the only thing on it allowed to shrink, so
       the figures are never the part that goes. */
  },
  /* A figure on the detail line. Body weight, so it carries; the unit beside
     it is 9pt caps and does not. */
  value: { fontSize: 11, lineHeight: 15, fontWeight: '600', flexShrink: 0 },
  /* Never shrinks and never wider than the word: it is the unit on the figure
     before it, not a column of its own. */
  unit: { flexShrink: 0, lineHeight: 15 },
  /* Never shrinks: a separator that gave way would let two groups collide back
     into the string the dot exists to break up. */
  sep: { flexShrink: 0, fontWeight: '400' },
  /* The tail phrase, and the only thing on the line allowed to give way — the
     figures before it are fixed-length and this is not. */
  note: { flexShrink: 1, minWidth: 0, fontWeight: '500' },
  /* Centred against the whole row rather than pinned to its top: the figure and
     its label are a pair, not two rows of a table. */
  right: { width: RIGHT_WIDTH, alignSelf: 'center', alignItems: 'flex-end', gap: 2 },
  /* 15, not 17 — one step above the type around it is enough to lead. Two would
     make it compete with the name, which is what the eye is actually hunting. */
  figure: { fontSize: 15, lineHeight: 19, fontWeight: '800', letterSpacing: -0.3 },
  figureLabel: { lineHeight: 15 },
  rule: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});
