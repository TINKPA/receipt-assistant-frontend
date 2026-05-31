/**
 * Typed Link target builders for the app's detail screens.
 *
 * List rows render as real `<a href>` via TanStack's <Link {...receiptLink(id)}>
 * instead of `<button onClick={navigate(...)}>`. That restores native browser
 * affordances the JS-only path lost: right-click → Open in New Tab / Split
 * View, Cmd/Ctrl-click, middle-click, and the hover URL preview.
 *
 * Spreading one of these onto <Link> gives it the correct `to` + `params`
 * (and TanStack type-checks the pair against the generated route tree).
 *
 * The Ledger builders below are the exception: `/transactions` keys its
 * filter state off the URL *search* object (see transactionsFilterState.ts),
 * not route params, so they carry `search` instead of `params`.
 */
import type { Category } from '../types';

type Range = { from: string; to: string };

export const receiptLink = (receiptId: string) =>
  ({ to: '/receipt/$receiptId', params: { receiptId } }) as const;

/** Ledger filtered to one category, optionally scoped to a date range so the
 *  drilled-in list matches the period of the figure that was clicked. */
export const categoryLedgerLink = (category: Category, range?: Range) =>
  ({
    to: '/transactions',
    search: range
      ? { datePreset: 'custom' as const, from: range.from, to: range.to, categories: [category] }
      : { categories: [category] },
  }) as const;

/** Ledger scoped to a date range (no category filter). */
export const dateRangeLedgerLink = (range: Range) =>
  ({
    to: '/transactions',
    search: { datePreset: 'custom' as const, from: range.from, to: range.to },
  }) as const;

export const merchantLink = (merchantId: string) =>
  ({ to: '/merchant/$merchantId', params: { merchantId } }) as const;

export const brandLink = (brandId: string) =>
  ({ to: '/brand/$brandId', params: { brandId } }) as const;

export const batchLink = (batchId: string) =>
  ({ to: '/batches/$batchId', params: { batchId } }) as const;
