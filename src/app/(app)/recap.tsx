/**
 * Sunday night: what your guys did, and what they earned.
 *
 * WHY THE APP NEEDED THIS AT ALL
 *
 * Every complaint this economy has produced has been a LEGIBILITY complaint
 * wearing an incentive costume. Sets pay and nobody notices. Tiers move —
 * bronze to diamond is a 62x swing in what a card is worth — and there has
 * never been a moment where a player is told one happened. Scoring lands inside
 * a sweep that runs every minute, so the single most interesting event in a
 * fantasy game, finding out how your team did, had no event.
 *
 * PER CARD, NOT PER LINEUP, and that is the whole design. "You scored 96" is one
 * number and teaches nothing. Eight rows saying what each player scored, what
 * it paid, at which tier, and what it climbed to is the same information shaped
 * so that the NEXT decision — which of these do I keep when the roster cap makes
 * me choose — is an informed one.
 *
 * THE ROW IS ORDERED TO BE READ LEFT TO RIGHT AS A SENTENCE: who, what they did,
 * what it was worth. The multiplier sits against the gems it multiplied rather
 * than against the tier badge, because it is a fact about the payout and not
 * about the card.
 *
 * A PROMOTION IS DRAWN UNDER THE ROW THAT EARNED IT, never as its own list.
 * "Played at BRONZE, earned SILVER" only means something next to the points
 * that did it, and a separate promotions section would be a second place to
 * look for the same event.
 *
 * THE FOOTER IS WHY THIS SCREEN IS WORTH BUILDING. `closest_sets` puts a rung
 * you can finish TODAY in front of a player at the moment they are happiest,
 * which converts better than anything that could be bolted onto the Sets tab —
 * because the Sets tab is a place you have to decide to visit and this is not.
 * The roster line rides along for the mirror-image reason: the cap should be
 * something you are reminded of on a calm Sunday, not something you discover at
 * 12:55 next week when a starter is ruled out and the lineup will not save.
 *
 * IT IS A ROOT ROUTE IN `(app)`, above the tab navigator, like `packs` and
 * `scoring`: a thing you open, read and close, that belongs to no section's
 * navigation.
 */
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { parseRecap, type Recap } from '@/components/recap/recap';
import { RecapBody } from '@/components/recap/RecapBody';
import { Screen } from '@/components/shell/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

export default function RecapScreen() {
  const params = useLocalSearchParams<{ season?: string; type?: string; week?: string }>();

  const [recap, setRecap] = useState<Recap | null>(null);

  const season = Number(params.season) || new Date().getFullYear();
  const seasonType = Number(params.type) || 2;
  const week = Number(params.week) || 1;

  const load = useCallback<Load>(
    async (live) => {
      const { data, error: err } = await supabase.rpc('week_recap', {
        p_season: season,
        p_season_type: seasonType,
        p_week: week,
      });
      if (!live()) return null;
      if (err) return err.message;
      setRecap(parseRecap(data));
      return null;
    },
    [season, seasonType, week],
  );

  const { loading, error, refreshing, refresh } = useLoader(load);

  return (
    <Screen title={`Week ${week} recap`} refreshing={refreshing} onRefresh={refresh}>
      {error ? (
        <EmptyState title="Could not load the recap" body={error} />
      ) : loading || !recap ? null : !recap.hasLineup ? (
        <EmptyState
          title="No lineup that week"
          body="You did not set a lineup for this week, so there is nothing to report."
        />
      ) : (
        <RecapBody recap={recap} />
      )}
    </Screen>
  );
}
