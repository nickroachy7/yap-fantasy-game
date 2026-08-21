/**
 * The Yap mark.
 *
 * Ported from the site this app replaces (sleeper-yap-bot's `web/app`), where
 * it was inline SVG for a reason worth keeping: it is two-tone BY SUBTRACTION.
 * The lime shapes have the ground punched back through them for the bot's face
 * slots and the counters in the A and the P. Flattened to an image those
 * cutouts freeze to one hardcoded near-black, and the logo grows a visible dark
 * rectangle the moment it sits on anything but that exact colour — which in
 * this app is most places, since the rail, the sheets and the page are four
 * different darks.
 *
 * So `ink` is a prop, defaulted but always worth passing: give it the colour of
 * the surface you are drawing on and the cutouts disappear into it.
 *
 * TWO LOCKUPS, AND THE CHOICE IS ABOUT WIDTH, NOT IMPORTANCE. `YapLogo` is the
 * bot over the YAP wordmark; `YapMark` is the bot alone, for anywhere the
 * wordmark would set below about 60pt and stop being legible — a rail collapsed
 * to icons, an avatar, a tab.
 *
 * Sized by HEIGHT. Both lockups have a fixed aspect ratio, and height is the
 * dimension that actually has to agree with the type beside it; asking callers
 * for a width instead would make every one of them do the same division.
 *
 * The path data is not hand-copied. It was lifted mechanically out of the old
 * component (see `scripts/render-brand.mjs`, which re-reads THIS file for the
 * raster assets) — the same discipline the old repo used, for the same reason:
 * a mark transcribed by hand is a mark that silently drifts.
 */
import Svg, { Path } from 'react-native-svg';

import { Brand } from '@/constants/theme';

/**
 * Aspect ratios, baked from the viewBoxes below so callers only pass height.
 */
const LOCKUP_RATIO = 1.597923;
const MARK_RATIO = 1.535826;

/**
 * NEVER LET THE MARK SHRINK.
 *
 * On web this component renders a bare <svg>, which does NOT pick up React
 * Native Web's reset — so it lands in a flex column as a plain CSS flex item,
 * where `flex-shrink` defaults to 1. The moment that column overflows (a short
 * browser window on the login screen, which is exactly where the mark is
 * biggest) the browser resolves the overflow by shrinking its children, and the
 * SVG is the one child with no intrinsic minimum: it collapses to height 0 and
 * the logo silently disappears. It measured 82.9x0 in production before this.
 *
 * Native never had the problem — RN's own default is `flexShrink: 0` — which is
 * precisely why it has to be stated here rather than left to the platform.
 */
const NO_SHRINK = { flexShrink: 0 } as const;

type LogoProps = {
  /** Height in points. Width follows from the lockup's own ratio. */
  height?: number;
  /** The lime. Only override this for a one-tone treatment. */
  color?: string;
  /** The colour of the surface behind the mark — see the header. */
  ink?: string;
};

/** Bot mark stacked over the YAP wordmark — the full lockup. */
export function YapLogo({ height = 28, color = Brand.lime, ink = Brand.ink }: LogoProps) {
  return (
    <Svg
      width={height * LOCKUP_RATIO}
      height={height}
      style={NO_SHRINK}
      viewBox="494 687 1077 674"
      accessibilityRole="image"
      accessibilityLabel="Yap">
      <Path fill={color} d={BOT} />
      <Path fill={ink} d={BOT_FACE} />
      <Path fill={color} d={WORDMARK_Y} />
      <Path fill={color} d={WORDMARK_A} />
      <Path fill={ink} d={WORDMARK_A_COUNTER} />
      <Path fill={color} d={WORDMARK_P} />
      <Path fill={ink} d={WORDMARK_P_COUNTER} />
    </Svg>
  );
}

/** Mark only, for places too tight for the wordmark. */
export function YapMark({ height = 20, color = Brand.lime, ink = Brand.ink }: LogoProps) {
  return (
    <Svg
      width={height * MARK_RATIO}
      height={height}
      style={NO_SHRINK}
      viewBox="776 687 493 321"
      accessibilityRole="image"
      accessibilityLabel="Yap">
      <Path fill={color} d={BOT} />
      <Path fill={ink} d={BOT_FACE} />
    </Svg>
  );
}

/* The artwork. Absolute M/L/C/z only — see the header on why it is not retyped. */

const BOT =
  'M 1017.1 687.445 C 1031.6 687.424 1046.1 688.292 1060.5 690.045 C 1131.66 699.237 1207.05 745.866 1252.43 801.755 C 1263.12 814.927 1271.79 833.755 1268.54 850.563 C 1263.01 879.179 1219.55 921.021 1197.34 936.555 C 1130.94 983.003 1049.25 1002.27 969.772 990.027 C 949.987 986.408 937.056 982.886 917.871 977.083 C 885.799 1000.92 858.362 1007.08 819.652 1007.11 C 821.822 1005.54 823.967 1003.93 826.084 1002.28 C 846.394 986.424 853.362 968.064 856.414 943.449 C 848.592 937.942 841.044 932.058 833.795 925.816 C 817.096 911.21 776.794 871.47 776.051 849.627 C 775.35 829 796.453 798.258 810.374 783.848 C 870.225 721.892 931.172 691.42 1017.1 687.445 z';

const BOT_FACE =
  'M 1012.9 729.78 L 1028.22 729.907 L 1028.15 748.01 C 1041.64 748.016 1055.51 749.123 1068.96 750.131 L 1068.83 730.553 L 1084.19 730.371 L 1084.27 752.662 C 1094.3 753.841 1103.97 755.92 1113.8 758.14 L 1113.72 738.164 L 1129.11 738.447 L 1129.17 762.119 C 1138.74 765.265 1156.9 769.304 1157.22 781.664 C 1151.11 790.479 1137.75 785.017 1129.69 782.307 L 1129.64 800.37 L 1114.06 800.377 L 1114.09 778.096 C 1103.61 775.737 1094.69 774.051 1084.13 772.272 L 1084.3 792.985 L 1068.94 792.922 L 1068.94 770.155 C 1055.41 768.689 1041.81 767.942 1028.2 767.917 L 1028.3 787.25 C 1028.37 789.637 1028.37 789.513 1027.64 791.793 C 1024 794 1017.26 793.108 1012.7 792.945 L 1012.8 767.88 C 999.806 767.78 986.697 769.065 973.759 770.218 L 973.668 792.483 L 957.77 792.494 L 957.736 773.214 C 949.489 774.811 935.318 777.449 927.82 780.818 L 927.812 800.979 L 912.472 800.999 C 912.498 796.639 912.919 791.685 911.547 787.683 C 904.812 788.081 896.095 789.927 892.445 783.283 C 892.804 771.901 903.351 769.782 912.082 766.555 L 912.775 738.476 L 927.936 738.312 L 928.039 761.084 C 938.801 758.092 946.736 755.996 957.795 753.924 L 957.798 731.335 L 973.693 731.387 L 973.788 751.324 C 985.58 749.614 1001.01 748.441 1012.83 747.982 L 1012.9 729.78 z';

const WORDMARK_Y =
  'M 772.831 1055.21 C 813.885 1054.55 860.731 1054.41 901.704 1055.25 C 895.373 1065.6 878.91 1086.24 871.17 1096.44 L 811.226 1175.07 C 797.54 1193.44 764.574 1232.31 754.61 1249.83 C 753.855 1283.04 755.605 1327.92 752.91 1359.7 C 722.542 1361.24 679.093 1359.84 647.685 1359.84 C 645.835 1329.37 647.103 1282.2 647.018 1250.17 C 640.079 1238.09 621.746 1217.6 608.775 1201.17 C 572.149 1154.79 530.812 1106.13 494.861 1058.93 C 494.771 1057.68 494.682 1056.42 494.592 1055.17 C 538.162 1054.33 584.228 1055.06 627.974 1055.05 C 651.883 1088.02 677.742 1118.95 701.893 1152.91 C 713.515 1139.21 724.992 1122.66 735.548 1107.94 C 748.225 1090.54 760.654 1072.96 772.831 1055.21 z';

const WORDMARK_A =
  'M 927.916 1055.07 L 1060.14 1055.05 C 1105.67 1153.07 1147.11 1253.75 1191 1352.55 C 1192.25 1355.36 1192.38 1356.13 1191.58 1358.92 C 1183.66 1360.28 1162.11 1359.8 1152.97 1359.81 L 1081.97 1359.85 C 1075.51 1348.5 1069.76 1331.68 1062.82 1319.95 C 1061.37 1317.48 1061.43 1317.99 1059 1317.44 C 1014.19 1318.21 967.693 1317.7 922.75 1317.77 C 915.93 1331.65 909.32 1345.63 902.924 1359.71 C 886.476 1360.33 865.569 1359.48 848.946 1359.85 C 839.164 1360.07 802.683 1360.69 794.716 1358.51 C 793.668 1355.76 794.123 1354.98 795.636 1351.46 C 808.9 1320.59 823.121 1289.66 836.758 1258.98 L 927.916 1055.07 z';

const WORDMARK_A_COUNTER =
  'M 992.446 1148.43 C 993.532 1149.01 995.852 1150.17 996.375 1151.41 C 1008.71 1180.57 1021.32 1209.93 1033.61 1239.09 L 994.5 1239.15 L 951.968 1239.15 C 966.358 1210.34 978.443 1177.31 992.446 1148.43 z';

const WORDMARK_P =
  'M 1202.95 1055.01 L 1356.12 1055.07 C 1401.85 1055.03 1446.33 1050.79 1489.67 1068.12 C 1549.53 1092.07 1570.64 1160.23 1545.41 1217.24 C 1531.2 1249.34 1505.77 1266.27 1474.04 1278.34 C 1440.13 1288.36 1417.18 1286.09 1382.34 1286.11 L 1311.27 1286.16 C 1311.34 1309.76 1311.95 1336.32 1310.83 1359.58 C 1300.19 1360.25 1284.81 1359.83 1273.67 1359.84 L 1205.83 1359.76 C 1204.19 1259.17 1202.89 1155.53 1202.95 1055.01 z';

const WORDMARK_P_COUNTER =
  'M 1353.15 1143.5 C 1370.01 1143.5 1413.57 1140.99 1427.46 1144.61 C 1467.02 1154.91 1458.21 1201.84 1411.25 1201.87 L 1310.08 1201.94 C 1309.79 1182.55 1309.67 1163.16 1309.72 1143.77 L 1353.15 1143.5 z';
