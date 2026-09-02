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
import { currentRank, OverviewTab } from '@/components/players/OverviewTab';
import { PlayerHero, type HeroFigure } from '@/components/players/PlayerHero';
import { PlayerSheetFrame, SheetToneBand } from '@/components/players/PlayerSheetFrame';
import { Section, SectionStack } from '@/components/players/Section';
import { usePlayerPage } from '@/components/players/use-player-page';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { teamWash } from '@/constants/teams';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ProfileTab = 'overview' | 'card' | 'log';

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

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
    else router.dismissTo('/fantasy/players');
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

    /**
     * The three the header carries on this page.
     *
     * SEASON, not career: the directory is a place you go to decide about this
     * weekend, and a career total answers a different question the career table
     * is already there for. The rank is the only one of the three that needs
     * its pool, and it carries it inline — `QB4` on its own is a claim the data
     * cannot support, which is the same rule `CareerTable` follows.
     *
     * GAMES came out of the old five-figure row and did not make it back in.
     * The career table's first row prints it, and at three cells a label has
     * room to be a word rather than an abbreviation.
     */
    const rank = currentRank(profile);
    const figures: HeroFigure[] = [
      { label: 'SEASON FP', value: oneDp(player.seasonFp) },
      { label: 'FP / GAME', value: oneDp(player.fpPerGame) },
      rank
        ? {
            label: rank.season === player.season ? 'RANK' : `RANK ${rank.season}`,
            value: `${player.position ?? ''}${rank.rank}`,
            hint: rank.pool ? `of ${rank.pool}` : undefined,
          }
        : { label: 'RANK', value: '—' },
    ];

    return (
      <>
        <SheetToneBand tone={teamWash(player.team)}>
          <PlayerHero
            name={player.name}
            bio={profile?.player ?? null}
            team={player.team}
            position={player.position}
            injuryStatus={player.injuryStatus}
            /* HOW MANY OF HIM YOU HOLD, which is the only thing on this page
               that is about you rather than about him — and the reason to open
               the Cards tab.

               PRINTED AT NOUGHT TOO. Hiding it there was the first version and
               it made the header two different shapes: on a directory that is
               mostly players you do not own, the name would run wide on one
               page and stop short on the next, and the row you were comparing
               against had moved. A nought is also an answer. */
            trailing={
              <View style={styles.hold}>
                <Text style={[Type.micro, { color: c.textTertiary }]}>YOU HOLD</Text>
                <Text
                  style={[
                    Type.figure,
                    NUMERIC,
                    styles.holdValue,
                    { color: owned.length > 0 ? c.text : c.textTertiary },
                  ]}>
                  {owned.length}
                </Text>
              </View>
            }
            figures={figures}
          />

          <View style={styles.tabBar}>
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
        </SheetToneBand>

        {tab === 'overview' ? (
          <OverviewTab player={player} profile={profile} market={market} sections={sections} />
        ) : null}

        {tab === 'card' ? (
          <SectionStack>
            {/* Community first here, because this page is not about any one
                copy — it is the page you open from the directory, before you
                own anything. The heading names the player rather than the room,
                the same as its sibling. */}
            {/* YOUR COPIES FIRST here, unlike the card page — the one thing on
                this tab you can act on, and the answer to the question the
                header's `YOU HOLD` raises. Then the population. */}
            <Section
              label="Your cards"
              hint={owned.length > 1 ? `${owned.length} COPIES` : undefined}>
              <CardHistory
                cards={owned}
                loading={ownedLoading}
                playerName={player.name}
                onOpen={openCard}
              />
            </Section>

            <CommunityPanel market={market} playerName={player.name} />
          </SectionStack>
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
      /* The club, because this page is about the footballer and his side is
         the one identity he has that is not yours. Normalised — see
         `teamWash`, which is what stops Cincinnati shouting and Chicago
         disappearing at the same alpha. */
      tone={teamWash(player?.team)}
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
  /* No bottom rule: the first `Section` under it draws one, and two hairlines
     a gap apart is the box the sections exist to get rid of. */
  tabBar: { paddingBottom: 2 },
  hold: { alignItems: 'flex-end', gap: 1 },
  holdValue: { lineHeight: 20 },
});
