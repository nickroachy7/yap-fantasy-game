/**
 * The contests on this week's slate, and which of them you are in.
 *
 * ONE RPC, and it has to be one: two of the three facts a lobby row shows are
 * things the caller cannot read for themselves. How full a contest is means
 * counting OTHER people's lineups, which the RLS policy on `lineups` hides, and
 * whether you can afford it means reading a wallet against a fee. A plain
 * PostgREST select would return a lobby where every contest looked empty.
 *
 * `contest_lobby()` is SECURITY DEFINER for exactly that reason and returns
 * only aggregates — a count and a boolean — never anybody else's rows.
 *
 * NOT SESSION-CACHED, unlike the collection and the sets. Those answer "what do
 * I own", which changes only when you act; this answers "what is open, how full
 * is it, can I afford it", which changes when a WEEK rolls over and when other
 * people enter. It reloads on focus, which is cheap at this size and cannot go
 * stale in the direction that matters — showing a seat that is already taken.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

export type Contest = {
  id: string;
  code: string;
  kind: 'free' | 'lobby';
  name: string;
  formatCode: string;
  formatName: string;
  /** How many cards the format asks for. Drawn as "3 cards". */
  slotCount: number;
  entryFeeGems: number;
  maxEntrants: number | null;
  entrants: number;
  season: number;
  seasonType: number;
  week: number;
  /**
   * Your entry, or null.
   *
   * `filled` is slots occupied, NOT whether the lineup is legal — a seven of
   * eight lineup is a real thing this game lets you file, and the row has to be
   * able to say so.
   */
  mine: { lineupId: string; filled: number } | null;
  /** True when you are already in, or hold the fee. */
  affordable: boolean;
};

type Row = {
  id: string;
  code: string;
  kind: 'free' | 'lobby';
  name: string;
  format_code: string;
  format_name: string;
  slot_count: number;
  entry_fee_gems: number;
  max_entrants: number | null;
  entrants: number;
  season: number;
  season_type: number;
  week: number;
  my_lineup_id: string | null;
  my_filled: number;
  affordable: boolean;
};

export type ContestsState = {
  contests: Contest[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useContests(): ContestsState {
  const [contests, setContests] = useState<Contest[] | null>(null);

  const load = useCallback<Load>(async (live) => {
    const { data, error } = await supabase.rpc('contest_lobby');
    if (!live()) return null;
    if (error) return error.message;

    setContests(
      ((data ?? []) as Row[]).map((r) => ({
        id: r.id,
        code: r.code,
        kind: r.kind,
        name: r.name,
        formatCode: r.format_code,
        formatName: r.format_name,
        slotCount: Number(r.slot_count),
        entryFeeGems: r.entry_fee_gems,
        maxEntrants: r.max_entrants,
        entrants: Number(r.entrants ?? 0),
        season: r.season,
        seasonType: r.season_type,
        week: r.week,
        mine: r.my_lineup_id
          ? { lineupId: r.my_lineup_id, filled: Number(r.my_filled ?? 0) }
          : null,
        affordable: r.affordable,
      })),
    );
    return null;
  }, []);

  const { loading, error, reload } = useLoader(load);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { contests, loading, error, reload };
}
