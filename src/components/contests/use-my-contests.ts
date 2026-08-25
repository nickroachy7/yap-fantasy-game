/**
 * The contests you are IN this week, each with its own field.
 *
 * One row per card in the carousel, in the order the carousel draws them: the
 * free contest first, because it is the one nobody chose to be in and the one
 * with the season riding on it.
 *
 * The `field` here is deliberately NOT `median_record`'s. That function is
 * free-contest-only and must stay that way — the season's opponent cannot move
 * when somebody opens a side contest — so `my_contest_cards()` computes a
 * distribution per contest instead. Same shape, different question. See
 * `20260825070000`.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';
import type { FieldWeek } from '@/components/lineup/field';

export type MyContest = {
  id: string;
  code: string;
  kind: 'free' | 'lobby';
  name: string;
  formatCode: string;
  formatName: string;
  slotCount: number;
  entryFeeGems: number;
  /**
   * Null while the entry is being COMPOSED — the contest is chosen and no
   * lineup exists yet, because the fee is taken by the first submission.
   * The board reads it to know whether it is entering or editing.
   */
  lineupId: string | null;
  /** Slots occupied, not whether the lineup is legal. */
  filled: number;
  /** This contest's own distribution, shaped for `ContestCard`. */
  field: FieldWeek;
  /**
   * Hearts a loss here costs the run, and hearts a win heals.
   *
   * THE FREE CONTEST'S CARD IS THE ONLY PLACE ITS STAKE IS EVER DRAWN. The
   * lobby list filters the free contest out — nobody chose it and nobody can
   * leave it — so without this the game's main contest would be the one that
   * could end a run without saying so anywhere.
   */
  heartsAtRisk: number;
  heartsOnWin: number;
};

type Row = {
  hearts_at_risk: number;
  hearts_on_win: number;
  contest_id: string;
  code: string;
  kind: 'free' | 'lobby';
  name: string;
  format_code: string;
  format_name: string;
  slot_count: number;
  entry_fee_gems: number;
  week: number;
  lineup_id: string | null;
  filled: number;
  entrants: number | string;
  low: number | string | null;
  median: number | string | null;
  average: number | string | null;
  high: number | string | null;
  final: boolean | null;
  my_points: number | string | null;
  my_rank: number | string | null;
  ahead: number | string | null;
  result: string | null;
};

/**
 * numeric(10,2) and bigint both arrive as strings depending on how the driver
 * renders them, and a string here silently breaks every comparison the card
 * makes — the same trap `parseFieldWeeks` documents.
 */
const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export type MyContestsState = {
  contests: MyContest[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useMyContests(includeCode?: string): MyContestsState {
  const [contests, setContests] = useState<MyContest[] | null>(null);

  const load = useCallback<Load>(async (live) => {
    /* `includeCode` is the contest being COMPOSED — chosen from the lobby, not
       yet entered, because the fee lands on the first submission rather than on
       a separate entry step. Without it the carousel cannot show the card the
       reader just tapped. See `20260825080000`. */
    const { data, error } = await supabase.rpc('my_contest_cards', {
      p_include: includeCode ?? undefined,
    });
    if (!live()) return null;
    if (error) return error.message;

    setContests(
      ((data ?? []) as Row[]).map((r) => ({
        id: r.contest_id,
        code: r.code,
        kind: r.kind,
        name: r.name,
        formatCode: r.format_code,
        formatName: r.format_name,
        slotCount: Number(r.slot_count),
        entryFeeGems: r.entry_fee_gems,
        lineupId: r.lineup_id,
        filled: Number(r.filled ?? 0),
        field: {
          week: Number(r.week),
          entrants: Number(r.entrants ?? 0),
          low: num(r.low) ?? 0,
          median: num(r.median) ?? 0,
          average: num(r.average) ?? 0,
          high: num(r.high) ?? 0,
          final: Boolean(r.final),
          myPoints: num(r.my_points),
          myRank: num(r.my_rank),
          ahead: num(r.ahead),
          result: (r.result as FieldWeek['result']) ?? null,
        },
        heartsAtRisk: Number(r.hearts_at_risk ?? 0),
        heartsOnWin: Number(r.hearts_on_win ?? 0),
      })),
    );
    return null;
  }, [includeCode]);

  const { loading, error, reload } = useLoader(load);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { contests, loading, error, reload };
}
