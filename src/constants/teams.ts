/**
 * A colour per club, for the player profile's header wash.
 *
 * WHY IT IS A CONSTANT AND NOT A COLUMN
 *
 * The `teams` table carries abbreviation, conference, division, location and
 * name — no colours, because balldontlie does not publish them. They are also
 * not data in any useful sense: they do not change between syncs, nothing
 * queries on them, and a migration to store thirty-two hex strings that only
 * the client reads would be a table doing a constant's job. So they sit beside
 * `positions.ts`, which is the same kind of thing for the same reason.
 *
 * WHAT THE WASH IS AND IS NOT
 *
 * It is ATMOSPHERE. The club is already named in the identity line under the
 * player's name, so the colour does not have to identify anybody — it has to
 * make the page feel like it belongs to a team. That matters because several
 * clubs would otherwise be indistinguishable here: eight of them are navy, and
 * normalising a navy makes it the same blue as the other seven.
 *
 * Which is why the value below is the club's MOST RECOGNISABLE colour rather
 * than its formal primary. Seattle takes action green over navy, Denver orange
 * over navy, Tennessee its light blue. Where a club's own identity is
 * genuinely monochrome — Las Vegas — that is what it gets; see `teamWash`.
 *
 * FIVE WASHES ARE STILL SHARED and that is not a bug to go fixing: ATL/HOU,
 * CIN/DEN, DET/LAC, GB/PIT and SF/TB/WSH land on the same hue once lightness is
 * normalised, because the league really does have that many reds and golds.
 * Separating them would mean either letting lightness drift — which is the
 * thing normalising exists to prevent — or assigning a club a colour it does
 * not wear. Neither is worth it for a cue the abbreviation already carries.
 */

/**
 * Most-recognisable colour per club, keyed by the abbreviation the FEED uses —
 * `teams.abbreviation`, not the one a broadcaster would print.
 *
 * Washington is `WSH`. It was written `WAS` first and the club silently got no
 * wash at all, because an unknown key returns null by design and a missing
 * colour looks exactly like a club we chose not to colour. If a club ever looks
 * plain, check its key against the table before checking anything else.
 *
 * Dallas takes its navy rather than its silver for a related reason: silver has
 * no hue to normalise, so it fell through to the neutral branch and came out
 * identical to Las Vegas. Two clubs sharing a wash is worse than Dallas being
 * blue.
 */
const TEAM_COLOR: Record<string, string> = {
  ARI: '#97233F',
  ATL: '#A71930',
  BAL: '#241773',
  BUF: '#00338D',
  CAR: '#0085CA',
  CHI: '#C83803',
  CIN: '#FB4F14',
  CLE: '#FF3C00',
  DAL: '#041E42',
  DEN: '#FB4F14',
  DET: '#0076B6',
  GB: '#FFB612',
  HOU: '#A71930',
  IND: '#002C5F',
  JAX: '#006778',
  KC: '#E31837',
  LAC: '#0080C6',
  LAR: '#FFD100',
  LV: '#A5ACAF',
  MIA: '#008E97',
  MIN: '#4F2683',
  NE: '#C60C30',
  NO: '#D3BC8D',
  NYG: '#0B2265',
  NYJ: '#125740',
  PHI: '#004C54',
  PIT: '#FFB612',
  SEA: '#69BE28',
  SF: '#AA0000',
  TB: '#D50A0A',
  TEN: '#4B92DB',
  WSH: '#5A1414',
};

function toHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue: number;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / d + 2) / 6;
  else hue = ((r - g) / d + 4) / 6;
  return [hue, s, l];
}

function toHex(hue: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + hue * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * The lightness and saturation every club's wash is forced to.
 *
 * A FIXED ALPHA OVER A RAW BRAND COLOUR DOES NOT WORK, and this is the whole
 * reason this function exists rather than the map being read directly. The
 * league spans Cincinnati's #FB4F14 and Chicago's #0B162A: at any alpha that
 * makes the navy visible against #0E1013, the orange is a traffic cone, and at
 * any alpha that tames the orange the navy is not there at all. Normalising
 * lightness first means the wash weight is one number for all thirty-two and
 * the HUE is the only thing that varies — which is the part that says Carolina
 * rather than Cincinnati.
 *
 * 0.52 is picked against `surfaceSheet` (#0E1013): bright enough that a hue
 * registers at the low alpha the wash uses, dark enough that white `Type.page`
 * over the top of it never drops out of contrast.
 */
const WASH_L = 0.52;
const WASH_S = 0.62;

/**
 * The colour to wash a club's header with, normalised — or null for a club we
 * have no colour for, which draws no wash rather than a guess.
 *
 * MONOCHROME CLUBS KEEP THEIR NEUTRAL. Las Vegas is silver and black and has no
 * hue to normalise; forcing saturation onto it would invent a colour the club
 * does not have. A desaturated wash at the same lightness is the honest answer
 * and still reads as deliberate next to the others.
 */
export function teamWash(abbreviation: string | null | undefined): string | null {
  if (!abbreviation) return null;
  const raw = TEAM_COLOR[abbreviation.toUpperCase()];
  if (!raw) return null;
  const [hue, s] = toHsl(raw);
  return toHex(hue, s < 0.12 ? 0.04 : WASH_S, WASH_L);
}
