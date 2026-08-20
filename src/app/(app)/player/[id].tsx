/**
 * Player profile — the DIRECTORY one: who this footballer is, what he has
 * produced, how his team uses him, and how the community holds his cards.
 *
 * ONE OF TWO PROFILES, AND THEY SHARE MORE THAN THEY DIFFER.
 *
 * Its sibling is `/card/<card_instance_id>`, about ONE copy you own. Both open
 * on the same hero and both carry Overview / Card / Game log, because the
 * football is the same football. Only the CARD tab differs:
 *
 *   here          how the whole community holds him, and which copies are
 *                 yours — each one a link across to its own page.
 *   /card/<id>    the same community view, under a section about the single
 *                 copy in question.
 *
 * The route param is the PLAYER id, never the card id. A player is one row; the
 * copies of him are many.
 *
 * Most of the football comes from one RPC (`player_profile`) rather than four
 * client round trips, because the ranking has to happen server-side against
 * every player-season anyway. Three things the provider does not sell, and
 * which are therefore NOT here: projections, depth charts, and news. Rather
 * than invent them the usage panel shows measured share of the team's work and
 * says plainly that it is a measurement.
 *
 * No photo, no logo, no jersey: unlicensed.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { CardHistory, type OwnedCard } from '@/components/players/CardHistory';
import { CommunityPanel } from '@/components/players/CommunityPanel';
import { GameLogTab } from '@/components/players/GameLogTab';
import { OverviewTab } from '@/components/players/OverviewTab';
import { PlayerHero } from '@/components/players/PlayerHero';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { usePlayerPage } from '@/components/players/use-player-page';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ProfileTab = 'overview' | 'card' | 'log';

/**
 * The same three tabs as the card profile, in the same order and the same
 * position — two views of one thing should not reshuffle their navigation.
 *
 * The one word that differs is the NUMBER: this page says "Cards", because its
 * card tab is about every copy of him in the game, yours among them. The card
 * page says "Card", because its is about one. Singular versus plural carries
 * the scope without the rail changing shape, which a different word entirely
 * (Community, Ownership) would have done.
 */
const TABS: Tab<ProfileTab>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'card', label: 'Cards' },
  { value: 'log', label: 'Game log' },
];

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const [tab, setTab] = useState<ProfileTab>('overview');

  const { player, profile, sections, market, owned, ownedLoading, loading, error } =
    usePlayerPage(id);

  /**
   * Open one of your copies.
   *
   * `/card/<card_instance_id>`, NOT `/player/<player_id>`: this is one of the
   * few places both ids are in scope at once, and they are easy to confuse.
   */
  const openCard = useCallback(
    (card: OwnedCard) => {
      router.push({ pathname: '/card/[id]', params: { id: card.id } });
    },
    [router],
  );

  /**
   * Dismiss the sheet.
   *
   * `back()` is a DISMISSAL, not a navigation — the tabs are still mounted
   * underneath, so this puts the profile down and leaves you where you were,
   * mid-scroll. The fallback matters for a cold deep link, which has nothing
   * beneath it.
   */
  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/fantasy/players');
  }, [router]);

  const body = () => {
    if (loading || !id) {
      return (
        <View style={styles.centre}>
          <ActivityIndicator />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centre}>
          <Text style={[Type.section, styles.centreText, { color: c.text }]}>
            Could not load this player
          </Text>
          <Text style={[Type.bodyRelaxed, styles.centreText, { color: c.textSecondary }]}>
            {error}
          </Text>
        </View>
      );
    }
    if (!player) {
      return (
        <View style={styles.centre}>
          <Text style={[Type.section, styles.centreText, { color: c.text }]}>Player not found</Text>
          <Text style={[Type.bodyRelaxed, styles.centreText, { color: c.textSecondary }]}>
            This player is not in the current card set.
          </Text>
        </View>
      );
    }

    return (
      <>
        <PlayerHero
          name={player.name}
          bio={profile?.player ?? null}
          team={player.team}
          position={player.position}
          injuryStatus={player.injuryStatus}
        />

        <View style={[styles.tabBar, { borderColor: c.backgroundElement }]}>
          <Tabs
            tabs={TABS.map((t) => {
              if (t.value === 'log' && sections.length > 0) {
                return { ...t, hint: String(sections.length) };
              }
              // The count people actually want on this tab is "how many do I
              // hold", not how many exist.
              if (t.value === 'card' && owned.length > 0) {
                return { ...t, hint: String(owned.length) };
              }
              return t;
            })}
            value={tab}
            onChange={setTab}
          />
        </View>

        {tab === 'overview' ? (
          <OverviewTab player={player} profile={profile} market={market} />
        ) : null}

        {tab === 'card' ? (
          <>
            {/* Community first here, because this page is not about any one
                copy — it is the page you open from the directory, before you
                own anything. */}
            <CommunityPanel market={market} />
            <CardHistory
              cards={owned}
              loading={ownedLoading}
              playerName={player.name}
              onOpen={openCard}
            />
          </>
        ) : null}

        {tab === 'log' ? <GameLogTab profile={profile} sections={sections} /> : null}
      </>
    );
  };

  return (
    <PlayerSheetFrame
      /* Sticky, and small: the hero below carries the identity at full size,
         but it scrolls away, and after a screen of game log you still need to
         know whose page this is. */
      title={player?.name}
      subtitle={
        player
          ? [player.team?.toUpperCase(), player.position, player.rarity?.toUpperCase()]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      onClose={dismiss}>
      {body()}
    </PlayerSheetFrame>
  );
}

const styles = StyleSheet.create({
  centre: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  centreText: { textAlign: 'center' },
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 2 },
});
