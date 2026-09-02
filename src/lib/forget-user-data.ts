/**
 * Drop everything the app is holding about the signed-in account.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 *
 * The caches under `sessionCache` live for the life of the JS bundle, not the
 * life of a session — they are module state, so nothing about signing out
 * touches them. That is invisible while an app has one account on a device and
 * wrong the moment it has two: sign out, sign in as somebody else, and the
 * collection, the sets and the contest field are all served from memory as the
 * PREVIOUS account's, until something happens to invalidate each one.
 *
 * Not a hypothetical here — `20260825...` seeded a reviewer account precisely
 * so somebody could sign in as a second user on one device.
 *
 * ---------------------------------------------------------------------------
 * ONE PLACE, SO A NEW CACHE HAS AN OBVIOUS HOME
 * ---------------------------------------------------------------------------
 *
 * The alternative is `AuthContext` importing four invalidators and growing a
 * fifth every time somebody adds a cache — which is the shape of thing that is
 * correct on the day it is written and quietly incomplete a month later. A
 * cache of per-account data is registered here or it is a bug waiting for a
 * second account.
 *
 * WHAT IS DELIBERATELY NOT HERE: `formatSlotCache`. Contest formats are seeded
 * by migration, carry no user column and are not scoped by RLS — the same rows
 * for everyone, including a signed-out reader. Clearing it would throw away the
 * one cache that has nothing to do with who is looking.
 */
import { invalidateCollection } from '@/components/collection/use-collection';
import { invalidateSets } from '@/components/collection/use-sets';
import { invalidateContestFields } from '@/components/contests/use-contest-field';
import { invalidateLineupCollection } from '@/components/lineup/use-lineup-data';

export function forgetUserData(): void {
  invalidateCollection();
  invalidateLineupCollection();
  invalidateSets();
  invalidateContestFields();
}
