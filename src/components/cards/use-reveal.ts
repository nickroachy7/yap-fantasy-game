/**
 * Which cards have been turned over, which one is in front of you, and the two
 * speeds you are allowed to do it at.
 *
 * WHY THIS IS NOT INSIDE THE DECK ANY MORE
 *
 * It was, when the deck was the whole screen. The pull page put a bar under the
 * deck whose primary button is REVEAL — so the control that turns cards over
 * and the surface that draws them turning are now two siblings, and the state
 * between them has to live above both. Lifting it is what lets the bar say
 * "3 left" without the deck telling it.
 *
 * TWO SPEEDS, AND THAT IS THE WHOLE FEATURE.
 *
 *   SLOW is one card. Swipe to it, tap it, or press the bar's button — all
 *   three do the same thing, which is turn over exactly one and stop. This is
 *   the default and it is what the ceremony is for.
 *
 *   FAST is `revealAll`, and it is a CASCADE rather than a switch. Every
 *   remaining card turns over `CASCADE_MS` after the one before it, so a player
 *   who wants the pack now still watches it happen — about half a second for
 *   five cards. Setting them all at once was the first version and it read as
 *   the screen glitching: eight cards changing on one frame is not a reveal, it
 *   is a re-render.
 *
 * THE CASCADE IS INTERRUPTIBLE AND CANNOT BE DOUBLE-STARTED. Pressing the
 * button twice, or leaving the screen mid-cascade, cancels what is still
 * pending — otherwise a timer fires into an unmounted tree, and on a fifty-card
 * bulk buy there are forty-nine of them.
 *
 * SEEKING IS A REQUEST, NOT A CALL. Moving the deck is the deck's job — it owns
 * the ScrollView and the only correct offset — so this publishes an index and a
 * token and the deck acts on it. The token is what makes "go to card 3 again"
 * (after the reader has swiped away) a fresh instruction rather than a no-op.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Pulled } from './PackShelf';

/**
 * How long the first card waits before turning itself over.
 *
 * Not zero. A card that is already face up when the page finishes opening was
 * never face down, and the whole point of the back is that you see it first.
 */
const FIRST_REVEAL_MS = 320;

/** The gap between cards in a `revealAll`. See the header. */
const CASCADE_MS = 110;

export type Reveal = {
  revealed: Set<string>;
  /** Index of the card in front of you. */
  focus: number;
  /** How many are still face down. */
  hidden: number;
  allRevealed: boolean;
  /** A cascade is running, so the bar's buttons should say so. */
  cascading: boolean;
  /** Turn over one card, by id. Idempotent. */
  reveal: (id: string) => void;
  /** The deck reports where it came to rest; the card there turns over. */
  focusAt: (index: number) => void;
  /** Ask the deck to bring a card to the middle, and turn it over. */
  goTo: (index: number) => void;
  /** Turn over the focused card, or the next face-down one after it. */
  revealNext: () => void;
  /** Turn the rest over, in a cascade. */
  revealAll: () => void;
  /** What the deck reads to know where it has been asked to go. */
  seek: { index: number; token: number } | null;
};

export function useReveal(pulled: Pulled[]): Reveal {
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [focus, setFocus] = useState(0);
  const [seek, setSeek] = useState<{ index: number; token: number } | null>(null);
  const [cascading, setCascading] = useState(false);

  /** Every pending cascade step, so it can be called off. */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancel = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);
  useEffect(() => cancel, [cancel]);

  const reveal = useCallback((id: string) => {
    setRevealed((held) => (held.has(id) ? held : new Set(held).add(id)));
  }, []);

  /* THE FIRST CARD DEALS ITSELF. Everything after it is dealt by the player —
     scrolling to it, tapping it, or pressing the bar — but something has to
     start, and a deck that sits entirely face down until you touch it reads as
     having failed to load rather than as waiting for you. */
  useEffect(() => {
    const first = pulled[0]?.card_instance_id;
    if (!first) return;
    const t = setTimeout(() => reveal(first), FIRST_REVEAL_MS);
    return () => clearTimeout(t);
  }, [pulled, reveal]);

  const focusAt = useCallback(
    (index: number) => {
      setFocus(index);
      const id = pulled[index]?.card_instance_id;
      if (id) reveal(id);
    },
    [pulled, reveal],
  );

  const goTo = useCallback(
    (index: number) => {
      /* The focus moves HERE, not when the scroll this starts eventually
         arrives. Pressing a pip is a statement about which card you want in
         front of you, and leaving it to the deck's scroll handler meant the
         panel underneath went on describing the old card for the length of a
         smooth scroll — or forever, on any platform that resolves an animated
         `scrollTo` without emitting scroll events. */
      setFocus(index);
      setSeek((held) => ({ index, token: (held?.token ?? 0) + 1 }));
      const id = pulled[index]?.card_instance_id;
      if (id) reveal(id);
    },
    [pulled, reveal],
  );

  const revealNext = useCallback(() => {
    /* The card in front of you first, then the next one down the deck. Two
       different presses in one button: on a face-down card it turns THAT one
       over, which is what the reader is looking at and expecting; on one
       already turned it moves along, which is what makes the button a way
       through the pack rather than a dead control. */
    const here = pulled[focus]?.card_instance_id;
    if (here && !revealed.has(here)) {
      reveal(here);
      return;
    }
    const next = pulled.findIndex((p, i) => i > focus && !revealed.has(p.card_instance_id));
    const wrapped = next === -1
      ? pulled.findIndex((p) => !revealed.has(p.card_instance_id))
      : next;
    if (wrapped !== -1) goTo(wrapped);
  }, [pulled, focus, revealed, reveal, goTo]);

  const revealAll = useCallback(() => {
    cancel();
    const rest = pulled.filter((p) => !revealed.has(p.card_instance_id));
    if (rest.length === 0) return;
    setCascading(true);
    rest.forEach((p, i) => {
      timers.current.push(
        setTimeout(() => {
          reveal(p.card_instance_id);
          if (i === rest.length - 1) setCascading(false);
        }, i * CASCADE_MS),
      );
    });
  }, [pulled, revealed, reveal, cancel]);

  const hidden = useMemo(
    () => pulled.reduce((n, p) => n + (revealed.has(p.card_instance_id) ? 0 : 1), 0),
    [pulled, revealed],
  );

  return {
    revealed,
    focus,
    hidden,
    allRevealed: hidden === 0 && pulled.length > 0,
    cascading,
    reveal,
    focusAt,
    goTo,
    revealNext,
    revealAll,
    seek,
  };
}
