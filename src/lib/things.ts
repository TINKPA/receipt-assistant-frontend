/**
 * Things math (board screens 09–13): $/day amortization and lifecycle
 * status, computed client-side from OwnedItemExpanded / WishItem rows.
 * Presentation logic, deliberately not a backend endpoint — 47 items is
 * not a reporting workload.
 */
import type { OwnedItemExpanded, WishItem } from './api/things';
import { formatMoney } from './money';

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

/**
 * What the item cost, in the workspace base currency (#216).
 *
 * `paid_minor` is NOT that number. It is the line total in whatever
 * currency the line was recorded in — CNY for six live rows, and a points
 * code for anything award-acquired — with a scale that differs by family
 * (cash in hundredths, points in whole units). Dividing it by 100 and
 * prefixing `$`, which is what this module did, rendered an iPad mini
 * bought for CNY 4,499 as `$4,499` and summed it into a dollar total.
 *
 * `paid_base_minor` is the converted figure, and it is **null when the
 * conversion is unknown** — a non-base line whose transaction never got
 * an fx_rate. Null propagates deliberately: every derived figure below
 * disappears rather than falling back to `paid_minor`, because that
 * fallback IS the bug.
 *
 * `effective_cost_minor` goes first: it is the user's own cost basis when
 * they set one (a carrier-financed phone's receipt shows only the sales
 * tax; the price is on bills that are never ingested), else the same
 * `paid_base_minor`. A backend from before the field leaves it undefined
 * and the receipt figure is used as before.
 */
export function paidBaseMinor(it: OwnedItemExpanded): number | null {
  if (it.effective_cost_minor != null) return it.effective_cost_minor;
  if (it.paid_base_minor != null) return it.paid_base_minor;
  // Rows predating the field, and rows the backend could not convert.
  // A missing `paid_currency` means the row was never expanded, not that
  // it is base currency, so neither case may assume `paid_minor` is
  // dollars.
  return null;
}

/** Cost less what the item was sold or traded in for: what owning it
 *  came to. Equal to the cost while it is still owned. */
export function netCostMinor(it: OwnedItemExpanded): number | null {
  const cost = paidBaseMinor(it);
  if (cost == null) return null;
  return cost - (it.sale_proceeds_minor ?? 0);
}

/** Amortized net cost per day, in the base currency. Null without a
 *  convertible price or an acquisition date. */
export function perDay(it: OwnedItemExpanded): number | null {
  const days = daysHeld(it);
  const net = netCostMinor(it);
  if (days === null || net == null) return null;
  return net / 100 / days;
}

/** A wish's projected $/day over its planned horizon. */
export function wishPerDay(w: WishItem): number | null {
  if (w.target_price_minor == null || !w.planned_days) return null;
  return w.target_price_minor / 100 / w.planned_days;
}

/** Planned days as years, to at most one decimal: 1460 → `4`, 548 → `1.5`. */
export function fmtYears(days: number): string {
  return String(Math.round((days / 365) * 10) / 10);
}

/** Typed years → planned days; null unless a positive number of at most
 *  100 years. */
export function yearsToDays(text: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const days = Math.round(Number(text) * 365);
  return days >= 1 && days <= 36500 ? days : null;
}

/** Typed dollars (`$1,299.99`) → minor units; null unless a positive
 *  amount with at most two decimals. */
export function dollarsToMinor(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const minor = Math.round(Number(t) * 100);
  return minor > 0 ? minor : null;
}

export function fmtPerDay(v: number | null): string {
  if (v === null) return '—';
  return v >= 10 ? `$${v.toFixed(0)}/d` : `$${v.toFixed(2)}/d`;
}

export function fmtDollars(minor: number | null | undefined): string {
  if (minor == null) return '—';
  return `$${Math.round(minor / 100).toLocaleString()}`;
}

/**
 * What the item cost, as the receipt itself put it — `¥4,499.00`,
 * `12,000 pts` — for display beside the base-currency figure.
 *
 * Returns null when the line is already in the base currency, so the
 * common case renders exactly one number and every USD screen is
 * unchanged.
 */
export function paidOriginal(
  it: OwnedItemExpanded,
  baseCurrency: string,
): string | null {
  if (it.paid_minor == null || !it.paid_currency) return null;
  if (it.paid_currency === baseCurrency) return null;
  return formatMoney(it.paid_minor, it.paid_currency);
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
