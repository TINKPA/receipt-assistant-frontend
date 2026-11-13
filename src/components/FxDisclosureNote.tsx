/**
 * "Part of this total was never converted" — the FX counterpart of
 * `PointsDisclosureNote`.
 *
 * ## Why a total needs this
 *
 * Every total in the app sums base-currency amounts. The backend converts
 * a foreign-currency receipt at the rate published for its date, and when
 * it cannot (the rate source was down, or does not publish that currency
 * or date) the posting stays UNCONVERTED: its base amount is still the
 * receipt's own number. A ¥5,000 lunch then sits in a dollar total as
 * 5,000 cents. Nothing about `$50.00` looks wrong, which is the problem.
 *
 * The backend says so wherever it sums: an `fx` block on every
 * `/v1/reports/*` payload, `unconverted_transaction_count` on the
 * merchant and brand KPIs, and `unconverted` on their transaction rows.
 * These three components put that next to the figure it qualifies.
 *
 * ## Silence is the default
 *
 * Zero unconverted postings renders nothing at all, so a ledger where
 * every conversion went through looks exactly as it did before. That is
 * the normal state; a note that is always there stops being read.
 *
 * The fix is on the backend (`scripts/backfill-fx.ts --unconverted`), so
 * these say what is wrong with the number and offer no action.
 */
import { cn } from '../lib/utils';
import { currencySymbol, formatMoney } from '../lib/money';
import type { BackendFxDisclosure } from '../lib/api';

/** Under a report total: how many transactions, and what they were
 *  counted as, per currency. */
export function FxDisclosureNote({
  fx,
  currency,
  className,
}: {
  fx: BackendFxDisclosure | null | undefined;
  /** The report's base currency — the unit `counted_base_minor` is read in. */
  currency: string;
  className?: string;
}) {
  const count = fx?.unconverted_transaction_count ?? 0;
  if (!fx || count === 0) return null;

  // `amount_minor` is the legs' own sum and carries their sign (a card
  // leg is negative); the disclosure is about magnitude. The code leads
  // each amount because the symbol alone does not say which currency it
  // is — yuan and yen share `¥` — and saying which is the point here.
  // (A currency with no symbol already prints its code.)
  const counted = fx.unconverted
    .map((u) => {
      const own = formatMoney(Math.abs(u.amount_minor), u.currency);
      const named = currencySymbol(u.currency) ? `${u.currency} ${own}` : own;
      return `${named} as ${formatMoney(Math.abs(u.counted_base_minor), currency)}`;
    })
    .join(', ');

  return (
    <div className={cn('mt-4 border-l-2 border-[var(--color-amber)] py-1 pl-3', className)}>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-amber)]">
        not converted
      </p>
      <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-ink-soft)]">
        {count} {count === 1 ? 'transaction' : 'transactions'} in this figure{' '}
        {count === 1 ? 'was' : 'were'} never converted to {currency} and{' '}
        {count === 1 ? 'is' : 'are'} counted at face value
        {counted && <> ({counted})</>}, so it is off by the exchange rate.
      </p>
    </div>
  );
}

/** Under a merchant's or brand's spend figures: one line, from
 *  `stats.unconverted_transaction_count`. */
export function UnconvertedCountNote({
  count,
  currency,
  className,
}: {
  count: number | null | undefined;
  currency: string;
  className?: string;
}) {
  if (!count) return null;
  return (
    <p
      data-testid="unconverted-note"
      className={cn('font-mono text-[10px] leading-snug text-[var(--color-amber)]', className)}
    >
      {count} {count === 1 ? 'entry' : 'entries'} never converted to {currency} ·{' '}
      counted at face value, so these totals are off by the exchange rate
    </p>
  );
}

/** Beside one row's amount, when that amount is the receipt's own number
 *  under a base-currency label. */
export function UnconvertedTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'block font-mono text-[9px] not-italic uppercase tracking-[0.1em] text-[var(--color-amber)]',
        className,
      )}
    >
      not converted
    </span>
  );
}
