/**
 * Card profile — ONE copy you own.
 *
 * ONE OF TWO PROFILES, AND THEY SHARE MORE THAN THEY DIFFER.
 *
 * Same hero and the same three tabs as `/player/<player_id>`, because the
 * football is the same football: a copy's Overview and Game log describe the
 * footballer, and there is no version of "how many targets did he see" that is
 * different because you happen to hold him. Both come from `usePlayerPage`, so
 * the two screens cannot drift.
 *
 * ONLY THE CARD TAB DIFFERS, and it differs by ADDITION rather than by
 * replacement: your copy's standing and its week-by-week earnings sit on top,
 * and the same community view the directory page shows sits underneath. That
 * ordering is the whole point of the split — here you came to look at a
 * specific object, and the community is the context you judge it against.
 *
 * The route param is the CARD INSTANCE id, never the player id — the opposite
 * of its sibling. A player is one row; the copies of him are many, and two of
 * yours can be worth very different things.
 *
 * WHAT DRIVES career_fp, RESTATED BECAUSE THIS IS THE SCREEN THAT SHOWS IT: a
 * copy earns only in weeks it was STARTED. `StartLog` is the receipt — every
 * row in it is a week this copy was in the lineup, and there is no other way
 * for the total to have moved.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { readCardActions, type CardActionSet, type CardActions } from '@/components/cards/card-actions';
import { CardExits, cardExitNote } from '@/components/cards/CardExits';
import { PlayerAvatar } from '@/components/cards/PlayerAvatar';
import { dropCards } from '@/components/collection/use-collection';
import { invalidateSets } from '@/components/collection/use-sets';
import { CardHistory } from '@/components/players/CardHistory';
import { PlayerRow } from '@/components/cards/PlayerRow';
import { CardStrip } from '@/components/players/CardStrip';
import { CommunityPanel } from '@/components/players/CommunityPanel';
import { GameLogTab } from '@/components/players/GameLogTab';
import { OverviewTab } from '@/components/players/OverviewTab';
import { HERO_PORTRAIT, PlayerHero, type HeroFigure } from '@/components/players/PlayerHero';
import { PlayerSheetFrame, SheetToneBand } from '@/components/players/PlayerSheetFrame';
import { Section, SectionStack } from '@/components/players/Section';
import { StartLog } from '@/components/players/StartLog';
import { startKey } from '@/components/players/GameLog';
import { parseCardProfile, type CardProfile } from '@/components/players/card-profile';
import { sellBreakdown } from '@/components/players/sell-copy';
import { sellErrorMessage } from '@/components/players/sell';
import { usePlayerPage } from '@/components/players/use-player-page';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { Colors, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

type ProfileTab = 'overview' | 'card' | 'log';

/**
 * The same three, in the same order and position, as the player profile.
 * SINGULAR here — this tab is about one copy. The player page says "Cards",
 * because its equivalent is about every copy of him. See the note there.
 */
const TABS: Tab<ProfileTab>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'card', label: 'Card' },
  { value: 'log', label: 'Game log' },
];

/** "27 Aug". The tray has room for a day and a month, not a year. */
function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "4 Aug 2026". Short and unambiguous — no locale-dependent 8/4 vs 4/8. */
function dateLabel(iso: string | null): string {
  if (!iso) return 'date unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date unknown';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { refresh: refreshWallet, applyCardDelta } = usePlayer();

  const [card, setCard] = useState<CardProfile | null>(null);
  const [tab, setTab] = useState<ProfileTab>('card');
  const [selling, setSelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);

  /* WHAT THIS COPY CAN BECOME, decided by the server. `card_profile` says what
     the card IS; this says what may be done with it — what selling pays, and
     which sets still have a slot open for it and at what price. Two reads
     rather than one because they answer different questions and only this one
     changes when somebody else's commit fills a set. */
  const [can, setCan] = useState<CardActions | null>(null);
  /** The set the confirm dialog is about, null when it is closed. */
  const [pendingSet, setPendingSet] = useState<CardActionSet | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const loadCard = useCallback<Load>(
    async (live) => {
      if (!id) return;
      const [{ data, error: err }, offers] = await Promise.all([
        supabase.rpc('card_profile', { p_card_instance_id: id }),
        /* Never the reason this screen fails. A card whose profile loaded is a
           card worth showing; losing the offers costs it two buttons, and
           `readCardActions` already answers an outage with an empty map. */
        readCardActions([id]),
      ]);
      if (!live()) return;
      if (err) return err.message;
      // Null for a card that is not the caller's, which is the same answer as
      // "does not exist" — deliberately, so this cannot be used to probe
      // whether an id is real.
      setCard(data ? parseCardProfile(data) : null);
      setCan(offers.get(id) ?? null);
    },
    [id],
  );

  const { loading, error, refresh: reload } = useLoader(loadCard);

  /* The football, keyed by the PLAYER this copy is of. Null until the card
     resolves, which is what makes this a two-phase load rather than one. */
  const page = usePlayerPage(card?.card.playerId ?? null);

  /* Which weeks THIS copy was in the lineup, so the game log can mark them.
     The player's log and the copy's earnings are otherwise two lists you have
     to reconcile by eye — and the gap between them IS the bench rule. */
  /* Every OTHER copy of this player you hold. The page is about one of them,
     and listing it under "your other copies" is a row that navigates to the
     page you are already on. */
  const others = useMemo(() => page.owned.filter((x) => x.id !== id), [page.owned, id]);

  const startedWeeks = useMemo(
    () =>
      new Set((card?.starts ?? []).map((s) => startKey(s.season, s.seasonType, s.week))),
    [card],
  );

  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/collect');
  }, [router]);

  /**
   * Sell this copy.
   *
   * The wallet is re-read from the server rather than patched here: the balance
   * in the header is the number the user will check, and it must come from the
   * same place the sale did. Then the sheet closes — the card is gone, and
   * leaving its profile open would be showing a thing that no longer exists.
   */
  const confirmSell = useCallback(async () => {
    if (!card) return;
    setBusy(true);
    setSellError(null);
    try {
      const { error: err } = await supabase.rpc('sell_card', {
        p_card_instance_id: card.card.id,
      });
      if (err) throw new Error(sellErrorMessage(err.message));
      // One fewer card, said now rather than after the read — see
      // `applyCardDelta`. The header is on screen behind this sheet.
      applyCardDelta(-1);
      /* This copy is gone from the collection, which the inventory holds for
         the session — so the row goes with it rather than waiting for the grid
         to be re-read, or the card you just sold is still in it when this sheet
         closes. A sale always takes the copy that was pressed. */
      dropCards([card.card.id]);
      // And it may have been the card holding a set over its bar, which the
      // Sets page holds for the session too. See `invalidateSets`.
      invalidateSets();
      await refreshWallet();
      setSelling(false);
      dismiss();
    } catch (e) {
      // Kept open on failure. Closing would leave the card still there with no
      // explanation, which reads as the button having done nothing.
      setSellError(e instanceof Error ? e.message : 'The sale could not be completed.');
    } finally {
      setBusy(false);
    }
  }, [card, refreshWallet, applyCardDelta, dismiss]);

  /**
   * Put this card into a set.
   *
   * IT DOES NOT DISMISS, and that is the difference from selling. A sold copy
   * is gone and its profile is a page about a thing that no longer exists, so
   * that flow closes the sheet. A committed copy still HAS a profile — this
   * screen already draws a block for it, naming the set and linking to it — and
   * closing would take the player away from the one place that says what just
   * happened. So it reloads in place and the page becomes the after picture.
   *
   * `p_card_id` is the PRINTED card, not this instance, because that is what
   * the function takes: it picks the copy itself, and it picks the least
   * valuable one you hold. Which may not be this one — see `burnsThisCopy` and
   * the warning on the dialog.
   */
  const confirmCommit = useCallback(async () => {
    if (!card || !pendingSet) return;
    setBusy(true);
    setCommitError(null);
    try {
      const { data, error: err } = await supabase.rpc('commit_card_to_set', {
        p_set_code: pendingSet.code,
        p_card_id: card.card.cardId,
      });
      /* Verbatim. Every refusal `commit_card_to_set` raises is written to be
         read by a player — unlike `sell_card`'s, which is what `sellErrorMessage`
         exists to translate. */
      if (err) throw new Error(err.message);

      /* Exactly one copy burnt — not necessarily this one, see `burnsThisCopy`
         above, but always one. WHICH one is read back rather than assumed, so
         the grid behind this sheet loses the copy that actually went. */
      applyCardDelta(-1);
      const burnt = (data as { card_instance_id?: string } | null)?.card_instance_id;
      dropCards(typeof burnt === 'string' ? [burnt] : []);
      invalidateSets();
      await refreshWallet();
      setPendingSet(null);
      // Back to the server for both halves: the profile now reads as committed
      // (or not, if a spare went instead), and the set that took it can no
      // longer take another.
      await reload();
    } catch (e) {
      // Held open, same as the sale. Closing would leave the card unchanged
      // with no explanation, which reads as the button having done nothing.
      setCommitError(e instanceof Error ? e.message : 'The card could not be added.');
    } finally {
      setBusy(false);
    }
  }, [card, pendingSet, refreshWallet, applyCardDelta, reload]);

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
            Could not load this card
          </Text>
          <Text style={[Type.bodyRelaxed, styles.centreText, { color: c.textSecondary }]}>
            {error}
          </Text>
        </View>
      );
    }
    if (!card) {
      return (
        <View style={styles.centre}>
          <Text style={[Type.section, styles.centreText, { color: c.text }]}>Card not found</Text>
          <Text style={[Type.bodyRelaxed, styles.centreText, { color: c.textSecondary }]}>
            This card is not one of yours, or it no longer exists.
          </Text>
        </View>
      );
    }

    const k = card.card;

    /**
     * The three the header carries on this page.
     *
     * THE COPY, NOT THE PLAYER — which is the whole reason this route exists.
     * They were the top third of `CardStanding`, on a tab you had to already be
     * on; now Overview and Game log can be read without losing sight of what
     * the copy is worth.
     *
     * The third cell changes shape at the top tier rather than printing a
     * distance to a level that does not exist. See `CardStanding` for the same
     * branch on the bar.
     */
    const toNext = k.nextTierAt === null ? null : Math.max(0, k.nextTierAt - k.careerFp);
    const figures: HeroFigure[] = [
      { label: 'THIS COPY', value: k.careerFp.toFixed(1), hint: 'FP' },
      /* SCORED, not STARTS — and the word is doing real work. `lineup_starts`
         is computed by the sweep as `count(*) filter (where l.scored_at is not
         null)`, so it counts weeks that have been SETTLED, while `StartLog`
         directly below lists every week the copy was in a lineup. On a card
         started once in a week that has not swept, `STARTS 0` sat a thumb's
         width above `1 START` — two numbers for one word, both honest, and the
         disagreement only became visible when this strip put them on the same
         screen. `SCORED 0` over `1 START` reads correctly instead: you started
         it once, nothing has scored yet. */
      { label: 'SCORED', value: String(k.lineupStarts) },
      toNext === null || k.nextTierLabel === null
        ? { label: 'TIER', value: 'MAX' }
        : {
            label: `TO ${k.nextTierLabel.toUpperCase()}`,
            value: toNext.toFixed(0),
            hint: 'FP',
          },
    ];

    /* The bar's caveat, printed in the page rather than under the capsules —
       see `cardExitNote`. Null on the common path, and null outright on a copy
       that has already left, where there is no offer to qualify. */
    const scoredStarts = card.starts.filter((x) => x.scored).length;

    const exitNote =
      k.soldAt || k.committedAt
        ? null
        : cardExitNote(can?.sets ?? [], k.playerName, can?.burnsThisCopy !== false);

    return (
      <>
        <SheetToneBand tone={TierColors.dark[k.tier].accent}>
          <PlayerHero
            name={k.playerName}
            bio={page.profile?.player ?? null}
            team={k.teamAbbreviation}
            position={k.positionAbbreviation}
            injuryStatus={k.injuryStatus}
            /* The plain slot, wearing this copy's TIER as its edge — the same
               edge the card in the grid has, so the header's portrait is
               recognisably the object you tapped. It is the only structural
               difference between this header and the directory's; everything
               else that separates the two pages is the wash behind them. */
            figure={
              <PlayerAvatar size={HERO_PORTRAIT} frameColor={TierColors.dark[k.tier].frame} />
            }
            /* THE TIER, as a chip in the tier's own colour. It is the one fact
               about a copy that moves, and the page it is on is already washed
               in that colour — the chip is what names the colour so the wash
               reads as information rather than decoration. */
            trailing={
              <View
                style={[
                  styles.tierChip,
                  { backgroundColor: TierColors[scheme][k.tier].accentSoft },
                ]}>
                <Text style={[Type.micro, { color: TierColors[scheme][k.tier].accent }]}>
                  {k.tier.toUpperCase()}
                </Text>
              </View>
            }
            figures={figures}
          />

          <View style={styles.tabBar}>
            <Tabs
              tabs={TABS.map((t) =>
                t.value === 'log' && page.sections.length > 0
                  ? { ...t, hint: String(page.sections.length) }
                  : t,
              )}
              value={tab}
              onChange={setTab}
            />
          </View>
        </SheetToneBand>

        {/* Card is the DEFAULT tab here, unlike the player profile. You did not
            arrive at a specific copy to read a bio. */}
        {tab === 'card' ? (
          <SectionStack>
            {/* A sold copy still resolves — history has to keep working — so
                say so plainly rather than 404ing an old link. */}
            {k.soldAt ? (
              <Section label="Sold">
                <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
                  {`You sold this copy on ${dateLabel(k.soldAt)}${k.soldFor === null ? '' : ` for ${k.soldFor} coins`}. It still counts in the lineups it started, but you no longer hold it.`}
                </Text>
              </Section>
            ) : k.committedAt ? (
              /* The other way a copy leaves, and it must not read as a sale.
                 This one went somewhere: the set is named, and it is still
                 there to look at. */
              <Section label="In a set">
                <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
                  {`You added this copy to ${k.committedSetName ?? 'a set'} on ${dateLabel(k.committedAt)}${k.committedFor === null ? '' : ` for ${k.committedFor} coins`}. It is part of that set now — it still counts in the lineups it started, but it cannot be started or sold again.`}
                </Text>
                {k.committedSetCode ? (
                  <Pressable
                    onPress={() =>
                      router.replace({
                        pathname: '/set/[code]',
                        params: { code: k.committedSetCode as string },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${k.committedSetName ?? 'the set'}`}
                    style={({ pressed }) => [pressed && styles.pressed]}>
                    <Text style={[Type.strong, { color: c.textSecondary }]}>
                      {`See ${k.committedSetName ?? 'the set'} →`}
                    </Text>
                  </Pressable>
                ) : null}
              </Section>
            ) : null}

            {/**
              * TWO ZONES, AND THAT IS THE WHOLE TAB.
              *
              * It was nine sections at one type weight, and on a card pulled an
              * hour ago six of them said "nothing has happened yet" in six
              * different sentences — a progress bar with nothing on it, a start
              * table of one dashed row, a paragraph about the sweep, a
              * paragraph about a set that will not take it, a community block
              * of four counts all reading 1, and a paragraph about nobody
              * having earned anything. That is not information overload, it is
              * six apologies for having no information, each formatted as
              * importantly as a real finding.
              *
              * The split is by SUBJECT, which is also the only division a
              * reader is looking for: this object, and every other copy of him.
              * Everything that was prose is a labelled pair with its value on
              * the right edge — see `Row`.
              */}
            {/**
              * THE COPY AS A ROW, not as a progress bar over a stack of pairs.
              *
              * It was the only card on the page drawn differently from every
              * other card in the app — and it is the one a reader arrived to
              * look at. `CopyRow` is the lineup board's row, so the object you
              * tapped in a lineup looks like the same object when it opens.
              *
              * Its history goes on ONE line under the row: when it arrived, how
              * many weeks it has been started, and what a set will do with it.
              * Those were four labelled pairs and a progress bar, describing a
              * card that in the common case has done nothing yet.
              */}
            {/**
              * THE COPY AS THE DIRECTORY'S ROW.
              *
              * It was a progress bar over four labelled pairs — the only card
              * in the app drawn unlike every other card, and the one a reader
              * came to look at. `PlayerRow` is the row the player list draws,
              * so the object you tapped looks like the same object when it
              * opens; only the grey tray changes, and it changes because the
              * directory's tray is a fact about the player rather than about
              * this copy. See `CardStrip`.
              */}
            <Section label="This copy">
              {page.player ? (
                <View style={styles.rows}>
                  <PlayerRow
                    player={page.player}
                    onPress={() => {}}
                    figure={{ value: k.careerFp.toFixed(1), label: 'FP' }}
                    strip={
                      <CardStrip
                        tier={k.tier}
                        starts={card.starts.length}
                        rarity={k.rarity}
                        setNote={exitNote}
                        acquired={shortDate(k.acquiredAt)}
                      />
                    }
                  />
                </View>
              ) : null}

              {/* THE RECEIPT, ONLY ONCE THERE IS SOMETHING TO RECEIPT.
                  `career_fp` moves in exactly one way — a week this copy was in
                  a lineup and that week was scored — and on a card with
                  fourteen starts that table is the only place the total can be
                  checked. On a card with none it was a season band, four column
                  heads and a row of dashes around a fact the tray above already
                  states, so it does not draw at all. */}
              {scoredStarts > 0 ? (
                <StartLog starts={card.starts} playerName={k.playerName} />
              ) : null}
            </Section>

            {/* YOUR OTHER COPIES, between the one you opened and everyone
                else's. It is the nearest comparison a reader has — two copies
                of the same player in one collection can be worth very different
                things — and it is the only list on the page they can act on.
                Absent when this is the only one you hold, which is most of
                them. */}
            {others.length > 0 && page.player ? (
              <Section label="Your other copies" hint={`${others.length} MORE`}>
                <CardHistory
                  cards={others}
                  loading={page.ownedLoading}
                  player={page.player}
                  onOpen={(x) => router.replace({ pathname: '/card/[id]', params: { id: x.id } })}
                />
              </Section>
            ) : null}

            {/* The population, where this copy sits in it, and who is doing
                best — three sections, drawn by `CommunityPanel` in that order.
                Told WHICH copy, so the scale marks this one rather than the
                best of the several you may hold. */}
            <CommunityPanel
              market={page.market}
              playerName={k.playerName}
              directoryPlayer={page.player}
              copy={{
                careerFp: k.careerFp,
                rank: card.rank.amongPlayer,
                pool: card.rank.playerPool,
              }}
            />
          </SectionStack>
        ) : null}

        {tab === 'overview' ? (
          page.player ? (
            <OverviewTab
              player={page.player}
              profile={page.profile}
              market={page.market}
              sections={page.sections}
              /* Names the copy without duplicating card content into a player
                 tab — otherwise this tab is a dead end on a card page. */
              lead={
                <Text style={[Type.fine, { color: c.textTertiary }]}>
                  {`Viewing your ${k.season ?? ''} ${k.tier} card${
                    page.owned.length > 1 ? ` — one of ${page.owned.length} copies you hold` : ''
                  }. Everything below is about the player.`}
                </Text>
              }
            />
          ) : (
            <View style={styles.centre}>
              <ActivityIndicator />
            </View>
          )
        ) : null}

        {tab === 'log' ? (
          <GameLogTab
            profile={page.profile}
            sections={page.sections}
            startedWeeks={startedWeeks}
          />
        ) : null}

        {/**
          * COMMITTING IS DESTRUCTIVE AND GETS A DIALOG, exactly as the set
          * checklist gives it. This is NOT the pack reveal, where the same act
          * resolves with a second tap: there every card is seconds old, bronze
          * and worth single-figure coins, and there are eight of them. Here
          * there is one card, you came to this screen to look at it, and it may
          * carry a season of scoring — which is the case the checklist's dialog
          * was written for.
          */}
        <ConfirmDialog
          visible={pendingSet !== null}
          title={pendingSet ? `Add ${k.playerName} to ${pendingSet.name}?` : ''}
          body={
            pendingSet
              ? `A committed card is burnt: it leaves your collection for good, cannot be started or sold again, and pays back ${pendingSet.pays} coins. That fills ${pendingSet.committed + 1} of ${pendingSet.required} slots.`
              : undefined
          }
          /* THE ONE THING THE TITLE DOES NOT PREDICT, and on this screen it is
             the sharpest version of it: the player is looking at one specific
             copy, and the server burns the least valuable one they hold. Set
             apart rather than folded into the paragraph, which is what
             `warning` is for. */
          warning={
            can?.burnsThisCopy === false
              ? `You hold a spare of ${k.playerName}, and the least valuable copy is the one that burns — so this card stays and an older one goes.`
              : null
          }
          confirmLabel={pendingSet ? `Add for ${pendingSet.pays}` : ''}
          destructive
          busy={busy}
          error={commitError}
          onConfirm={() => void confirmCommit()}
          onCancel={() => {
            if (busy) return;
            setPendingSet(null);
            setCommitError(null);
          }}
        />

        <ConfirmDialog
          visible={selling}
          title={`Sell this ${k.tier} card?`}
          body={`${k.playerName} · ${k.season ?? '—'} card. ${sellBreakdown(k)} The copy and everything it has earned — ${k.careerFp.toFixed(0)} FP over ${k.lineupStarts} start${k.lineupStarts === 1 ? '' : 's'} — are gone for good, and pulling him again starts a new card at bronze.`}
          confirmLabel={`Sell for ${k.sellValue}`}
          destructive
          busy={busy}
          error={sellError}
          onConfirm={() => void confirmSell()}
          onCancel={() => {
            if (busy) return;
            setSelling(false);
            setSellError(null);
          }}
        />
      </>
    );
  };

  return (
    <PlayerSheetFrame
      title={card?.card.playerName}
      /* The CARD's identity, not the player's: which season, which rarity,
         which tier. Team and position ride along because without them the
         title is a name with no context. */
      subtitle={
        card
          ? [
              card.card.teamAbbreviation?.toUpperCase(),
              card.card.positionAbbreviation,
              card.card.season ? `${card.card.season} CARD` : null,
              card.card.tier.toUpperCase(),
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      closeLabel="Close card"
      /* The TIER, which is the thing this page exists to report and the one
         fact about a copy that moves. A card climbing bronze to silver changes
         the colour of its own page, which is the progression made visible on
         the screen you go to check it. */
      tone={card ? TierColors.dark[card.card.tier].accent : null}
      /**
       * WHAT YOU CAN DO WITH IT, PINNED.
       *
       * The two exits have now been in three places. At the BOTTOM of the Card
       * tab, under the start log, they were reported as not existing: on a card
       * with fourteen starts the log is most of a screen, so "what can I do
       * with this" was below the fold on the one screen that exists to answer
       * it. Moved to the TOP of the tab they were found, at a cost of two
       * stacked 56pt slabs above every number on the page — the reading order
       * inverted to fix a scrolling problem.
       *
       * A footer fixes the scrolling problem instead. The bar is always on
       * screen and costs the content nothing, so the tab can go back to
       * standing, log, provenance, community — look, then decide — with the
       * deciding always to hand.
       *
       * TAB-SCOPED, not always on. Overview and Game log are about the
       * footballer, and a SELL button under a paragraph about his college is
       * the app talking over the page. Neither exit is offered on a copy that
       * has already taken one, and BOTH are checked rather than just the sale:
       * a committed copy with a live SELL button is a button whose only outcome
       * is a Postgres error.
       *
       * `footerGlass` is what makes the bar FLOAT rather than sit in the flow —
       * the frame drops its own gutter and rule, lets the content run under the
       * capsules, and measures the bar so the scroll still ends clear of it.
       * The same two props the contest sheet passes.
       */
      footerGlass
      footer={
        card && tab === 'card' && !card.card.soldAt && !card.card.committedAt ? (
          <CardExits
            playerName={card.card.playerName}
            tier={card.card.tier}
            sellValue={card.card.sellValue}
            sets={can?.sets ?? []}
            /* Defaults to "this one burns" while the offers are still in
               flight, which is the safe way round: it is the reading that makes
               the act sound MORE consequential, and no button is drawn from it
               until `sets` arrives anyway. */
            burnsThisCopy={can?.burnsThisCopy !== false}
            busy={busy}
            onCommit={(set) => {
              setCommitError(null);
              setPendingSet(set);
            }}
            onSell={() => {
              setSellError(null);
              setSelling(true);
            }}
          />
        ) : undefined
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
  /* No bottom rule: the first `Section` under it draws one, and two hairlines
     a gap apart is the box the sections exist to get rid of. */
  tabBar: { paddingBottom: 2 },
  /* The directory row draws its own gutter, so the section cancels its. */
  rows: { marginHorizontal: -Spacing.three },
  tierChip: { borderRadius: Radius.chip, paddingHorizontal: Spacing.two - 1, paddingVertical: 3 },
  pressed: { opacity: 0.65 },
});
