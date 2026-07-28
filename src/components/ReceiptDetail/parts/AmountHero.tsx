import { Link } from '@tanstack/react-router';
import { brandLink } from '../../../lib/navLinks';
import { cn } from '../../../lib/utils';
import { MerchantIcon } from '../../MerchantIcon';
import type { Category } from '../../../types';
import { formatMoney, formatOriginalAmount } from '../../../lib/money';

export function AmountHero({
  amount,
  currency,
  originalTotalMinor,
  originalCurrency,
  fxRate,
  fxAsOfActual,
  merchant,
  merchantBrandId,
  category,
  occurredOn,
  isProcessing,
  tombstoned,
  brandTo,
}: {
  /** Total in the workspace base currency — the figure every total in
   *  the app is built from. */
  amount: number;
  currency: string;
  /** #184 — what the receipt itself printed, when it wasn't in the base
   *  currency, plus the rate and the publication date it came from.
   *  All null for a base-currency receipt, which is almost every one. */
  originalTotalMinor?: number | null;
  originalCurrency?: string | null;
  fxRate?: number | null;
  fxAsOfActual?: string | null;
  merchant: string;
  merchantBrandId: string | null;
  category: Category | null;
  occurredOn: string;
  isProcessing: boolean;
  tombstoned: boolean;
  /** Link target for the merchant name → BrandPage. Undefined renders a
   *  plain <h1> (no link) — e.g. while processing or with no brand. */
  brandTo?: ReturnType<typeof brandLink>;
}) {
  const converted = isProcessing
    ? null
    : formatOriginalAmount(
        originalTotalMinor ?? null,
        originalCurrency ?? null,
        fxRate != null && fxAsOfActual != null
          ? { rate: fxRate, asOfActual: fxAsOfActual }
          : null,
      );
  const merchantClass = 'font-display font-medium text-2xl sm:text-3xl leading-tight';
  // FE#48: small square icon next to the merchant name. Skipped while
  // processing (the row says "Processing…", not a real merchant yet).
  const showIcon = !isProcessing;
  return (
    <div className="text-center pt-2">
      <p
        className={cn(
          'font-display font-light tracking-tight tnum',
          'text-[3.25rem] sm:text-[4rem] leading-none',
          tombstoned && 'line-through text-[var(--color-ink-muted)]',
        )}
      >
        {isProcessing ? '—' : formatMoney(amount * 100, currency)}
      </p>
      {/* Second line: the currency code for a plain receipt, or — when
          the amount above is a conversion — what the paper actually says
          plus the rate that produced it. Showing the rate and its
          publication date is what lets a surprising total be diagnosed as
          "wrong rate" vs "wrong extraction" without opening the DB. */}
      <p className="mt-1 font-mono text-[9px] tracking-[0.16em] uppercase text-[var(--color-ink-muted)]">
        {converted ?? currency}
      </p>
      {brandTo ? (
        <Link
          {...brandTo}
          className={cn(
            'mt-4 inline-flex items-center gap-2 transition-colors hover:text-[var(--color-terracotta)]',
            merchantClass,
          )}
        >
          {showIcon && (
            <MerchantIcon brandId={merchantBrandId} category={category} size={28} />
          )}
          <span className="inline-flex items-baseline gap-1">
            {merchant}
            <span className="font-display text-base leading-none text-[var(--color-accent)]">→</span>
          </span>
        </Link>
      ) : (
        <h1 className={cn('mt-4 inline-flex items-center gap-2', merchantClass)}>
          {showIcon && (
            <MerchantIcon brandId={merchantBrandId} category={category} size={28} />
          )}
          <span>{merchant}</span>
        </h1>
      )}
      <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
        {formatDateLong(occurredOn)}
      </p>
    </div>
  );
}

function formatDateLong(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return isoDate;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
