import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  classifyBackendCategory,
  extractProblemMessage,
  fetchTransactions,
  getCashflowReport,
  getSummaryReport,
} from '../lib/api';
import type { Category } from '../types';
import { cn } from '../lib/utils';
import { qk } from '../lib/queryKeys';
import { MerchantIcon } from './MerchantIcon';
import { categoryLedgerLink, dateRangeLedgerLink, receiptLink } from '../lib/navLinks';

/**
 * Monthly review — board screen 22 (Insights lane, tracking
 * receipt-assistant#149): mo-nav month stepper, the big SPENT figure with a
 * vs-last-month delta, dual compare bars per category (this month = cardinal,
 * last month = paper-fold), largest rows, and a "open these N in Ledger"
 * exit. Replaces the legacy dark-Material "Monthly Financial Performance"
 * page that was never migrated off the old theme.
 */

function startOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function endOfMonth(d: Date): string {
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

// Backend `/v1/reports/cashflow` bucket keys are 'YYYY-MM' (TO_CHAR), so
// frontend keys + parsing must match that shape — not 'YYYY-MM-DD', and never
// `new Date('YYYY-MM')` which is UTC-midnight and shifts back a day in
// negative timezones.
function yearMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseYearMonth(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

interface CategoryRow {
  category: Category;
  currentMinor: number;
  previousMinor: number;
}

export default function MonthlyReview({ month }: { month?: string }) {
  // The selected month is the source of truth in the URL search param
  // `?m=YYYY-MM` (validated/parsed by the route). When absent or invalid
  // we fall back to the current calendar month; chevrons navigate the URL
  // rather than mutating local state. Capped at the current month.
  const navigate = useNavigate({ from: '/review/monthly' });
  const today = useMemo(() => new Date(), []);
  const currentMonth = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today],
  );
  const now = useMemo(
    () => (month ? parseYearMonth(month) : currentMonth),
    [month, currentMonth],
  );
  const prevMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth() - 1, 1), [now]);
  const canStepForward = now < currentMonth;

  const stepBack = () =>
    navigate({
      search: { m: yearMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)) },
    });
  const stepForward = () => {
    if (!canStepForward) return;
    navigate({
      search: { m: yearMonthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1)) },
    });
  };

  // One query per month pair: cashflow (this+prev in one range), the two
  // category summaries, and the month's receipts (client-sorted by amount
  // for "largest rows"; the 200-cap covers all but the most active months).
  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: qk.monthlyReview(yearMonthKey(now), yearMonthKey(prevMonth)),
    queryFn: async () => {
      const [cf, thisM, lastM, top] = await Promise.all([
        getCashflowReport({ from: startOfMonth(prevMonth), to: endOfMonth(now) }),
        getSummaryReport({ from: startOfMonth(now), to: endOfMonth(now), groupBy: 'category' }),
        getSummaryReport({
          from: startOfMonth(prevMonth),
          to: endOfMonth(prevMonth),
          groupBy: 'category',
        }),
        fetchTransactions({
          from: startOfMonth(now),
          to: endOfMonth(now),
          sort: 'occurred_on',
          order: 'desc',
          limit: 200,
        }),
      ]);
      // Spending amounts arrive negative — rank by magnitude, not raw value,
      // or "largest rows" would surface the three SMALLEST purchases.
      const allReceipts = [...top].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      return { cashflow: cf, thisMonth: thisM, lastMonth: lastM, allReceipts };
    },
  });
  const error = queryError ? extractProblemMessage(queryError) : null;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="font-display italic text-lg text-[var(--color-ink-muted)]">
          closing the books…
        </p>
      </div>
    );
  }
  if (error) {
    return <p className="py-20 text-center text-[var(--color-stamp)]">{error}</p>;
  }

  const cashflow = data?.cashflow ?? null;
  const thisBucket = cashflow?.buckets.find((b) => b.month === yearMonthKey(now));
  const lastBucket = cashflow?.buckets.find((b) => b.month === yearMonthKey(prevMonth));
  const thisExpenseMinor = thisBucket?.expense_minor ?? 0;
  const lastExpenseMinor = lastBucket?.expense_minor ?? 0;
  const incomeMinor = thisBucket?.income_minor ?? 0;
  const pctDelta =
    lastExpenseMinor > 0
      ? Math.round(((thisExpenseMinor - lastExpenseMinor) / lastExpenseMinor) * 100)
      : null;

  // Merge this-month + last-month category summaries into rows, aggregated
  // by the 7-category model. Non-spending buckets (income/investment) are
  // dropped — they belong on a flow view, not this one.
  const categoryRows: CategoryRow[] = (() => {
    const map = new Map<Category, CategoryRow>();
    const addBucket = (
      key: string | undefined,
      minor: number,
      field: 'currentMinor' | 'previousMinor',
    ) => {
      const { category, transactionType } = classifyBackendCategory(key);
      if (transactionType !== 'spending' || !category) return;
      const row = map.get(category) ?? { category, currentMinor: 0, previousMinor: 0 };
      row[field] += minor;
      map.set(category, row);
    };
    for (const it of data?.thisMonth?.items ?? []) addBucket(it.key, it.total_minor, 'currentMinor');
    for (const it of data?.lastMonth?.items ?? []) addBucket(it.key, it.total_minor, 'previousMinor');
    return [...map.values()].sort((a, b) => b.currentMinor - a.currentMinor);
  })();
  const maxMinor = Math.max(
    1,
    ...categoryRows.flatMap((r) => [Math.abs(r.currentMinor), Math.abs(r.previousMinor)]),
  );

  const receipts = data?.allReceipts ?? [];
  const largest = receipts.slice(0, 3);
  const monthLabel = now.toLocaleString('en-US', { month: 'long' });
  const monthRange = { from: startOfMonth(now), to: endOfMonth(now) };
  const { whole, cents } = splitMinor(thisExpenseMinor);

  return (
    <div className="space-y-5">
      {/* mo-nav */}
      <div className="flex items-center justify-between pt-1">
        <Chev onClick={stepBack} label="Previous month">‹</Chev>
        <div className="text-center">
          <p className="font-display text-[22px] leading-tight tracking-tight">
            {monthLabel} <em className="italic text-[var(--color-accent)]">{now.getFullYear()}</em>
          </p>
          <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            monthly review {canStepForward ? '' : '· in progress'}
          </p>
        </div>
        <Chev onClick={stepForward} label="Next month" disabled={!canStepForward}>›</Chev>
      </div>

      {/* rv-fig */}
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          SPENT · {monthLabel.toUpperCase()}
        </p>
        <p className="mt-1.5 font-display text-[2.9rem] font-light leading-none tracking-tight tnum">
          ${whole.toLocaleString()}
          <span className="text-[0.5em] text-[var(--color-ink-soft)]">.{cents}</span>
        </p>
        <p className="mt-2 text-[12px] text-[var(--color-ink-soft)]">
          {pctDelta !== null && (
            <strong
              className={cn(
                'font-mono text-[11px] font-semibold',
                pctDelta <= 0 ? 'text-[var(--color-olive)]' : 'text-[var(--color-accent)]',
              )}
            >
              {pctDelta <= 0 ? '↓' : '↑'} {Math.abs(pctDelta)}%
            </strong>
          )}
          {pctDelta !== null && ' vs last month · '}
          <strong className="font-medium">{receipts.length}</strong> transactions
          {incomeMinor > 0 && (
            <span className="text-[var(--color-ink-muted)]">
              {' '}· income ${Math.round(incomeMinor / 100).toLocaleString()}
            </span>
          )}
        </p>
      </div>

      {/* cmp-bars */}
      {categoryRows.length > 0 && (
        <section className="rounded-[var(--radius-card)] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4 pb-2 pt-3.5">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
              By category
            </p>
            <p className="font-mono text-[8.5px] text-[var(--color-ink-faint)]">
              <span className="text-[var(--color-accent)]">▮</span> {monthLabel} · ▯{' '}
              {prevMonth.toLocaleString('en-US', { month: 'short' })}
            </p>
          </div>
          {categoryRows.map((row) => (
            <Link
              key={row.category}
              {...categoryLedgerLink(row.category, monthRange)}
              className="mb-3 block last:mb-2"
            >
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[11.5px] text-[var(--color-ink-soft)]">{row.category}</span>
                <span className="font-mono text-[10px] font-medium tnum">
                  ${(row.currentMinor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="mb-[3px] h-[5px] overflow-hidden rounded-[3px] bg-[var(--color-rule-soft)]">
                <div
                  className="h-full rounded-[3px] bg-[var(--color-accent)]"
                  style={{ width: `${(Math.abs(row.currentMinor) / maxMinor) * 100}%` }}
                />
              </div>
              <div className="h-[3px] overflow-hidden rounded-[2px] bg-transparent">
                <div
                  className="h-full rounded-[2px] bg-[var(--color-paper-fold)]"
                  style={{ width: `${(Math.abs(row.previousMinor) / maxMinor) * 100}%` }}
                />
              </div>
            </Link>
          ))}
        </section>
      )}

      {/* largest rows */}
      {largest.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display italic text-[1.2rem] font-medium leading-none tracking-tight">
              largest rows
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
              {receipts.length} total
            </span>
          </div>
          <ul className="rounded-[16px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4">
            {largest.map((tx, idx) => (
              <li key={tx.id} className={cn(idx > 0 && 'border-t border-[var(--color-rule-soft)]')}>
                <Link
                  {...receiptLink(tx.id)}
                  className="grid grid-cols-[36px_1fr_auto] items-center gap-3 py-2.5"
                >
                  <MerchantIcon
                    brandId={tx.merchantBrandId}
                    category={tx.category}
                    transactionType={tx.transactionType}
                    size={36}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[13.5px] font-medium leading-tight">
                      {tx.description}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--color-ink-muted)]">
                      {tx.date.slice(5)}{tx.category ? ` · ${tx.category}` : ''}
                    </span>
                  </span>
                  <span className="font-mono text-[13px] font-semibold tracking-tight tnum">
                    ${Math.abs(tx.amount).toFixed(2)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* exit to Ledger */}
      <Link
        {...dateRangeLedgerLink(monthRange)}
        className="block rounded-[var(--radius-pill)] border-[0.5px] border-[var(--color-rule)] py-2.5 text-center font-display text-[13.5px] font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-ink-muted)]"
      >
        Open these {receipts.length} in Ledger →
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
