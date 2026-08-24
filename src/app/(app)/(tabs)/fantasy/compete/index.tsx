import { LineupEditor } from '@/components/lineup/LineupEditor';

/**
 * COMPETE's landing: this week's lineup, with your contests carousel over it.
 *
 * The screen is a thin wrapper because the board is no longer only here — the
 * contest sheet edits the same lineup with the same component, and two copies
 * of eight hundred lines of swap-and-autosave logic is exactly the
 * parallel-copy problem `sections.ts` warns about, applied to the most
 * complicated screen in the game. See `LineupEditor`.
 */
export default function LineupScreen() {
  return <LineupEditor />;
}
