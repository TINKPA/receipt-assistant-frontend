export const CATEGORIES = [
  'Food & Drinks',
  'Transportation',
  'Shopping',
  'Travel',
  'Entertainment',
  'Health',
  'Services',
] as const;

export type Category = typeof CATEGORIES[number];

export const TRANSACTION_TYPES = [
  'spending',
  'income',
  'transfer',
  'investment',
] as const;

export type TransactionType = typeof TRANSACTION_TYPES[number];

export type RawTransactionStatus =
  | 'draft'
  | 'posted'
  | 'reconciled'
  | 'error';

export interface Transaction {
  id: string;
  description: string;
  /** Null when transactionType !== 'spending'. */
  category: Category | null;
  transactionType: TransactionType;
  date: string;
  /** Null when the receipt's OCR didn't extract a payment method
   *  (e.g. cash, illegible, missing footer). UI views fall back to
   *  `placeCity` or category in that case. */
  paymentMethod: string | null;
  /** "City, ST" derived from `place.formatted_address` when the
   *  transaction has a geocoded place (US-only heuristic; non-US
   *  best-effort). Used as a row-subtitle fallback in Apple-Wallet
   *  style when `paymentMethod` is unavailable. */
  placeCity?: string | null;
  /** Workspace base currency. Expenses negative, income positive.
   *  This is the ONLY amount that may be summed — see `src/lib/money.ts`. */
  amount: number;
  currency: string;
  /** #184 — the receipt's own total and currency when it differs from
   *  the base currency, plus the rate used. Display only; null for the
   *  same-currency case, which is almost every row. */
  originalTotalMinor?: number | null;
  originalCurrency?: string | null;
  fxRate?: number | null;
  fxAsOfActual?: string | null;
  /** Single source of truth for state. UI-visible status labels are derived
   *  via `statusBadge(rawStatus)` from `src/lib/transactionStatus.ts`. */
  rawStatus: RawTransactionStatus;
  /** Primary linked document id, if any — needed for tombstone toggle and
   *  delete-receipt cascade flows from the list. */
  documentId?: string | null;
  /** Kind of the primary document (`receipt_image` | `receipt_email` |
   *  `receipt_pdf` | …). Drives the list source glyph — only non-photo
   *  sources are marked (#76). */
  documentKind?: string | null;
  /** Canonical merchant brand id (kebab-case, e.g. "costco"). Populated
   *  from the joined `merchant.brand_id`. Drives navigation from a
   *  receipt → BrandPage (one brand across all its physical stores). */
  merchantBrandId?: string | null;
  /** Specific merchant (one physical store) UUID, joined from
   *  `transactions.merchant_id`. Drives navigation Receipt →
   *  MerchantDetail (one location, all visits there). Null when the
   *  row predates merchant emission or has no FK populated. */
  merchantId?: string | null;
}
