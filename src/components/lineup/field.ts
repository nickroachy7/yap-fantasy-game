/**
 * The opponent.
 *
 * Every manager plays the same fixture every week: the FIELD's median score.
 * There are no pairings, no schedule and no byes — half the base beats the
 * middle and half does not, which is what makes a W mean something without any
 * of the machinery a head-to-head league needs.
 *
 * All of it comes from one RPC (`median_record`), which returns a row per week:
 * the field's aggregates plus the caller's own line. It is one round trip for
 * the whole season, so the current week's opponent and the season record are
 * the same read.
 *
 * WHY THE MEDIAN AND NOT THE AVERAGE lives in the migration's header, where the
 * arithmetic is. The short version: the left tail of a weekly score
 * distribution is dormant accounts, and a mean scored against them would let
 * two thirds of the active base "beat the community" every week.
 */
import { useCallback, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

/** 'W' | 'L' | 'T' once the week is final; null while it is still being played. */
export type Result = 'W' | 'L' | 'T';

export type FieldWeek = {
  week: number;
  entrants: number;
  /**
   * The worst and best scores in the field — the two ends of the contest card's
   * bar. The caller is IN the field, so `low <= myPoints <= high` always holds
   * for anybody who entered, which is what lets the bar place them without
   * clamping.
   */
  low: number;
  /** What you are scored against, and the mark on that bar. */
  median: number;
  /** Context only, never the opponent. See the header. */
  average: number;
  high: number;
  /** Every fixture in the week is complete. Until then there is no result. */
  final: boolean;
  /** Null when you had no lineup that week. */
  myPoints: number | null;
  myRank: number | null;
  /** Entrants you are STRICTLY ahead of. Ties count for neither side. */
  ahead: number | null;
  result: Result | null;
};

export type Record_ = { wins: number; losses: number; ties: number };

/**
 * numeric(10,2) and bigint both arrive as strings depending on how the driver
 * renders them, and a string here silently breaks every comparison below —
 * the same trap `normaliseEntries` documents on the leaderboard.
 */
type Row = {
  week: number | string;
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

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export function parseFieldWeeks(rows: Row[] | null | undefined): FieldWeek[] {
  return (rows ?? []).map((r) => ({
    week: Number(r.week),
    entrants: Number(r.entrants),
    low: num(r.low) ?? 0,
    median: num(r.median) ?? 0,
    average: num(r.average) ?? 0,
    high: num(r.high) ?? 0,
    final: Boolean(r.final),
    myPoints: num(r.my_points),
    myRank: num(r.my_rank),
    ahead: num(r.ahead),
    result: r.result === 'W' || r.result === 'L' || r.result === 'T' ? r.result : null,
  }));
}

/**
 * The season record.
 *
 * Only FINAL weeks count, which the server has already decided — a week still
 * being played returns a null result, so a live Sunday never briefly shows as a
 * loss because the late games have not kicked off.
 */
export function recordOf(weeks: FieldWeek[]): Record_ {
  return weeks.reduce<Record_>(
    (acc, w) => ({
      wins: acc.wins + (w.result === 'W' ? 1 : 0),
      losses: acc.losses + (w.result === 'L' ? 1 : 0),
      ties: acc.ties + (w.result === 'T' ? 1 : 0),
    }),
    { wins: 0, losses: 0, ties: 0 },
  );
}

/** "4-3" or "4-3-1" — the tie count is dropped when there are none, as it is
 *  in every sport that keeps one. */
export function recordLabel(r: Record_): string {
  return r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

/**
 * The smallest field that has a middle somebody can be on one side of. Mirrors
 * the same guard in `median_record`, which is where it is enforced — this is
 * what lets the card say WHY there is no opponent yet rather than drawing a
 * contest against a median of one.
 */
export const MIN_ENTRANTS = 2;

export type FieldData = {
  weeks: FieldWeek[];
  /** The week the lineup screen is on, if the field has reached it yet. */
  current: FieldWeek | null;
  record: Record_;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * Keyed on the slate's VALUES rather than the object: the lineup screen rebuilds
 * its slate on every countdown tick, so depending on the object itself would
 * refetch this once a second — the same trap `useSlateGames` documents.
 */
export function useFieldRecord(
  slate: { season: number; season_type: number; week: number } | null,
): FieldData {
  const [weeks, setWeeks] = useState<FieldWeek[]>([]);

  const season = slate?.season ?? null;
  const seasonType = slate?.season_type ?? null;
  const week = slate?.week ?? null;

  const load = useCallback<Load>(
    async (live) => {
      if (season === null || seasonType === null) return;
      const { data, error } = await supabase.rpc('median_record', {
        p_season: season,
        p_season_type: seasonType,
      });
      if (!live()) return;
      if (error) return error.message;
      setWeeks(parseFieldWeeks(data as Row[] | null));
    },
    [season, seasonType],
  );

  const { loading, error, refresh } = useLoader(load);

  return {
    weeks,
    current: week === null ? null : (weeks.find((w) => w.week === week) ?? null),
    record: recordOf(weeks),
    loading: season !== null && loading,
    error,
    reload: refresh,
  };
}
