/**
 * Somebody else's account screen, presented over the app.
 *
 * ---------------------------------------------------------------------------
 * IT IS A SHEET, AND IT IS THE PROFILES' SHEET
 * ---------------------------------------------------------------------------
 *
 * A manager is exactly the kind of object `PlayerSheetFrame` was built for: you
 * open it off a name, read it, act once, and put it down again. Same
 * presentation as the player profile, the card profile and the set checklist,
 * for the same reason — and the frame's scroll-in title assumes a hero carrying
 * the same name at full size below it, which is the shape here.
 *
 * ---------------------------------------------------------------------------
 * ONE COMPONENT, TWO HOSTS
 * ---------------------------------------------------------------------------
 *
 * `/manager/<id>` renders this as a presented route. `ContestSheet` renders the
 * same component as a FRAME on its own stack, so opening a manager from a
 * contest's field does not put a second sheet on top of the first — the rule
 * that file's header sets out at length. That is why the frame is rendered here
 * rather than by either host: each view owns its own frame, and this one's
 * footer (the friend button) is part of the view.
 *
 * The three props that differ between the hosts are all about the way out:
 * `onBack`/`backLabel` draw the row that returns you to the frame underneath,
 * and `dismissible` turns off the drag while there is something under this to
 * drag back to.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT SHOWS, AND WHY EVERY FIGURE IS ALREADY PUBLIC
 * ---------------------------------------------------------------------------
 *
 * The five community boards already rank every account by points, best week,
 * record, collection value and sets. This page is those same figures cut by
 * PERSON instead of by rank — nothing here is a new disclosure, and the numbers
 * come from the board functions themselves so a profile cannot disagree with
 * the board a reader just came from. There is no email on this page and no way
 * to get one.
 *
 * A figure the boards do not have — someone outside their 500-row window, or a
 * manager who has not filed a lineup — is a dash rather than a zero. "0.0
 * points" and "has not played" are different statements and the account screen
 * already draws that difference the same way.
 *
 * ---------------------------------------------------------------------------
 * THE FRIEND BUTTON IS IN THE FOOTER
 * ---------------------------------------------------------------------------
 *
 * Pinned, so the one action on the page is reachable without scrolling past a
 * collection breakdown — `ContestSheet` puts "edit lineup" there for the same
 * reason. On your OWN profile there is no action, so there is no bar: the frame
 * draws a footer around whatever it is handed, and a footer rendering nothing
 * would pin an empty strip to the bottom of the sheet.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { StatStrip, type StatItem } from '@/components/account/StatStrip';
import { BackRow } from '@/components/contests/ContestRecapPanel';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { Section, SectionStack } from '@/components/players/Section';
import { Coin, initialsOf } from '@/components/shell/AppHeader';
import { DASH } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { FriendButton } from './FriendButton';
import {
  fetchManagerProfile,
  sinceLabel,
  type FriendLink,
  type ManagerProfile,
} from './friends';

export function ManagerView({
  userId,
  /** The handle the row that opened this already knew — see `manager` on `EntryView`. */
  name,
  onClose,
  onBack,
  backLabel,
  dismissible,
}: {
  userId: string | null;
  name?: string;
  onClose: () => void;
  onBack?: () => void;
  backLabel?: string;
  dismissible?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;

  const [profile, setProfile] = useState<ManagerProfile | null>(null);

  const load = useCallback<Load>(
    async (live) => {
      if (!userId) return 'No manager was named.';
      try {
        const row = await fetchManagerProfile(userId);
        if (!live()) return;
        if (!row) return 'That manager could not be found.';
        setProfile(row);
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not load this manager.';
      }
    },
    [userId],
  );

  const { loading, error, reload } = useLoader(load);

  /**
   * The friendship, held here rather than re-read.
   *
   * The button reports the state the SERVER settled on (see `FriendButton`), so
   * patching the loaded profile with it is not optimism — it is the answer. A
   * full re-read would redraw six board figures to change one word.
   */
  const setLink = useCallback((next: FriendLink) => {
    setProfile((p) => (p === null ? p : { ...p, link: next }));
  }, []);

  const [actionError, setActionError] = useState<string | null>(null);

  const typeLabel = profile?.seasonType === 1 ? 'Preseason' : 'Season';
  const subtitle = profile
    ? [
        `${typeLabel} ${profile.season}`,
        profile.link === 'friends' ? sinceLabel(profile.friendsSince) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  const body = () => {
    if (loading && profile === null) {
      return (
        <View style={styles.centre}>
          <ActivityIndicator />
        </View>
      );
    }
    if (error || !profile) {
      return (
        <View style={styles.centre}>
          <EmptyState
            title="Could not load this manager"
            body={error ?? undefined}
            actionLabel="Try again"
            onAction={reload}
          />
        </View>
      );
    }

    const season: StatItem[] = [
      {
        label: 'Points',
        value: profile.points === null ? DASH : profile.points.toFixed(1),
        hint: 'season to date',
      },
      { label: 'Weeks', value: profile.weeks === null ? DASH : String(profile.weeks) },
      {
        label: 'Best week',
        value: profile.bestPoints === null ? DASH : profile.bestPoints.toFixed(1),
        hint: profile.bestWeek === null ? undefined : `Week ${profile.bestWeek}`,
      },
      {
        label: 'Avg',
        value:
          profile.points === null || !profile.weeks
            ? DASH
            : (profile.points / profile.weeks).toFixed(1),
      },
      {
        label: 'Rank',
        value: profile.rank === null ? DASH : `#${profile.rank}`,
        hint: profile.rank === null ? 'unranked' : `of ${profile.fieldSize}`,
      },
      {
        label: 'Record',
        value: recordLabel(profile),
        hint: profile.winPct === null ? undefined : `${pct(profile.winPct)} win rate`,
      },
    ];

    const collection: StatItem[] = [
      {
        label: 'Value',
        value: profile.value === null ? DASH : Math.round(profile.value).toLocaleString(),
        glyph: <Coin size={9} color={accent} />,
        hint: profile.valueRank === null ? undefined : `#${profile.valueRank} on value`,
      },
      { label: 'Held', value: profile.cards === null ? DASH : String(profile.cards) },
      {
        label: 'In sets',
        value: profile.inSets === null ? DASH : String(profile.inSets),
        tone: 'muted',
      },
      { label: 'Players', value: profile.players === null ? DASH : String(profile.players) },
      {
        label: 'Gold+',
        value: profile.goldPlus === null ? DASH : String(profile.goldPlus),
        hint: profile.diamond ? `${profile.diamond} diamond` : undefined,
      },
      {
        label: 'Career FP',
        value: profile.careerFp === null ? DASH : Math.round(profile.careerFp).toLocaleString(),
      },
    ];

    return (
      <View style={styles.body}>
        {/* Back to whatever pushed this — a contest's field, a rival's team. */}
        {backLabel && onBack ? <BackRow label={backLabel} onPress={onBack} /> : null}

        {/* THE HERO. Full-size name, because the frame's own title stays hidden
            until this has scrolled under it — see `PlayerSheetFrame`. */}
        <View style={styles.hero}>
          <View style={[styles.avatar, { borderColor: accent }]}>
            <Text style={[Type.section, { color: c.text }]}>{initialsOf(profile.name)}</Text>
          </View>
          <View style={styles.heroText}>
            <Text numberOfLines={1} style={[Type.page, { color: c.text }]}>
              {profile.name}
            </Text>
            <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
              {[
                profile.link === 'self' ? 'This is you' : 'Manager',
                memberLabel(profile.memberSince),
                `${profile.friendCount} ${profile.friendCount === 1 ? 'friend' : 'friends'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        {/* The one place an action's refusal can be a sentence on this sheet.
            The footer is a 44pt bar with a label in it and no room for one. */}
        {actionError ? (
          <Text style={[Type.body, { color: c.negative }]}>{actionError}</Text>
        ) : null}

        <SectionStack>
          <Section label="Season" hint={`${typeLabel} ${profile.season} · scored weeks`}>
            <StatStrip items={season} />
          </Section>

          <Section
            label="Collection"
            /* Value is live and re-priced on every read — see `card_prices`. A
               figure that moves without the reader doing anything should say
               so, or it reads as a number that disagrees with itself. */
            hint="Priced now">
            <StatStrip items={collection} />
          </Section>

          {profile.rungs || profile.setsDone ? (
            <Section label="Sets">
              <StatStrip
                items={[
                  { label: 'Rungs', value: String(profile.rungs ?? 0) },
                  { label: 'Completed', value: String(profile.setsDone ?? 0) },
                ]}
              />
            </Section>
          ) : null}
        </SectionStack>
      </View>
    );
  };

  return (
    <PlayerSheetFrame
      title={profile?.name ?? name}
      subtitle={subtitle}
      onClose={onClose}
      dismissible={dismissible}
      closeLabel="Close manager profile"
      /* CONDITIONAL, not a component that returns null: the frame draws a bar
         around whatever it is handed, so your own profile — which has no action
         — must hand it nothing at all rather than an empty control. */
      footer={
        profile && profile.link !== 'self' ? (
          <View style={styles.footer}>
            <FriendButton
              userId={profile.userId}
              name={profile.name}
              link={profile.link}
              onChange={setLink}
              onError={setActionError}
              wide
            />
          </View>
        ) : undefined
      }>
      {body()}
    </PlayerSheetFrame>
  );
}

/** "2-1-0", or a dash where the field has graded nothing yet. */
function recordLabel(p: ManagerProfile): string {
  if (p.wins === null || p.losses === null || p.ties === null) return DASH;
  if (p.wins + p.losses + p.ties === 0) return DASH;
  return `${p.wins}-${p.losses}-${p.ties}`;
}

/** ".625" — the board's own formatting, so the two agree on sight. */
const pct = (v: number) => v.toFixed(3).replace(/^0/, '');

function memberLabel(iso: string): string | null {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return `since ${when.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

const styles = StyleSheet.create({
  body: { gap: Spacing.three },
  centre: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, minWidth: 0, gap: 2 },
  footer: { flexDirection: 'row', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
