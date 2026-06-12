import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  classifyBackendCategory,
  extractProblemMessage,
  getCashflowReport,
  getNetWorthReport,
  getSummaryReport,
  getTrendsReport,
} from '../lib/api';
import { qk } from '../lib/queryKeys';
import type { Category } from '../types';
import { cn } from '../lib/utils';
import { categoryLedgerLink, dateRangeLedgerLink } from '../lib/navLinks';

/**
 * Yearly review — board screen 23 (Insights lane, tracking
 * receipt-assistant#149): year stepper, the ink-dark net-worth hero
 * (as-of snapshot: today for the current year, Dec 31 for past years),
 * Q1–Q4 grid, 12-month spend bars with the current month hot and future
 * months ghosted, and the YTD category table. Replaces the legacy
 * dark-Material "Year in Review" page.
 */

function startOfYear(d: Date): string {
  return `${d.getFullYear()}-01-01`;
}

function endOfYear(d: Date): string {
  return `${d.getFullYear()}-12-31`;
}

function quarterOf(monthIso: string): 0 | 1 | 2 | 3 {
  const m = Number(monthIso.slice(5, 7));
  if (m <= 3) return 0;
  if (m <= 6) return 1;
  if (m <= 9) return 2;
  return 3;
}

const QUARTER_SPAN = ['jan – mar', 'apr – jun', 'jul – sep', 'oct – dec'] as const;
const CATEGORY_SWATCHES = [
  'var(--color-accent)',
  'var(--color-amber)',
  'var(--color-slate)',
  'var(--color-olive)',
  'var(--color-plum)',
  'var(--color-ink-faint)',
] as const;

export default function YearlyReview({ year }: { year?: number }) {
  // The displayed year is the source of truth in the URL search param
  // `?y=YYYY` (validated/coerced by the route). Defaults to the current
  // calendar year; chevrons navigate the URL rather than mutating state.
  // Capped at the current year so we don't render a "review" of the future.
  const navigate = useNavigate({ from: '/review/yearly' });
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const displayYear = year ?? currentYear;
  const canStepForward = displayYear < currentYear;
  const isCurrentYear = displayYear === currentYear;

  // `now` anchors the year's date range + the net-worth `asOf` snapshot.
  // For the current year that snapshot is "today"; for a past year it's
  // Dec 31 of that year so the as-of net worth reflects year-end.
  const now = useMemo(
    () => (isCurrentYear ? today : new Date(displayYear, 11, 31)),
    [displayYear, isCurrentYear, today],
  );
  const lastYear = useMemo(
    () => new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
    [now],
  );

  const stepBack = () => navigate({ search: { y: displayYear - 1 } });
  const stepForward = () => {
    if (!canStepForward) return;
    navigate({ search: { y: displayYear + 1 } });
  };

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: qk.yearlyReview(
      now.toISOString().slice(0, 10),
      lastYear.toISOString().slice(0, 10),
    ),
    queryFn: async () => {
      const [nw, nwPrev, cf, tr, sm] = await Promise.all([
        getNetWorthReport({ asOf: now.toISOString().slice(0, 10) }),
        getNetWorthReport({ asOf: lastYear.toISOString().slice(0, 10) }),
        getCashflowReport({ from: startOfYear(now), to: endOfYear(now) }),
        getTrendsReport({
          from: startOfYear(now),
          to: endOfYear(now),
          period: 'month',
          groupBy: 'total',
        }),
        getSummaryReport({ from: startOfYear(now), to: endOfYear(now), groupBy: 'category' }),
      ]);
      return { netWorth: nw, netWorthPrev: nwPrev, cashflow: cf, trends: tr, summary: sm };
    },
  });
  const error = queryError ? extractProblemMessage(queryError) : null;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="font-display italic text-lg text-[var(--color-ink-muted)]">
          the long arc, loading…
        </p>
      </div>
    );
  }
  if (error) {
    return <p className="py-20 text-center text-[var(--color-stamp)]">{error}</p>;
  }

  const netWorthMinor = data?.netWorth?.net_worth_minor ?? 0;
  const prevNetWorthMinor = data?.netWorthPrev?.net_worth_minor ?? 0;
  const ytdDeltaMinor = netWorthMinor - prevNetWorthMinor;

  // Quarter totals from the cashflow month buckets.
  const quarterMinor: number[] = [0, 0, 0, 0];
  for (const b of data?.cashflow?.buckets ?? []) {
    quarterMinor[quarterOf(b.month)] += b.expense_minor ?? 0;
  }
  const nowQuarter = isCurrentYear ? quarterOf(today.toISOString().slice(0, 10)) : 3;

  // 12 month bars; trends buckets are sparse (only months with data).
  const monthMinor = new Array<number>(12).fill(0);
  for (const b of data?.trends?.buckets ?? []) {
    const m = Number(b.bucket.slice(5, 7));
    if (m >= 1 && m <= 12) monthMinor[m - 1] = Math.abs(b.total_minor);
  }
  const maxMonth = Math.max(1, ...monthMinor);
  const currentMonthIdx = isCurrentYear ? today.getMonth() : -1;

  // YTD category table (spending only), aggregated to the 7-category model.
  const categoryRows = (() => {
    const map = new Map<Category, number>();
    for (const it of data?.summary?.items ?? []) {
      const { category, transactionType } = classifyBackendCategory(it.key);
      if (transactionType !== 'spending' || !category) continue;
      map.set(category, (map.get(category) ?? 0) + Math.abs(it.total_minor));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  })();

  const yearRange = { from: startOfYear(now), to: endOfYear(now) };
  const { whole, cents } = splitMinor(netWorthMinor);

  return (
    <div className="space-y-5">
      {/* year stepper */}
      <div className="flex items-center justify-between pt-1">
        <Chev onClick={stepBack} label="Previous year">‹</Chev>
        <div className="text-center">
          <p className="font-display text-[22px] leading-tight tracking-tight">
            <em className="italic text-[var(--color-accent)]">{displayYear}</em>
            {isCurrentYear && ' so far'}
          </p>
          <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            yearly review · as of{' '}
            {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()}
          </p>
        </div>
        <Chev onClick={stepForward} label="Next year" disabled={!canStepForward}>›</Chev>
      </div>

      {/* yr-hero (ink) */}
      <section className="relative overflow-hidden rounded-[18px] bg-[var(--color-ink)] px-5 py-5 text-[var(--color-paper)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(181,52,26,0.4), transparent 70%)' }}
        />
        <p className="relative font-mono text-[8.5px] uppercase tracking-[0.2em] text-[var(--color-paper-fold)]">
          NET WORTH · AS-OF SNAPSHOT
        </p>
        <p className="relative mt-1.5 font-display text-[2.5rem] font-light leading-none tracking-tight tnum">
          {netWorthMinor < 0 && '−'}${whole.toLocaleString()}
          <span className="text-[0.55em] text-[var(--color-paper-fold)]">.{cents}</span>
        </p>
        <p className="relative mt-2 text-[11.5px] text-[color:rgba(221,211,190,0.85)]">
          <strong
            className={cn(
              'font-mono text-[10.5px] font-semibold',
              ytdDeltaMinor >= 0 ? 'text-[#8FA468]' : 'text-[#D08770]',
            )}
          >
            {ytdDeltaMinor >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(ytdDeltaMinor / 100)).toLocaleString()}
          </strong>{' '}
          vs a year ago
        </p>
      </section>

      {/* q-grid */}
      <div className="grid grid-cols-4 gap-2">
        {quarterMinor.map((minor, i) => {
          const future = isCurrentYear && i > nowQuarter;
          const isNow = isCurrentYear && i === nowQuarter;
          return (
            <div
              key={i}
              className={cn(
                'rounded-[11px] border-[0.5px] bg-[var(--color-surface)] px-1 py-2.5 text-center',
                isNow ? 'border-[var(--color-accent)]' : 'border-[var(--color-rule-soft)]',
              )}
            >
              <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                Q{i + 1}
              </p>
              <p
                className={cn(
                  'mt-1 font-display text-[13.5px] font-normal tnum',
                  isNow && 'text-[var(--color-accent)]',
                  future && 'text-[var(--color-ink-faint)]',
                )}
              >
                {future ? '—' : `$${Math.round(minor / 100).toLocaleString()}`}
              </p>
              <p className="mt-0.5 font-mono text-[7px] text-[var(--color-ink-faint)]">
                {future ? 'ahead' : isNow ? 'in progress' : QUARTER_SPAN[i]}
              </p>
            </div>
          );
        })}
      </div>

      {/* 12-month bars */}
      <section className="rounded-[var(--radius-card)] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4 pb-3 pt-3.5">
        <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          Spend by month · {displayYear}
        </p>
        <div className="flex h-[58px] items-end gap-[4px]">
          {monthMinor.map((minor, i) => {
            const future = isCurrentYear && i > today.getMonth();
            const hot = i === currentMonthIdx;
            const h = Math.max(6, (minor / maxMonth) * 100);
            return (
              <div
                key={i}
                className={cn(
                  'flex-1 rounded-t-[2.5px]',
                  hot
                    ? 'bg-[var(--color-accent)]'
                    : future
                      ? 'bg-[repeating-linear-gradient(45deg,var(--color-rule-soft)_0_3px,transparent_3px_6px)]'
                      : 'bg-[var(--color-paper-fold)]',
                )}
                style={{ height: `${future ? 28 : h}%` }}
                title={`${displayYear}-${String(i + 1).padStart(2, '0')}: $${Math.round(minor / 100)}`}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[7px] tracking-[0.06em] text-[var(--color-ink-faint)]">
          {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((l, i) => (
            <span
              key={i}
              className={cn('flex-1 text-center', i === currentMonthIdx && 'font-semibold text-[var(--color-accent)]')}
            >
              {l}
            </span>
          ))}
        </div>
      </section>

      {/* YTD category table */}
      {categoryRows.length > 0 && (
        <section>
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            By category · YTD
          </p>
          <div className="px-0.5">
            {categoryRows.map(([category, minor], i) => (
              <Link
                key={category}
                {...categoryLedgerLink(category, yearRange)}
                className="flex items-center gap-2.5 border-b border-[var(--color-rule-soft)] py-2 text-[11.5px] last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 flex-shrink-0 rounded-[2px]"
                  style={{ background: CATEGORY_SWATCHES[i % CATEGORY_SWATCHES.length] }}
                />
                <span className="flex-1 font-medium text-[var(--color-ink)]">{category}</span>
                <span className="font-mono text-[10.5px] font-medium tnum">
                  ${Math.round(minor / 100).toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Link
        {...dateRangeLedgerLink(yearRange)}
        className="block rounded-[var(--radius-pill)] border-[0.5px] border-[var(--color-rule)] py-2.5 text-center font-display text-[13.5px] font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-ink-muted)]"
      >
        Full year in Ledger →
      </Link>
    </div>
  );
}

function Chev({
  children,
  onClick,
  label,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full',
        'border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)]',
        'text-[14px] text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]',
        disabled && 'opacity-30 hover:text-[var(--color-ink-soft)]',
      )}
    >
      {children}
    </button>
  );
}

function splitMinor(minor: number): { whole: number; cents: string } {
  const abs = Math.abs(minor) / 100;
  return { whole: Math.floor(abs), cents: abs.toFixed(2).split('.')[1] ?? '00' };
}
