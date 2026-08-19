/**
 * The position chips, in one place, so every board in the Players section has
 * the same control in the same spot with the same words.
 *
 * They were declared three times — the trend board, the leaders board and the
 * directory each built their own `['ALL', ...POSITION_ORDER]` row — which is
 * how two of them ended up with different accessibility labels for the same
 * chip ("All positions" against "Every position") and how a fourth board would
 * have quietly got a fifth spelling. Nothing about a position filter is
 * page-specific: the pool is always the same five positions in the same order,
 * because `POSITION_ORDER` is the order a fantasy manager thinks in.
 *
 * Search does not use it, and that is the point of the exception: there the
 * query IS the filter, and a position row under it would be a second control
 * competing with the only one that screen has.
 *
 * The value is a `PositionKey` or `ALL` rather than a free string, so a board
 * cannot filter on a position the palette has no colour for.
 */
import { Chip, ChipRow } from '@/components/ui/Chip';
import { POSITION_ORDER, type PositionKey } from '@/constants/positions';

export type PosFilter = PositionKey | 'ALL';

export const POS_FILTERS: PosFilter[] = ['ALL', ...POSITION_ORDER];

export function PositionFilter({
  value,
  onChange,
}: {
  value: PosFilter;
  onChange: (next: PosFilter) => void;
}) {
  return (
    <ChipRow>
      {POS_FILTERS.map((p) => (
        <Chip
          key={p}
          selected={value === p}
          label={p}
          onPress={() => onChange(p)}
          accessibilityLabel={p === 'ALL' ? 'All positions' : `${p} only`}
        />
      ))}
    </ChipRow>
  );
}
