/**
 * Everything BOTH profiles need about a player, loaded once.
 *
 * `/player/<player_id>` and `/card/<card_instance_id>` show the same football
 * facts — bio, season production, usage, team, career, game log, and how the
 * community holds him. Only the Card tab differs. Loading that set in one place
 * is what stops the two pages disagreeing about the same player, which is the
 * failure mode a split like this invites.
 *
 * EVERY SOURCE BUT THE DIRECTORY ROW IS NON-FATAL. The directory row is the one
 * that decides "is this player in the set at all", so its failure is the
 * screen's failure. A profile, market or game-log failure costs you a panel and
 * leaves the rest of the page standing — half a page beats an error page.
 *
 * The card profile is NOT loaded here. It is the one thing the two pages do not
 * share, and it is keyed by a different id.
 */
import { useCallback, useState } from 'react';

import type { CardTier } from '@/constants/theme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';
import {
  DIRECTORY_COLUMNS,
  normalise,
  type DirectoryPlayer,
} from '@/components/cards/player-directory';
import type { OwnedCard } from './CardHistory';
import { parseGameLog, type GameLogSection } from './game-log';
import { parseMarket, type PlayerMarket } from './market';
import { parseProfile, type PlayerProfile } from './profile';

export type PlayerPageData = {
  player: DirectoryPlayer | null;
  profile: PlayerProfile | null;
  sections: GameLogSection[];
  market: PlayerMarket | null;
  owned: OwnedCard[];
  ownedLoading: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/** Pass null while the player id is still unknown — the card page resolves it. */
export function usePlayerPage(playerId: string | null | undefined): PlayerPageData {
  const [player, setPlayer] = useState<DirectoryPlayer | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [sections, setSections] = useState<GameLogSection[]>([]);
  const [market, setMarket] = useState<PlayerMarket | null>(null);
  const [owned, setOwned] = useState<OwnedCard[]>([]);
  const [ownedLoading, setOwnedLoading] = useState(true);

  const load = useCallback<Load>(
    async (live) => {
      if (!playerId) return;

      const [directoryRes, profileRes, gameLogRes, marketRes, ownedRes] = await Promise.all([
        supabase
          .from('player_directory')
          .select(DIRECTORY_COLUMNS)
          .eq('player_id', playerId)
          .order('season', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.rpc('player_profile', { p_player_id: playerId }),
        supabase.rpc('player_game_log', { p_player_id: playerId }),
        supabase.rpc('player_market', { p_player_id: playerId }),
        /* RLS scopes `my_collection` to the caller, so this needs no user
           filter — and cannot leak anyone else's cards even if one were added
           by mistake. Unpaged deliberately: this is one player's copies, which
           is a handful, not the whole collection. */
        supabase
          .from('my_collection')
          .select(
            'id, tier, career_fp, lineup_starts, season, acquired_at, tier_floor_fp, next_tier_at, next_tier_label, sell_value',
          )
          .eq('player_id', playerId)
          .order('acquired_at', { ascending: false }),
      ]);

      if (!live()) return;
      if (directoryRes.error) return directoryRes.error.message;

      setPlayer(directoryRes.data ? normalise(directoryRes.data) : null);
      setProfile(profileRes.error || !profileRes.data ? null : parseProfile(profileRes.data));
      // Spans every season we hold AND the fixtures still to come, so there is
      // no client-side merging left to do here.
      setSections(gameLogRes.error || !gameLogRes.data ? [] : parseGameLog(gameLogRes.data));
      setMarket(marketRes.error || !marketRes.data ? null : parseMarket(marketRes.data));

      setOwned(
        ownedRes.error || !ownedRes.data
          ? []
          : ownedRes.data.map((r) => ({
              id: String(r.id),
              tier: (r.tier ?? 'bronze') as CardTier,
              careerFp: Number(r.career_fp ?? 0),
              lineupStarts: Number(r.lineup_starts ?? 0),
              season: r.season,
              acquiredAt: r.acquired_at,
              tierFloorFp: r.tier_floor_fp === null ? null : Number(r.tier_floor_fp),
              nextTierAt: r.next_tier_at === null ? null : Number(r.next_tier_at),
              nextTierLabel: r.next_tier_label,
              // Priced by the server, never derived here — a client that
              // computes its own price will eventually disagree with the
              // balance the user actually receives.
              sellValue: Number(r.sell_value ?? 0),
            })),
      );
      setOwnedLoading(false);
    },
    [playerId],
  );

  const { loading, error, refresh } = useLoader(load);

  return { player, profile, sections, market, owned, ownedLoading, loading, error, refresh };
}
