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
 * IT ALSO CARRIES THE STAKES. A contest that can end a run and one that cannot
 * are not the same product, and the difference is invisible from the fee — both
 * cost 40 gems. `hearts_at_risk`, `hearts_on_win` and the win condition come
 * down with the row so a lobby can never draw the two identically; entering
 * something that kills a run without being told it could is the worst surprise
 * this feature can hand somebody.
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

  /**
   * HOW THIS CONTEST DECIDES A WINNER. `median` is even money — you beat the
   * middle of the field or you do not. `top_n` pays only the first `winRank`
   * places, so most of its field loses, which is why a row has to say which it
   * is BEFORE a heart is committed to it.
   */
  winCondition: 'median' | 'top_n';
  /** For `top_n`: the last place that still counts as a win. */
  winRank: number | null;
  /** Hearts a loss here costs the run. 0 means it cannot end you. */
  heartsAtRisk: number;
  /** Hearts a win heals, capped at the run's maximum. */
  heartsOnWin: number;
  /** Hearts the caller's run is holding, or null before they have one. */
  myHearts: number | null;
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
  win_condition: 'median' | 'top_n';
  win_rank: number | null;
  hearts_at_risk: number;
  hearts_on_win: number;
  my_hearts: number | null;
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
        winCondition: r.win_condition,
        winRank: r.win_rank,
        heartsAtRisk: Number(r.hearts_at_risk ?? 0),
        heartsOnWin: Number(r.hearts_on_win ?? 0),
        myHearts: r.my_hearts === null || r.my_hearts === undefined ? null : Number(r.my_hearts),
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
