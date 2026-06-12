/**
 * Things math (board screens 09–13): $/day amortization and lifecycle
 * status, computed client-side from OwnedItemExpanded / WishItem rows.
 * Presentation logic, deliberately not a backend endpoint — 47 items is
 * not a reporting workload.
 */
import type { OwnedItemExpanded, WishItem } from './api/things';

export type OwnedStatus = 'in use' | 'idle' | 'retired' | 'sold';

export function ownedStatus(it: OwnedItemExpanded): OwnedStatus {
  if (it.retired_at) {
    return it.condition === 'sold' ? 'sold' : 'retired';
  }
  if (it.condition === 'idle' || it.condition === 'broken') return 'idle';
  return 'in use';
}

/** Days held: acquired_on → retirement (or today). Minimum 1. */
export function daysHeld(it: OwnedItemExpanded): number | null {
  if (!it.acquired_on) return null;
  const start = new Date(it.acquired_on + 'T00:00:00').getTime();
  const end = it.retired_at ? new Date(it.retired_at).getTime() : Date.now();
  if (!Number.isFinite(start)) return null;
  return Math.max(1, Math.round((end - start) / 86400000));
}

/** Amortized cost per day, in dollars. Null without a price or date. */
export function perDay(it: OwnedItemExpanded): number | null {
  const days = daysHeld(it);
  if (days === null || it.paid_minor == null) return null;
  return it.paid_minor / 100 / days;
}

/** A wish's projected $/day over its planned horizon. */
export function wishPerDay(w: WishItem): number | null {
  if (w.target_price_minor == null || !w.planned_days) return null;
  return w.target_price_minor / 100 / w.planned_days;
}

export function fmtPerDay(v: number | null): string {
  if (v === null) return '—';
  return v >= 10 ? `$${v.toFixed(0)}/d` : `$${v.toFixed(2)}/d`;
}

export function fmtDollars(minor: number | null | undefined): string {
  if (minor == null) return '—';
  return `$${Math.round(minor / 100).toLocaleString()}`;
}

/** True when the wish is actively snoozed (date in the future). */
export function isSnoozed(w: WishItem): boolean {
  return Boolean(w.snoozed_until && w.snoozed_until > new Date().toISOString().slice(0, 10));
}

/** Class glyph for items with no image (product imagery arrives in P4). */
export function classGlyph(itemClass: string | null | undefined): string {
  switch (itemClass) {
    case 'durable':
      return '▦';
    case 'consumable':
      return '◌';
    case 'service':
      return '✦';
    case 'food_drink':
      return '◍';
    default:
      return '▢';
  }
}
