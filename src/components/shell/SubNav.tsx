/**
 * Sub-navigation for a section that has more than one page.
 *
 * On mobile these are one tab with a segmented control, because five bottom
 * tabs is already the limit and eight would be unusable. On a wide window they
 * are real rows in the sidebar, so this renders nothing — showing both would
 * put the same navigation on screen twice.
 */
import { usePathname, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { SegmentedControl, type Segment } from '@/components/shell/SegmentedControl';
import { useIsWide } from '@/components/shell/useResponsive';
import { Spacing } from '@/constants/theme';

export function SubNav({ segments }: { segments: Segment<string>[] }) {
  const isWide = useIsWide();
  const router = useRouter();
  const pathname = usePathname();

  if (isWide) return null;

  return (
    <View style={styles.wrap}>
      <SegmentedControl
        segments={segments}
        value={pathname}
        // replace, not push: these are peers, and pushing would build a back
        // stack of every toggle between them.
        onChange={(next) => router.replace(next as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
});
