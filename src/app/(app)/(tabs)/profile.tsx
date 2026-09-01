import { Link, useLocalSearchParams } from 'expo-router';

import { Icon } from '@/components/icons/Icon';
import { cardBadge, runCashout, runCleared, runStreak } from '@/components/icons/glyphs';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CoinLedger, type LedgerEntry } from '@/components/account/CoinLedger';
import { StatStrip, type StatItem } from '@/components/account/StatStrip';
import { TierBreakdown } from '@/components/account/TierBreakdown';
import { Coin, initialsOf } from '@/components/shell/AppHeader';
import { Screen } from '@/components/shell/Screen';
import { DASH, DataTable, type Column } from '@/components/ui/DataTable';
import { Panel } from '@/components/ui/Panel';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import {
  Colors,
  NUMERIC,
  Spacing,
  TierColors,
  TierOrder,
  Type,
  type CardTier,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { fetchAllPages } from '@/lib/paged';
import { supabase } from '@/lib/supabase';

const MIN_NAME = 2;
const MAX_NAME = 24;

/** Only used if `current_slate()` returns nothing — same fallback as the board. */
const FALLBACK_SEASON = 2026;

/**
 * The ledger grows without bound: a weekly grant plus a row per pack, forever.
 * It will pass PostgREST's silent 1000-row cap, so it has to be handled — and
 * this one is CAPPED rather than paged with fetchAllPages, because the panel is
 * recent activity and nobody wants their third season of weekly grants drawn on
 * an account screen. The panel hint states the cap, so the list is visibly
 * partial instead of quietly wrong.
 */
const LEDGER_LIMIT = 100;

/**
 * There is no "my rank" RPC and we are not adding one, so rank means finding
 * ourselves in the top of the board. Past this depth the tile shows a dash
 * rather than a number we cannot stand behind.
 */
const RANK_DEPTH = 250;

type Slate = { season: number; season_type: number; week: number };
type LedgerRow = { id: string; amount: number; reason: string; created_at: string };
type WeekRow = { week: number; total_points: number; scored_at: string | null };
type OwnedRow = { tier: CardTier | null; career_fp: number | null; lineup_starts: number | null };

type TabKey = 'overview' | 'activity' | 'settings';

/** The enum values are terse; players should not have to read snake_case. */
const REASON_LABEL: Record<string, string> = {
  signup_bonus: 'Welcome bonus',
  weekly_grant: 'Weekly allowance',
  weekly_score_reward: 'Weekly score reward',
  pack_purchase: 'Pack opened',
  admin_adjust: 'Adjustment',
};

export default function ProfileScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;

  const { session, signOut } = useAuth();
  const { coins, displayName, cardCount, refresh } = usePlayer();

  /* The masthead's gear deep-links straight here — see `AppHeader`, whose
     trailing slot points at `/profile?tab=settings`. Seeded from the param
     rather than driven by it: the param names where you ARRIVE, and the
     segmented control owns the tab from then on. Driving it would mean every
     tap had to write the URL back, which buys nothing on a screen nobody
     deep-links into twice. */
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<TabKey>(
    params.tab === 'activity' || params.tab === 'settings' ? params.tab : 'overview',
  );
  const [slate, setSlate] = useState<Slate | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [weeks, setWeeks] = useState<WeekRow[] | null>(null);
  const [owned, setOwned] = useState<OwnedRow[] | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  /** Non-null only when the board came back short of RANK_DEPTH, i.e. entire. */
  const [rankPool, setRankPool] = useState<number | null>(null);

  const [name, setName] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /* The field mirrors the loaded name, which arrives a moment after the first
     render and changes again after a save. Adjusting it here rather than from
     an effect is React's own answer to "reset state when a prop changes": the
     reset lands in the render that noticed, instead of a second commit after
     the field has already drawn the old value. */
  const [mirrored, setMirrored] = useState(displayName);
  if (mirrored !== displayName) {
    setMirrored(displayName);
    setName(displayName);
  }

  const userId = session?.user.id;

  const load = useCallback<Load>(async (live) => {
    // Follow the slate actually being played rather than assuming the regular
    // season — during the preseason validation window a hardcoded season_type
    // renders every number here as zero, which reads as a broken account.
    const slateRes = await supabase.rpc('current_slate');
    if (!live()) return;
    if (slateRes.error) return slateRes.error.message;
    const current = slateRes.data?.[0] ?? null;
    const season = current?.season ?? FALLBACK_SEASON;
    const seasonType = current?.season_type ?? 2;

    try {
      const [ledgerRes, weekRes, boardRes, collection] = await Promise.all([
        supabase
          .from('coins_ledger')
          .select('id, amount, reason, created_at')
          // created_at alone is not unique — two grants can land in the same
          // transaction — so id breaks the tie and keeps the order stable.
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(LEDGER_LIMIT),
        // One season of one season type is ~22 rows at most, so this cannot
        // reach the row cap. Scoping it to the live slate is also what makes
        // the totals below agree with the leaderboard's.
        supabase
          .from('lineups')
          .select('week, total_points, scored_at')
          .eq('season', season)
          .eq('season_type', seasonType)
          .order('week', { ascending: false }),
        supabase.rpc('leaderboard', {
          p_season: season,
          p_season_type: seasonType,
          p_week: undefined, // omitted -> SQL default null -> season to date
          p_limit: RANK_DEPTH,
        }),
        // A collection CAN pass 1000 instances, so this one pages. The order
        // key must be unique or paging repeats and drops rows; id is the card
        // instance id.
        fetchAllPages<OwnedRow>((from, to) =>
          supabase
            .from('my_collection')
            .select('tier, career_fp, lineup_starts')
            .order('id')
            .range(from, to),
        ),
      ]);

      if (!live()) return;
      const failure = ledgerRes.error ?? weekRes.error ?? boardRes.error;
      if (failure) return failure.message;

      const board = boardRes.data ?? [];
      setSlate(current);
      setLedger(ledgerRes.data ?? []);
      setWeeks(weekRes.data ?? []);
      setOwned(collection);
      setRank(board.find((row) => row.user_id === userId)?.rank ?? null);
      setRankPool(board.length < RANK_DEPTH ? board.length : null);
    } catch (err) {
      // fetchAllPages throws rather than returning an error, unlike the rest.
      return err instanceof Error ? err.message : 'Could not load your season.';
    }
  }, [userId]);

  const { error: loadError, refresh: reloadSeason } = useLoader(load);

  /* This screen's own `refreshing`, not the loader's: the pull refreshes the
     season AND the wallet, and the indicator should stay up until both are
     back — the loader can only speak for its own read. */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([reloadSeason(), refresh()]);
    setRefreshing(false);
  }, [reloadSeason, refresh]);

  const season = useMemo(() => {
    // A submitted-but-unscored week is not a week played: counting it drags the
    // average down every Sunday until the scorer runs.
    const scored = (weeks ?? []).filter((w) => w.scored_at !== null);
    const points = scored.reduce((sum, w) => sum + Number(w.total_points), 0);
    const best = scored.reduce<WeekRow | null>(
      (top, w) => (top === null || Number(w.total_points) > Number(top.total_points) ? w : top),
      null,
    );
    return {
      scored,
      points,
      best,
      pending: (weeks ?? []).length - scored.length,
      average: scored.length > 0 ? points / scored.length : null,
    };
  }, [weeks]);

  const collection = useMemo(() => {
    const counts = Object.fromEntries(TierOrder.map((t) => [t, 0])) as Record<CardTier, number>;
    let careerFp = 0;
    let starts = 0;
    for (const row of owned ?? []) {
      if (row.tier) counts[row.tier] += 1;
      careerFp += Number(row.career_fp ?? 0);
      starts += Number(row.lineup_starts ?? 0);
    }
    return { counts, careerFp, starts };
  }, [owned]);

  const coinFlow = useMemo(() => {
    let earned = 0;
    let spent = 0;
    for (const row of ledger ?? []) {
      if (row.amount < 0) spent += -row.amount;
      else earned += row.amount;
    }
    return { earned, spent };
  }, [ledger]);

  const trimmed = name.trim();
  const nameChanged = trimmed !== displayName;
  const nameValid = trimmed.length >= MIN_NAME && trimmed.length <= MAX_NAME;
  const saveDisabled = !nameChanged || !nameValid || savingName;
  // Say why Save is dead rather than leaving a dimmed button and no reason —
  // the length rule is otherwise invisible until the user gives up.
  const nameMessage =
    nameNotice ??
    (nameChanged && !nameValid ? `Use between ${MIN_NAME} and ${MAX_NAME} characters.` : null);

  async function saveName() {
    setSavingName(true);
    setNameNotice(null);
    // The DB enforces the same length rule; this is convenience, not the check.
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', session!.user.id);
    if (err) {
      setNameNotice(err.message);
    } else {
      setNameNotice('Saved.');
      await refresh();
    }
    setSavingName(false);
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
      // The (app) layout redirects to /login the moment the session clears.
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : 'Could not sign out.');
      setSigningOut(false);
    }
  }

  /* One error line, two sources. A failed sign-out is the thing that just
     happened, so it speaks over a load failure that is already on screen. */
  const error = signOutError ?? loadError;

  const typeLabel = slate?.season_type === 1 ? 'Preseason' : 'Season';
  const seasonLabel = `${typeLabel} ${slate?.season ?? FALLBACK_SEASON}`;

  const summary: StatItem[] = [
    { label: 'Points', value: weeks ? season.points.toFixed(1) : DASH, hint: 'season to date' },
    {
      label: 'Weeks',
      value: weeks ? String(season.scored.length) : DASH,
      hint: season.pending > 0 ? `${season.pending} pending` : undefined,
    },
    {
      /* The one figure on this strip that is a personal best rather than a
         running total, so it is the one that earns a mark. Lit only when there
         IS a best week — a mark on a dash claims a high nobody has set. */
      label: 'Best week',
      value: season.best ? Number(season.best.total_points).toFixed(1) : DASH,
      hint: season.best ? `Week ${season.best.week}` : undefined,
      glyph: season.best ? <Icon glyph={runStreak} color={accent} size={9} focused /> : undefined,
    },
    { label: 'Avg', value: season.average === null ? DASH : season.average.toFixed(1) },
    {
      label: 'Rank',
      value: rank === null ? DASH : `#${rank}`,
      glyph:
        rank === null ? undefined : <Icon glyph={runCleared} color={accent} size={9} focused />,
      hint: rank === null ? `outside top ${RANK_DEPTH}` : rankPool ? `of ${rankPool}` : undefined,
    },
    {
      label: 'Cards',
      value: String(cardCount),
      hint: collection.starts > 0 ? `${collection.starts} starts` : undefined,
    },
  ];

  const weekColumns: Column<WeekRow>[] = [
    {
      key: 'points',
      label: 'PTS',
      width: 62,
      strong: true,
      // Null, not 0: an unscored week has no score, and DataTable draws that
      // difference as an em dash on purpose.
      value: (w) => (w.scored_at === null ? null : Number(w.total_points)),
    },
    {
      key: 'delta',
      label: 'VS AVG',
      width: 62,
      value: (w) => {
        if (w.scored_at === null || season.average === null) return null;
        const delta = Number(w.total_points) - season.average;
        return `${delta >= 0 ? '+' : '-'}${Math.abs(delta).toFixed(1)}`;
      },
    },
    {
      key: 'status',
      label: 'STATUS',
      width: 76,
      align: 'left',
      value: (w) => (w.scored_at === null ? 'Pending' : 'Scored'),
    },
  ];

  const ledgerEntries: LedgerEntry[] = (ledger ?? []).map((row) => ({
    id: row.id,
    date: new Date(row.created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    label: REASON_LABEL[row.reason] ?? row.reason,
    amount: row.amount,
  }));

  return (
    /* 'table' rather than the settings-form 720: the screen is now mostly rows
     * of numbers — a week-by-week table, a coin ledger, a six-tile strip — and
     * 720 squeezed the ledger's label column into two lines. The one thing that
     * genuinely wanted a short measure, the name field, caps its own width
     * below instead of the whole page paying for it. */
    <Screen
      title="Profile"
      measure="table"
      context={`Account · ${seasonLabel}`}
      masthead={false}
      refreshing={refreshing}
      onRefresh={onRefresh}>
      {/* ---- identity ---------------------------------------------------- */}
      <View style={[styles.identity, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={[styles.avatar, { borderColor: accent }]}>
          <Text style={[Type.strong, { color: c.text }]}>{initialsOf(displayName)}</Text>
        </View>
        <View style={styles.identityText}>
          <Text numberOfLines={1} style={[Type.section, { color: c.text }]}>
            {displayName}
          </Text>
          <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
            {session?.user.email}
          </Text>
        </View>
        {/* The balance is duplicated in the rail and the mobile header, but the
            account screen is where a player goes to check it deliberately, so
            it should not be the one place it is missing. */}
        <View style={styles.balance}>
          <View style={styles.balanceRow}>
            <Coin size={10} color={accent} />
            <Text style={[Type.figure, NUMERIC, { color: c.text }]}>{coins.toLocaleString()}</Text>
          </View>
          <Text style={[Type.micro, { color: c.textTertiary }]}>COIN BALANCE</Text>
        </View>
      </View>

      {/* ---- season at a glance ------------------------------------------- */}
      <Panel title="Your season" hint={`${seasonLabel} · scored weeks only`}>
        <StatStrip items={summary} />
      </Panel>

      <Tabs<TabKey>
        tabs={
          [
            { value: 'overview', label: 'Overview' },
            { value: 'activity', label: 'Activity', hint: ledger ? String(ledger.length) : undefined },
            { value: 'settings', label: 'Settings' },
          ] satisfies Tab<TabKey>[]
        }
        value={tab}
        onChange={setTab}
        accent={accent}
      />

      {error ? <Text style={[Type.body, { color: c.negative }]}>{error}</Text> : null}

      {tab === 'overview' ? (
        <>
          <Panel title="Week by week" hint="Newest first">
            {weeks === null ? (
              <ActivityIndicator style={styles.pad} />
            ) : (
              <DataTable
                rows={weeks}
                columns={weekColumns}
                keyOf={(w) => String(w.week)}
                leadingLabel="WK"
                leadingWidth={56}
                leading={(w) => (
                  <Text style={[Type.strong, NUMERIC, { color: c.text }]}>Wk {w.week}</Text>
                )}
                emptyLabel="No lineups this slate yet. Set one and it will score here."
              />
            )}
          </Panel>

          <Panel
            title="Collection"
            hint={`${cardCount} cards · ${collection.careerFp.toFixed(0)} career FP`}
            /* The panel's own mark rather than a control. `action` is the only
               slot on the title row, and a card is the one noun this panel is
               entirely about — the tier bar below it is a breakdown OF cards. */
            action={<Icon glyph={cardBadge} color={c.textTertiary} size={18} focused />}>
            {owned === null ? <ActivityIndicator style={styles.pad} /> : (
              <TierBreakdown counts={collection.counts} />
            )}
          </Panel>
        </>
      ) : null}

      {tab === 'activity' ? (
        <>
          <Panel
            title="Coin flow"
            hint={ledger ? `Across the last ${ledger.length} entries` : undefined}>
            <StatStrip
              items={[
                {
                  label: 'Balance',
                  value: coins.toLocaleString(),
                  glyph: <Coin size={9} color={accent} />,
                },
                {
                  label: 'Earned',
                  value: `+${coinFlow.earned.toLocaleString()}`,
                  tone: 'positive',
                  glyph: <Icon glyph={runCashout} color={c.positive} size={9} focused />,
                },
                { label: 'Spent', value: `-${coinFlow.spent.toLocaleString()}`, tone: 'negative' },
              ]}
            />
          </Panel>

          <Panel title="Coin activity" hint={`Most recent ${LEDGER_LIMIT}`}>
            {ledger === null ? (
              <ActivityIndicator style={styles.pad} />
            ) : (
              <CoinLedger entries={ledgerEntries} />
            )}
          </Panel>
        </>
      ) : null}

      {tab === 'settings' ? (
        <>
          <Panel title="Display name" hint={`Shown on the leaderboard. ${MIN_NAME}–${MAX_NAME} characters.`}>
            <View style={styles.formBody}>
              <View style={styles.nameRow}>
                <TextInput
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    setNameNotice(null);
                  }}
                  maxLength={MAX_NAME}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!savingName}
                  accessibilityLabel="Display name"
                  style={[
                    Type.strong,
                    styles.input,
                    { color: c.text, borderColor: c.borderStrong, backgroundColor: c.surfaceSunken },
                  ]}
                />
                <Pressable
                  onPress={() => void saveName()}
                  disabled={saveDisabled}
                  accessibilityRole="button"
                  accessibilityLabel="Save display name"
                  accessibilityState={{ disabled: saveDisabled }}
                  style={({ pressed }) => [
                    styles.saveButton,
                    { borderColor: accent },
                    saveDisabled && styles.dim,
                    pressed && styles.pressed,
                  ]}>
                  {savingName ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={[Type.strong, { color: c.text }]}>Save</Text>
                  )}
                </Pressable>
              </View>
              {nameMessage ? (
                <Text style={[Type.fine, { color: c.textSecondary }]}>{nameMessage}</Text>
              ) : null}
            </View>
          </Panel>

          {/* The rules of the competition, not a preference — but this is where
              a reference page you read once belongs, next to the other
              documents you open and close. It used to be a permanent second row
              of navigation on the Leaderboard; see `app/(app)/scoring.tsx`. */}
          <Panel title="How the game works">
            <View style={[styles.field, { borderColor: c.border }]}>
              <Text style={[Type.micro, styles.fieldLabel, { color: c.textTertiary }]}>RULES</Text>
              <View style={styles.links}>
                <Link href="/scoring" accessibilityRole="link">
                  <Text style={[Type.body, { color: c.textSecondary }]}>Scoring</Text>
                </Link>
              </View>
            </View>
          </Panel>

          <Panel title="Account">
            <View style={styles.rows}>
              <Field label="EMAIL" value={session?.user.email ?? DASH} c={c} />
              <Field
                label="MEMBER SINCE"
                value={
                  session?.user.created_at
                    ? new Date(session.user.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        year: 'numeric',
                      })
                    : DASH
                }
                c={c}
              />
              <View style={[styles.field, { borderColor: c.border }]}>
                <Text style={[Type.micro, styles.fieldLabel, { color: c.textTertiary }]}>LEGAL</Text>
                <View style={styles.links}>
                  <Link href="/legal/privacy" accessibilityRole="link">
                    <Text style={[Type.body, { color: c.textSecondary }]}>Privacy policy</Text>
                  </Link>
                  <Link href="/legal/support" accessibilityRole="link">
                    <Text style={[Type.body, { color: c.textSecondary }]}>Support</Text>
                  </Link>
                </View>
              </View>
            </View>
          </Panel>

          {/* Outside every panel and last on the tab: sign out is the only
              irreversible control here and should not sit a thumb-width from
              the name field's Save. */}
          <Pressable
            onPress={() => void handleSignOut()}
            disabled={signingOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            accessibilityState={{ disabled: signingOut }}
            style={({ pressed }) => [
              styles.signOut,
              { borderColor: c.negative },
              signingOut && styles.dim,
              pressed && styles.pressed,
            ]}>
            {signingOut ? (
              <ActivityIndicator />
            ) : (
              <Text style={[Type.strong, { color: c.negative }]}>Sign out</Text>
            )}
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

/** A label/value row, dense enough that four of them cost one card's height. */
function Field({
  label,
  value,
  c,
}: {
  label: string;
  value: string;
  c: (typeof Colors)['light' | 'dark'];
}) {
  return (
    <View style={[styles.field, { borderColor: c.border }]}>
      <Text style={[Type.micro, styles.fieldLabel, { color: c.textTertiary }]}>{label}</Text>
      <Text numberOfLines={1} style={[Type.body, styles.fieldValue, { color: c.text }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three - 2,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: 1 },
  balance: { alignItems: 'flex-end', gap: 1 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },

  formBody: { padding: Spacing.three, gap: Spacing.two },
  nameRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  input: {
    flex: 1,
    // Capped so the field does not stretch to the table measure on a monitor —
    // a 940pt-wide name box is the reason `measure` used to be 'form'.
    maxWidth: 340,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: Spacing.two + 2,
    minHeight: 40,
  },
  saveButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rows: { paddingVertical: Spacing.one },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 32,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: { width: 104 },
  fieldValue: { flex: 1 },
  links: { flex: 1, flexDirection: 'row', gap: Spacing.three },

  signOut: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pad: { paddingVertical: Spacing.three },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
