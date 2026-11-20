/**
 * What this browser tab did to wishes, shared by every screen that shows
 * them: the Places list and a wish's page describe one retry, or one new
 * capture, the same way. Kept in memory only; a reload starts empty, and
 * every screen still works from the server's data alone.
 */
import { useSyncExternalStore } from 'react';
import type { WishItem } from './api/things';
import { captureReadAt, isFailed } from './wishPlaces';

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const emit = () => {
  for (const fn of listeners) fn();
};

// ── Retries ────────────────────────────────────────────────────────
// Wish id → when the server put it back into `reading` (its `updated_at`
// in the retry's answer). Server time on both sides, so a reading that
// failed after it is the retry's, whatever the browser's clock says.
let retriedAt: ReadonlyMap<string, number> = new Map();

/** A retry was accepted; `wish` is the server's answer. */
export function noteRetry(wish: WishItem): void {
  const next = new Map(retriedAt);
  next.set(wish.id, Date.parse(wish.updated_at));
  retriedAt = next;
  emit();
}

/** The retries made in this tab. */
export function useRetries(): ReadonlyMap<string, number> {
  return useSyncExternalStore(subscribe, () => retriedAt);
}

/** The wish failed again after a retry made in this tab. */
export function failedAgain(w: WishItem, retries: ReadonlyMap<string, number>): boolean {
  const at = retries.get(w.id);
  const readAt = captureReadAt(w);
  return at !== undefined && isFailed(w) && readAt !== null && Date.parse(readAt) >= at;
}

// ── Captures being read ────────────────────────────────────────────
// Ids of captures saved from this tab and not yet seen finished. A capture
// is filed under Places until its reading says it is a thing, so the Places
// list watches these and says where one went.
let watched: ReadonlySet<string> = new Set();

export function watchCapture(id: string): void {
  if (watched.has(id)) return;
  watched = new Set(watched).add(id);
  emit();
}

export function unwatchCapture(id: string): void {
  if (!watched.has(id)) return;
  const next = new Set(watched);
  next.delete(id);
  watched = next;
  emit();
}

export function useWatchedCaptures(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => watched);
}

// Captures whose reading found a thing to buy: they left Places, and the
// Places list says where they went until the person dismisses it.
let movedToThings: readonly WishItem[] = [];

export function noteMovedToThings(wish: WishItem): void {
  movedToThings = [wish, ...movedToThings.filter((w) => w.id !== wish.id)];
  emit();
}

export function dismissMovedToThings(): void {
  movedToThings = [];
  emit();
}

export function useMovedToThings(): readonly WishItem[] {
  return useSyncExternalStore(subscribe, () => movedToThings);
}
