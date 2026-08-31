#!/usr/bin/env bash
# Turn one generated sheet into ready-to-paste Glyph definitions.
#
#   scripts/import-icon-sheet.sh sheet.png <keyline> name1 name2 name3 ...
#
# The icon count comes from how many names you give it. Prints the glyph
# definitions on stdout and progress on stderr, so:
#
#   scripts/import-icon-sheet.sh tiers.png portrait tier-bronze tier-silver ... > out.ts
#
# ---------------------------------------------------------------------------
# THE THREE SETTINGS THAT ARE NOT ARBITRARY
# ---------------------------------------------------------------------------
#
#   -threshold 88%   Several sheets carry a soft glow around each icon. At the
#                    obvious 50% that halo becomes solid white and the icon is
#                    traced as a blob. Sheets without a glow do not notice.
#
#   -blur 0x3        Applied BEFORE the threshold, after upscaling. Threshold
#                    first and potrace faithfully traces the pixel staircase:
#                    1174 coordinates for a heart instead of 70.
#
#   -extent max(w,h) NOT `-extent 1:1`, which crops to the SMALLER dimension
#                    and silently shaved the edges off the two widest glyphs in
#                    the heart set. Everything still validated, because a
#                    clipped icon is still a centred icon of the right size.
set -euo pipefail

sheet="${1:?usage: import-icon-sheet.sh <sheet.png> <keyline> <name>...}"
keyline="${2:?keyline: square|circle|portrait|landscape|diagonal}"
shift 2
names=("$@")
count=${#names[@]}
[ "$count" -gt 0 ] || { echo "give at least one glyph name" >&2; exit 1; }

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

node "$root/scripts/split-icon-row.mjs" "$sheet" "$count" > "$work/geom"

i=0
while read -r geom; do
  n="${names[$i]}"
  magick "$sheet" -crop "$geom" +repage \
    -colorspace gray -resize 1600x1600 -blur 0x3 -threshold 88% \
    -trim +repage -bordercolor black -border 8% \
    -background black -gravity center \
    -extent "%[fx:max(w,h)]x%[fx:max(w,h)]" -negate "$work/$n.pbm"
  potrace -s --alphamax 1.0 --opttolerance 0.6 -t 12 -o "$work/$n.svg" "$work/$n.pbm"
  node "$root/scripts/flatten-svg-path.mjs" "$work/$n.svg" "$keyline" > "$work/$n.flat.svg" 2>/dev/null
  node "$root/scripts/svg-to-glyph.mjs" "$work/$n.flat.svg" "$n" "$keyline" 2>/dev/null
  echo "  $n" >&2
  i=$((i + 1))
done < "$work/geom"
