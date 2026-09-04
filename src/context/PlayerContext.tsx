/**
 * The signed-in player's headline state: coins, roster and identity.
 *
 * Lives in context because the header renders on every tab — without this each
 * screen would fetch the balance separately and they would drift apart after a
 * pack opening.
 *
 * THE RUN USED TO BE HERE and is not any more. Hearts were the second resource
 * this game asked a player to spend, so they were loaded on the same event as
 * the balance and drawn in the same strip of chrome. The mechanic is gone (see
 * the migration `the_run_stops_asking_for_hearts`) and with it the only reader
 * — so the `my_run` call went too rather than being left to warm a field
 * nothing draws. Coins are the one currency in the chrome now.
 *
 * ---------------------------------------------------------------------------
 * THE ROSTER IS HERE TOO, AND IT REPLACED A SECOND COUNT OF THE SAME ROWS
 * ---------------------------------------------------------------------------
 *
 * `cardCount` used to be its own `count(*) where is_held` from this file, and
 * the cap warning was a separate `useRoster()` hook that re-read `roster_status`
 * ON FOCUS and nowhere else. Two reads of one number, refreshed on two
 * different schedules — and the schedules were the bug. Selling six cards
 * refreshes this context, so the header's count moved; nothing touched the
 * hook, so the bar under it went on saying "36/30 — commit or sell 6" over a
 * collection of thirty until you left the tab and came back.
 *
 * `roster_status()` returns the count AND the cap facts in one call, so this
 * reads that instead and `cardCount` is `roster.held`. One number, one read,
 * one refresh — and every path that already calls `refresh()` after minting or
 * destroying a card (packs, the bulk bar, the card profile, the set checklist,
 * the carry claim) now updates the warning for free, because they were all
 * updating the balance beside it already.
 *
 * `applyCardDelta` is what makes it INSTANT rather than merely correct; see
 * there.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  parseRoster,
  recountRoster,
  type RosterStatus,
} from "@/components/recap/recap";
import { useAuth } from "@/context/AuthContext";
import { useLoader, type Load } from "@/hooks/use-loader";
import { supabase } from "@/lib/supabase";

export type PlayerState = {
  coins: number;
  displayName: string;
  /** Held cards. The same figure as `roster.held`, kept for the header. */
  cardCount: number;
  /**
   * Held cards against the cap, straight from `roster_status()`.
   *
   * Null only before the first load. Drawn by `RosterBar` on the collection
   * grid and on the lineup, and read by the lineup to decide whether a pick can
   * be taken at all — see `LineupEditor`.
   */
  roster: RosterStatus | null;
  /**
   * TODAY'S FREE PACK IS STILL THERE.
   *
   * The one piece of this state that is not a balance, and it is here for the
   * same reason the balances are: the CHROME reads it. `FantasyTopNav` puts a
   * dot on the board that owns the shop, so a free pack is news that finds the
   * player from any Yap screen rather than a thing they have to go and look up.
   *
   * ASKED OF THE SERVER, never worked out from what has been opened.
   * "Today" is a UTC day with a definition (`daily_pack_status`), and the
   * client does not get to hold a second opinion about when it rolls over —
   * the same rule the pack shelf follows for the same figure.
   *
   * FALSE ON FAILURE, not null. A badge is a promise that something is waiting;
   * an unanswered question is not a promise, and a dot nobody can cash is worse
   * than no dot. It also means every caller can treat this as a plain boolean.
   */
  dailyPack: boolean;
  loading: boolean;
  error: string | null;
  /** Call after anything that spends or earns coins, or moves a heart. */
  refresh: () => Promise<void>;
  /**
   * Move the held-card count NOW, by this many, without waiting for a read.
   *
   * WHY IT EXISTS. A sale is two round trips before the screen can be right:
   * `sell_cards` returns, then `refresh()` re-reads. For the half-second in
   * between the header still shows the old total and — far more visibly — the
   * roster bar still says "6 over the limit, commit or sell 6" to somebody who
   * has just sold six. The action looks like it did not work.
   *
   * The server has already SAID how many it took, in the same answer that
   * proves the sale happened, so there is nothing to guess: apply it, then let
   * the `refresh()` that every one of these paths already awaits overwrite it
   * with the count of record. See `recountRoster` for why an echo is allowed to
   * exist and what stops it becoming an authority.
   *
   * CALL IT WITH WHAT THE SERVER REPORTED, never with what was asked for. A
   * bulk sale of twelve that skipped four moved the roster by eight, and
   * `sell_cards` hands back the eight.
   *
   * A no-op before the first load: with no roster there is nothing to adjust
   * and the read on its way will be right anyway.
   */
  applyCardDelta: (n: number) => void;
};

/**
 * Exported so the dev galleries can supply a fixture player without a session.
 * The whole shell — rail, header, coin balance — reads this, so there is no way
 * to render the chrome for design work without either signing in or providing
 * the context directly. Product code should use <PlayerProvider>.
 */
export const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [coins, setCoins] = useState(0);
  const [displayName, setDisplayName] = useState("player");
  const [roster, setRoster] = useState<RosterStatus | null>(null);
  const [dailyPack, setDailyPack] = useState(false);

  const load = useCallback<Load>(
    async (live) => {
      if (!session) return;
      /**
       * THE `profiles` FILTER IS NOT REDUNDANT, AND ASSUMING IT WAS BROKE THE
       * HEADER FOR EVERY PLAYER.
       *
       * These three reads used to go out unfiltered, on the stated grounds that
       * "all three are RLS-scoped to the caller". Two of them are.
       * `coin_balances` and `card_instances` both have policies of the form
       * `auth.uid() = user_id`, so an unfiltered select returns exactly the
       * caller's row and `.single()` is honest.
       *
       * `profiles` does not. Its SELECT policy is a flat `true` — deliberately,
       * because the leaderboards render other players' names and cannot do that
       * if a profile is only visible to its owner. So an unfiltered select
       * returns EVERY profile, and `.single()` on nine rows is a PostgREST 406
       * (`PGRST116: cannot coerce the result to a single JSON object`).
       *
       * It worked exactly as long as the table had one row in it. The moment a
       * second person signed up it broke for everybody at once, and it broke
       * quietly: the failure is swallowed into `error`, the state keeps its
       * initial values, and the rail and the header settle on "player" and a
       * balance of 0. It reads as data that will not save rather than data that
       * will not load — a display name change DOES land, and then the chrome
       * goes on showing the old default, so the natural conclusion is that the
       * save failed.
       *
       * The lesson is in the shape, not the query: RLS scoping is a per-table
       * fact, so a comment claiming it for a batch is a claim about tables it
       * has not checked.
       */
      const [profile, balance, rosterRow, dailyRow] = await Promise.all(
        [
          supabase
            .from("profiles")
            .select("display_name")
            .eq("id", session.user.id)
            .single(),
          supabase.from("coin_balances").select("balance").single(),
          /* THE COUNT AND THE CAP IN ONE CALL. This was a `count(*)` on
           `card_instances where is_held` and the cap facts were a second read
           from a hook of their own — see the note at the top of this file for
           what having two of them cost.

           `is_held` is still the predicate; it is `roster_status()` applying it
           now. A sold copy is still your row and a committed one is too, so an
           unfiltered count made the header's total drift upward every time
           somebody cleared a duplicate. The generated column is the same one
           `my_collection` filters on, so the grid and the header cannot
           disagree about how many cards you have. */
          supabase.rpc("roster_status"),
          /* Whether today's free pack is unclaimed. See `dailyPack` on
           `PlayerState`; the pack shelf asks the same question of the same
           RPC, and neither of them counts openings to answer it. */
          supabase.rpc("daily_pack_status"),
        ],
      );
      if (!live()) return;
      const failure =
        profile.error ?? balance.error ?? rosterRow.error;
      if (failure) return failure.message;
      setDisplayName(profile.data?.display_name ?? "player");
      setCoins(balance.data?.balance ?? 0);
      setRoster(parseRoster(rosterRow.data));
      /* NOT IN `failure` ABOVE, deliberately. The three reads before it are the
         chrome — a header with no balance is broken and should say so. This one
         decorates a nav item, so a failure costs an absent dot and must not
         blank the masthead behind it. */
      setDailyPack(
        dailyRow.error
          ? false
          : (dailyRow.data as { available?: boolean } | null)?.available ===
              true,
      );
    },
    [session],
  );

  const { loading, error, refresh } = useLoader(load);

  /* The optimistic move. See `applyCardDelta` on `PlayerState` for why it is
     allowed, and `recountRoster` for what stops it becoming an authority — the
     whole of the arithmetic lives there, beside `parseRoster`, so this and the
     server cannot come to disagree about what "near the cap" means. */
  const applyCardDelta = useCallback((n: number) => {
    if (n === 0) return;
    setRoster((held) => (held ? recountRoster(held, held.held + n) : held));
  }, []);

  const value = useMemo<PlayerState>(
    // Without a session there is nothing to read and nothing true to show, so
    // this stays loading — the header draws an em dash rather than a confident
    // balance of zero, which is what it did before the read was extracted.
    () => ({
      coins,
      displayName,
      cardCount: roster?.held ?? 0,
      roster,
      dailyPack,
      loading: loading || !session,
      error,
      refresh,
      applyCardDelta,
    }),
    [
      coins,
      displayName,
      roster,
      dailyPack,
      loading,
      error,
      refresh,
      applyCardDelta,
      session,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}
