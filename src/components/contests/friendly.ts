/**
 * Contests a manager builds: the model layer. One shape, six verbs, two reads.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS AND IS NOT IN HERE
 * ---------------------------------------------------------------------------
 *
 * A friendly contest is an ordinary contest — it arrives through
 * `contest_lobby()` with every other row, it is entered with `set_lineup` and
 * left with `leave_contest`, and `contest-model` words its terms. So there is
 * no reading or entering code here at all. What is here is the four things a
 * user-authored contest has that a catalogue one does not: it gets BUILT, it
 * has a GUEST LIST, it can be JOINED with a code, and it can be CALLED OFF.
 *
 * ---------------------------------------------------------------------------
 * THE DRAFT IS VALIDATED TWICE, ON PURPOSE
 * ---------------------------------------------------------------------------
 *
 * `describeDraft` below re-implements the rules `create_friendly_contest`
 * enforces, and that duplication is deliberate rather than an oversight. The
 * server's copy is the truth — assume Charles Proxy, per `20260818010000` — and
 * it can only ever answer AFTER the press. A builder with eight controls on it
 * needs to say "that fee is too low for six slots" while the finger is still on
 * the stepper, and it needs to say it in the same words the server would.
 *
 * The rule the two copies share is stated once, here, as `FEE_FLOOR_PER_SLOT`
 * and `FEE_CEILING_PER_SLOT`. If those ever drift from the migration the
 * builder will happily submit something the server refuses — which is the
 * failure mode to prefer, because it is loud.
 *
 * ---------------------------------------------------------------------------
 * EVERY NUMBER IS RE-COERCED, for the reason `friends.ts` documents
 * ---------------------------------------------------------------------------
 *
 * These RPCs return `bigint` and `numeric` columns and both can arrive as
 * STRINGS depending on how the driver renders them. A string does not throw, it
 * formats wrong ("12" + 1 = "121"), so everything numeric goes through `num()`.
 */
import { supabase } from '@/lib/supabase';

import type { PayoutCurve, WinCondition } from './contest-model';

/* ------------------------------------------------------------------ shape */

/** A position a slot can accept. The five the card pool actually contains. */
export type SlotPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'PK';

export const POSITIONS: SlotPosition[] = ['QB', 'RB', 'WR', 'TE', 'PK'];

/** One slot of a format being built. `positions` is never empty. */
export type DraftSlot = {
  /** 1–6 characters, A–Z and 0–9. Upper-cased on the way to the server. */
  slot: string;
  positions: SlotPosition[];
};

/** Everything the builder collects, before it is a contest. */
export type ContestDraft = {
  name: string;
  slots: DraftSlot[];
  entryFee: number;
  maxEntrants: number;
  winCondition: WinCondition;
  winRank: number | null;
  winPct: number | null;
  targetPoints: number | null;
  payoutCurve: PayoutCurve;
  /** User ids to invite. Non-friends are dropped by the server, silently. */
  invite: string[];
};

/** What the server made. */
export type BuiltContest = {
  code: string;
  joinCode: string;
  name: string;
  formatCode: string;
  formatName: string;
  slots: number;
  invited: number;
  season: number;
  seasonType: number;
  week: number;
};

/** An invitation waiting on you. */
export type ContestInvite = {
  code: string;
  name: string;
  fromName: string;
  fromId: string | null;
  formatName: string;
  slotCount: number;
  entryFeeCoins: number;
  maxEntrants: number | null;
  entrants: number;
  createdAt: string;
};

/** Somebody in the room, whether or not they have filed. */
export type Member = {
  userId: string;
  name: string;
  /** False when they let themselves in with the join code. */
  invited: boolean;
  entered: boolean;
  declined: boolean;
  isOwner: boolean;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------------------------------------------ rules */

/**
 * THE FEE BAND, which is the one rule in this feature that is genuinely about
 * the economy rather than about a contest making sense.
 *
 * `20260901050000` derives both edges and `20260903180441`'s header explains
 * why a user-authored contest has to sit inside them: below the floor, losing
 * still earns coins, because `award_score_coins` pays 1.5 a point on every slot
 * of every lineup filed. A free contest a player can mint at will is that
 * faucet with the tap taken off.
 *
 * The bounds are EXCLUSIVE at both ends, matching the server's `<=` / `>=`.
 */
export const FEE_FLOOR_PER_SLOT = 10;
export const FEE_CEILING_PER_SLOT = 20;

export const feeRange = (slots: number): { min: number; max: number } => ({
  min: slots * FEE_FLOOR_PER_SLOT + 1,
  max: slots * FEE_CEILING_PER_SLOT - 1,
});

/** The middle of the band, which is what a fresh draft opens on. */
export const suggestedFee = (slots: number): number => {
  const { min, max } = feeRange(slots);
  return Math.round((min + max) / 2);
};

export const MAX_SLOTS = 10;
export const MIN_ENTRANTS = 2;
export const MAX_ENTRANTS = 64;
/** How many a manager may have running on one week. Matches the RPC. */
export const MAX_PER_WEEK = 5;

/**
 * The share of collected fees a friendly pays back out. Not a knob: the server
 * hardcodes 9000 basis points, and the tenth left behind is the sink that pays
 * for the score coins the entries mint.
 */
export const PRIZE_POOL_BPS = 9000;

/**
 * What is still wrong with a draft, in the order a builder should say it.
 *
 * Returns an empty array when the draft is buildable. Each string is a whole
 * sentence, phrased as the server phrases the same refusal, so a player never
 * meets two different wordings of one rule.
 */
export function draftProblems(d: ContestDraft): string[] {
  const p: string[] = [];
  const name = d.name.trim();

  if (name.length < 3 || name.length > 40) {
    p.push('A contest name is between 3 and 40 characters.');
  } else if (!/[\p{L}\p{N}]/u.test(name)) {
    p.push('A contest name needs at least one letter or number.');
  }

  if (d.slots.length < 1 || d.slots.length > MAX_SLOTS) {
    p.push(`A contest has between 1 and ${MAX_SLOTS} slots.`);
  }

  const names = d.slots.map((s) => s.slot.trim().toUpperCase());
  if (names.some((n) => !/^[A-Z0-9]{1,6}$/.test(n))) {
    p.push('A slot name is 1 to 6 letters or digits, like QB or FLEX1.');
  }
  if (new Set(names).size !== names.length) {
    p.push('Two slots cannot share a name.');
  }
  if (d.slots.some((s) => s.positions.length === 0)) {
    p.push('Every slot needs at least one position it accepts.');
  }
  /* `20260901050000` banned kickers outside the free contest outright — there
     are 41 kicker cards in the game against thirty-card rosters. A friendly is
     a room whose creator knows who is in it, so one is allowed and two is not. */
  if (d.slots.filter((s) => s.positions.includes('PK')).length > 1) {
    p.push('Only one slot may take a kicker — there are 41 kicker cards in the whole game.');
  }

  if (d.slots.length >= 1 && d.slots.length <= MAX_SLOTS) {
    const { min, max } = feeRange(d.slots.length);
    if (d.entryFee < min) {
      p.push(
        `A ${d.slots.length}-card contest must charge more than ${
          d.slots.length * FEE_FLOOR_PER_SLOT
        } coins, or losing it would still earn coins.`,
      );
    } else if (d.entryFee > max) {
      p.push(
        `A ${d.slots.length}-card contest must charge less than ${
          d.slots.length * FEE_CEILING_PER_SLOT
        } coins, or a Standard Pack is cheaper per card.`,
      );
    }
  }

  if (d.maxEntrants < MIN_ENTRANTS || d.maxEntrants > MAX_ENTRANTS) {
    p.push(`A contest holds between ${MIN_ENTRANTS} and ${MAX_ENTRANTS} managers.`);
  }

  switch (d.winCondition) {
    case 'top_n':
      if (!d.winRank || d.winRank < 1) p.push('Top-N needs how many places pay.');
      /* `contest_results` returns NO RESULT — no win, no loss, no payout — when
         a contest is not really a contest, and the silence arrives eleven days
         later. The server refuses this at build time and so does the builder. */
      else if (d.winRank >= d.maxEntrants) {
        p.push(
          `Top ${d.winRank}, in a room that holds ${d.maxEntrants}, pays everybody — nobody can lose it.`,
        );
      }
      break;
    case 'top_pct':
      if (!d.winPct || d.winPct < 1 || d.winPct > 99) {
        p.push('The winning share is between 1 and 99 per cent.');
      }
      break;
    case 'target':
      if (!d.targetPoints || d.targetPoints <= 0) p.push('A target contest needs a score to beat.');
      else if (d.targetPoints > 400) {
        p.push(`A target of ${d.targetPoints} points cannot be reached by any lineup.`);
      }
      break;
    case 'median':
      break;
  }

  return p;
}

/** The shape, named the way the server will name it. Purely for preview. */
export function shapeName(slots: DraftSlot[]): string {
  const order: SlotPosition[] = POSITIONS;
  const groups: { sig: string; label: string; count: number }[] = [];

  for (const s of slots) {
    const sorted = [...new Set(s.positions)].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    );
    const sig = sorted.join('/');
    const label =
      sig === 'QB/RB/WR/TE' ? 'SFLEX' : sig === 'RB/WR/TE' ? 'FLEX' : sig;
    const hit = groups.find((g) => g.sig === sig);
    if (hit) hit.count += 1;
    else groups.push({ sig, label, count: 1 });
  }

  return groups.map((g) => (g.count > 1 ? `${g.count}×${g.label}` : g.label)).join(' · ');
}

/* ------------------------------------------------------------------ verbs */

/**
 * Build one.
 *
 * THE WEEK IS NOT A PARAMETER. The server takes it from `lineup_slate()` and
 * refuses a week that has kicked off — a contest filed against the wrong slate
 * would be a wrong slate for every entry, since `set_lineup` derives its own
 * from the contest.
 */
export async function createFriendly(d: ContestDraft): Promise<BuiltContest> {
  const { data, error } = await supabase.rpc('create_friendly_contest', {
    p_name: d.name.trim(),
    p_slots: d.slots.map((s, i) => ({
      slot: s.slot.trim().toUpperCase(),
      positions: s.positions,
      ord: i + 1,
    })),
    p_entry_fee: d.entryFee,
    p_max_entrants: d.maxEntrants,
    p_win_condition: d.winCondition,
    /* NULL BECOMES UNDEFINED. PostgREST omits an undefined argument and the
       function's own DEFAULT applies; an explicit JSON null would also work,
       but the generated types describe the parameters as optional numbers and
       there is no reason to disagree with them. */
    p_win_rank: d.winRank ?? undefined,
    p_win_pct: d.winPct ?? undefined,
    p_target_points: d.targetPoints ?? undefined,
    p_payout_curve: d.payoutCurve,
    p_invite: d.invite,
  });
  if (error) throw new Error(error.message);

  const r = (data ?? {}) as Record<string, unknown>;
  return {
    code: String(r.code),
    joinCode: String(r.join_code),
    name: String(r.name),
    formatCode: String(r.format_code),
    formatName: String(r.format_name),
    slots: num(r.slots),
    invited: num(r.invited),
    season: num(r.season),
    seasonType: num(r.season_type),
    week: num(r.week),
  };
}

/**
 * Ask more people. Returns how many invitations were actually posted, which is
 * NOT always how many were asked for: the server drops ids that are not
 * accepted friends, and leaves a previous decline exactly where it is.
 */
export async function inviteToFriendly(code: string, users: string[]): Promise<number> {
  if (users.length === 0) return 0;
  const { data, error } = await supabase.rpc('invite_to_friendly', {
    p_contest_code: code,
    p_users: users,
  });
  if (error) throw new Error(error.message);
  return num(data);
}

/**
 * Let yourself in with a code.
 *
 * IT ADMITS YOU TO THE ROOM, NOT TO THE CONTEST — it writes the invite that
 * makes the row visible, and entering is still `set_lineup` with its fee. So a
 * leaked code costs its holder a look at a lobby row and nothing more.
 *
 * `joined` is false when you were already in, which is the commonest way this
 * is called: a second tap on a shared link should land you in the contest, not
 * on an error.
 */
export async function joinFriendly(
  joinCode: string,
): Promise<{ code: string; name: string; joined: boolean }> {
  const { data, error } = await supabase.rpc('join_friendly', {
    p_join_code: joinCode.trim().toUpperCase(),
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Record<string, unknown>;
  return { code: String(r.code), name: String(r.name), joined: Boolean(r.joined) };
}

/** No thanks. The row stops being offered and cannot be re-offered. */
export async function declineFriendly(code: string): Promise<void> {
  const { error } = await supabase.rpc('decline_friendly', { p_contest_code: code });
  if (error) throw new Error(error.message);
}

/**
 * Call it off. Everybody gets back what they actually paid — read from the
 * ledger per entry, not from the contest's current fee.
 *
 * Refused once any card in it has kicked off, which is the line `leave_contest`
 * draws too. After that the contest has results coming.
 */
export async function cancelFriendly(
  code: string,
): Promise<{ contest: string; refunded: number; managers: number }> {
  const { data, error } = await supabase.rpc('cancel_friendly', { p_contest_code: code });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    contest: String(r.contest),
    refunded: num(r.refunded),
    managers: num(r.managers),
  };
}

/* ------------------------------------------------------------------ reads */

/**
 * Invitations that are a to-do: on this week's slate, not declined, not yours,
 * and not already answered by entering.
 */
export async function fetchInvites(): Promise<ContestInvite[]> {
  const { data, error } = await supabase.rpc('my_friendly_invites');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    fromName: r.from_name,
    fromId: r.from_id ?? null,
    formatName: r.format_name,
    slotCount: num(r.slot_count),
    entryFeeCoins: num(r.entry_fee_coins),
    maxEntrants: r.max_entrants === null ? null : num(r.max_entrants),
    entrants: num(r.entrants),
    createdAt: r.created_at,
  }));
}

/**
 * The guest list.
 *
 * DISTINCT FROM `contest_field`, which is the SCOREBOARD and only knows about
 * lineups. This is who is in the room — including the three people who were
 * asked and have not filed yet, which is the fact a creator actually manages.
 */
export async function fetchMembers(code: string): Promise<Member[]> {
  const { data, error } = await supabase.rpc('friendly_members', { p_contest_code: code });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    name: r.name,
    invited: Boolean(r.invited),
    entered: Boolean(r.entered),
    declined: Boolean(r.declined),
    isOwner: Boolean(r.is_owner),
  }));
}
