/**
 * A club's depth chart, for the Team tab on a player profile.
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO DEPTH-CHART ENDPOINT, AND THAT IS WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 *
 * `/depth_charts` is a 404 in every spelling. The chart is the `depth` field on
 * `/teams/{id}/roster`, which nothing read until `sync-fantasy` started landing
 * it in `team_depth`. This hook is the read side of that table and does no
 * provider work of its own — the chart refreshes weekly on a cron.
 *
 * KEYED ON THE CLUB'S ABBREVIATION, because that is what a player profile has.
 * The join walks `teams` rather than taking a second round trip for the id.
 *
 * ORDERING IS THIS FILE'S ONE REAL DECISION. The provider's 31 slots come back
 * in no useful order — `C` before `QB`, `LCB` next to `LS` — so a chart printed
 * in feed order is a list of trivia. `SLOT_ORDER` puts the five fantasy
 * positions first because that is what a player of this game is here to read,
 * then the rest of the offence, then the defence, then the specialists. A slot
 * the provider invents that this list has not met sorts to the end rather than
 * being dropped: an unknown slot is still a fact about the club.
 */
import { useCallback, useState } from 'react';

import { useLoader } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

export type DepthEntry = {
  playerId: string;
  name: string;
  depth: number;
  injuryStatus: string | null;
};

export type DepthSlot = {
  slot: string;
  players: DepthEntry[];
};

/**
 * Fantasy first, then the rest of the offence, the defence, and the kicking
 * game. Anything unlisted sorts after all of it — see the file header.
 */
const SLOT_ORDER = [
  'QB', 'RB', 'FB', 'WR', 'WR-2', 'WR-3', 'TE', 'PK', 'K',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LDE', 'NT', 'DT', 'RDE',
  'WLB', 'LILB', 'RILB', 'SLB', 'LB',
  'LCB', 'RCB', 'NB', 'CB', 'FS', 'SS', 'S',
  'P', 'LS', 'H', 'KR', 'PR',
];

const slotWeight = (slot: string): number => {
  const i = SLOT_ORDER.indexOf(slot.toUpperCase());
  return i === -1 ? SLOT_ORDER.length : i;
};

type Row = {
  slot: string;
  depth: number;
  injury_status: string | null;
  player_id: string;
  players: { full_name: string | null } | null;
};

export function useTeamDepth(team: string | null | undefined, season: number | null) {
  const [slots, setSlots] = useState<DepthSlot[] | null>(null);

  /* `useLoader` owns the loading/error state and the newest-attempt-wins
     bookkeeping — see its header. `live()` is how a read that has been
     superseded declines to write, which matters here because the tab is
     mounted with whichever player the reader opened last. */
  const load = useCallback(
    async (live: () => boolean) => {
      if (!team || season === null) {
        if (live()) setSlots(null);
        return null;
      }

      const { data, error } = await supabase
        .from('team_depth')
        .select('slot, depth, injury_status, player_id, teams!inner(abbreviation), players(full_name)')
        .eq('teams.abbreviation', team.toUpperCase())
        .eq('season', season)
        .order('depth', { ascending: true });
      if (error) return error.message;
      if (!live()) return null;

      const bySlot = new Map<string, DepthEntry[]>();
      for (const row of (data ?? []) as unknown as Row[]) {
        const list = bySlot.get(row.slot) ?? [];
        list.push({
          playerId: row.player_id,
          name: row.players?.full_name ?? 'Unknown',
          depth: row.depth,
          injuryStatus: row.injury_status,
        });
        bySlot.set(row.slot, list);
      }

      setSlots(
        [...bySlot.entries()]
          .map(([slot, players]) => ({
            slot,
            players: [...players].sort((a, b) => a.depth - b.depth),
          }))
          .sort((a, b) => slotWeight(a.slot) - slotWeight(b.slot) || a.slot.localeCompare(b.slot)),
      );
      return null;
    },
    [team, season],
  );

  const { loading, error, refresh } = useLoader(load);
  return { slots, loading, error, refresh };
}
