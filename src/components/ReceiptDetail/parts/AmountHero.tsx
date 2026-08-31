import { Link } from '@tanstack/react-router';
import { brandLink } from '../../../lib/navLinks';
import { cn } from '../../../lib/utils';
import { MerchantIcon } from '../../MerchantIcon';
import type { Category } from '../../../types';
import { formatMoney, formatOriginalAmount } from '../../../lib/money';
import {
  formatPointsRate,
  hasUnconfirmedValuation,
  pointsProgrammeLabel,
  type PointsMetadata,
} from '../../../lib/points';

/**
 * The microtype line under a points-valued total: which programme, at
 * what rate, and whether anyone has signed off on it.
 *
 * Shows the RATE rather than the converted amount, because for a points
 * transaction the rate is the only contestable number on the screen —
 * the points count comes off the folio and the dollar figure is just the
 * two multiplied. Someone checking a surprising total needs to see the
 * multiplier, exactly as #184 showed the FX rate for the same reason.
 */
function pointsProvenance(points: PointsMetadata, originalCurrency: string | null): string {
  const v =
    points.valuations.find((x) => x.currency === originalCurrency) ??
    points.valuations[0];
  if (!v) {
    // No valuation at all: the base contribution is 0, so the total is
    // not just uncertain, it is short. Say so rather than showing a rate
    // that does not exist.
    const label = originalCurrency ? pointsProgrammeLabel(originalCurrency) : 'points';
    return `${label} not valued · counted as 0`;
  }
  const rate = formatPointsRate(v.minor_per_point, points.base_currency);
  return v.confirmed ? rate : `${rate} · unconfirmed`;
}

export function AmountHero({
  amount,
  currency,
  originalTotalMinor,
  originalCurrency,
  fxRate,
  fxAsOfActual,
  points,
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
  /** #216 — present when the headline figure is a points APPRAISAL
   *  rather than a conversion. Null on every cash receipt, which keeps
   *  those pixel-identical to before. */
  points?: PointsMetadata | null;
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
  // #216 — the headline is the base-currency figure, as it is for every
  // other receipt, because that is the number that sums into totals. But
  // when it came from a points valuation it is an APPRAISAL, not a
  // conversion: `42,000 pts` is printed on the folio, `$714.00` is what
  // someone reckons those points are worth. The `≈` is the whole
  // difference and is never dropped.
  const isEstimate = !isProcessing && points != null;
  const unconfirmed = isEstimate && hasUnconfirmedValuation(points ?? null);
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
        {isEstimate && (
          // Sized and coloured to be READ, not to decorate. This glyph is
          // the only thing distinguishing an appraisal from a fact at a
          // glance, so `ink-faint` (tried first) was wrong — it rendered
          // as a smudge and the number went back to looking exact.
          // Optically raised: a 0.42em mark baseline-aligned under a 4rem
          // Fraunces numeral sits visibly low.
          <span
            className="relative -top-[0.34em] mr-[0.12em] text-[0.42em] font-normal text-[var(--color-ink-muted)]"
            aria-hidden="true"
          >
            ≈
          </span>
        )}
        {isProcessing ? '—' : formatMoney(amount * 100, currency)}
      </p>
      {/* #216 — what the folio actually says, above the provenance line.
          For a points stay this is the exact, countable figure and the
          number above it is the derived one, so it is set in the ink
          colour rather than muted: it is not a footnote to the total, it
          is the fact the total was computed from. */}
      {isEstimate && originalTotalMinor != null && originalCurrency != null && (
        <p className="mt-1.5 font-mono text-sm tracking-tight tnum text-[var(--color-ink-soft)]">
          {formatMoney(Math.abs(originalTotalMinor), originalCurrency)}
        </p>
      )}
      {/* Second line: the currency code for a plain receipt, or — when
          the amount above is a conversion — what the paper actually says
          plus the rate that produced it. Showing the rate and its
          publication date is what lets a surprising total be diagnosed as
          "wrong rate" vs "wrong extraction" without opening the DB. */}
      <p
        className={cn(
          'mt-1 font-mono text-[9px] tracking-[0.16em] uppercase',
          // Amber, not the stamp red: an unconfirmed valuation is not an
          // error. The rate is the best figure available and the total is
          // the best total available — it simply rests on a judgement
          // nobody has ratified. Red would train the eye to dismiss it.
          unconfirmed
            ? 'text-[var(--color-amber)]'
            : 'text-[var(--color-ink-muted)]',
        )}
      >
        {isEstimate ? pointsProvenance(points!, originalCurrency ?? null) : (converted ?? currency)}
      </p>
      {/* The one sentence that makes the estimate legible to someone who
          did not build this. Set in the annotation hand — the app already
          uses Caveat for marginalia — because that is exactly what this
          is: a note pencilled beside a number, not part of the record. */}
      {unconfirmed && (
        <p className="mt-1.5 font-hand text-base leading-snug text-[var(--color-ink-muted)]">
          nobody has confirmed this rate — the total above is an estimate
        </p>
      )}
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
