/**
 * The caller's held-card count against the roster cap.
 *
 * REFETCHED ON FOCUS, deliberately, and this is the only interesting thing
 * here. The count moves whenever a card is minted, sold or committed — three
 * actions that live on three different screens — so a value cached for the
 * session would be stale in the exact situation the cap exists to catch: come
 * back from the packs sheet eleven cards heavier and be told you have room.
 *
 * It is one small RPC returning one small object, so re-reading it on every
 * focus is cheaper than any of the ways of being clever about invalidation, and
 * it cannot go wrong the way a cache shared between three writers can.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { parseRoster, type RosterStatus } from '@/components/recap/recap';
import { supabase } from '@/lib/supabase';

export function useRoster(): RosterStatus | null {
  const [roster, setRoster] = useState<RosterStatus | null>(null);
  // Guards against a slow answer landing after the screen has moved on.
  const token = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const mine = ++token.current;
      void (async () => {
        const { data, error } = await supabase.rpc('roster_status');
        if (error || mine !== token.current) return;
        setRoster(parseRoster(data));
      })();
      return () => {
        token.current++;
      };
    }, []),
  );

  return roster;
}
