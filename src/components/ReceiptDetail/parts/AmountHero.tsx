import { Link } from '@tanstack/react-router';
import { brandLink } from '../../../lib/navLinks';
import { cn } from '../../../lib/utils';
import { MerchantIcon } from '../../MerchantIcon';
import type { Category } from '../../../types';

export function AmountHero({
  amount,
  currency,
  merchant,
  merchantBrandId,
  category,
  occurredOn,
  isProcessing,
  voided,
  brandTo,
}: {
  amount: number;
  currency: string;
  merchant: string;
  merchantBrandId: string | null;
  category: Category | null;
  occurredOn: string;
  isProcessing: boolean;
  voided: boolean;
  /** Link target for the merchant name → BrandPage. Undefined renders a
   *  plain <h1> (no link) — e.g. while processing or with no brand. */
  brandTo?: ReturnType<typeof brandLink>;
}) {
  const merchantClass = 'font-display italic font-medium text-2xl sm:text-3xl leading-tight';
  // FE#48: small square icon next to the merchant name. Skipped while
  // processing (the row says "Processing…", not a real merchant yet).
  const showIcon = !isProcessing;
  return (
    <div className="text-center pt-2">
      <p
        className={cn(
          'font-display italic font-medium tracking-tight tnum',
          'text-[3.25rem] sm:text-[4rem] leading-none',
          voided && 'line-through text-[var(--color-ink-muted)]',
        )}
      >
        {isProcessing ? '—' : `$${amount.toFixed(2)}`}
      </p>
      <p className="mt-1 text-[11px] tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
        {currency}
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
            <span className="font-display italic text-base leading-none text-[var(--color-terracotta)]">→</span>
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
