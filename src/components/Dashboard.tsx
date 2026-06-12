import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  fetchTransactions,
  fetchSummary,
  classifyBackendCategory,
} from '../lib/api';
import { listBatches } from '../lib/api/ingest';
import type { Transaction } from '../types';
import { isProcessing as txIsProcessing } from '../lib/transactionStatus';
import { cn } from '../lib/utils';
import { receiptLink } from '../lib/navLinks';
import { qk } from '../lib/queryKeys';
import { MerchantIcon } from './MerchantIcon';
import ProcessingCardList from './ProcessingCard';
import type { ProcessingItem } from './useProcessingJobs';

interface DashboardProps {
  onSelectReceipt?: (receiptId: string) => void;
  onViewAllTransactions?: () => void;
  /** In-flight uploads, rendered inline above the recent list. */
  processingItems?: ProcessingItem[];
  onDismissProcessing?: (batchId: string) => void;
}

/**
 * Home — the landing tab in the v2 editorial IA (board screen 01,
 * tracking receipt-assistant#149).
 *
 * Anatomy follows the board: greeting + date/gear row, the ink-dark month
 * card, a fat capture CTA, the Inbox/Uploads quick row, then Recent.
 * The Variant B category grid moved to the Monthly review (Insights lane) —
 * the month card's meta line carries the summary here.
 *
 * All data is live from the backend: no mocks, no fixtures (see memory
 * feedback_no_mock_api.md).
 */
export default function Dashboard({
  onSelectReceipt,
  onViewAllTransactions,
  processingItems = [],
  onDismissProcessing,
}: DashboardProps) {
  const monthRange = useMemo(() => currentMonthRange(new Date()), []);
  const priorRange = useMemo(() => priorMonthRange(monthRange.now), [monthRange]);

  // Recent = freshly-uploaded / re-processed, not "this month's activity".
  // Ride the `created_at desc` default with no month filter so a receipt with
  // `occurred_on` years ago still bubbles to the top right after upload. Keyed
  // under ['transactions','recent'] so it shares the namespace the Ledger and
  // mutation invalidators target.
  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: qk.transactions.recent({ limit: 4 }),
    queryFn: () => fetchTransactions({ limit: 4 }),
  });
  const { data: summary = [], isLoading: sumLoading } = useQuery({
    queryKey: qk.summary.range({ from: monthRange.from, to: monthRange.to }),
    queryFn: () => fetchSummary({ from: monthRange.from, to: monthRange.to }),
  });
  // Prior month, for the month card's "vs last month" delta. Cheap (the
  // summary endpoint aggregates server-side) and cached under its own range.
  const { data: priorSummary = [] } = useQuery({
    queryKey: qk.summary.range({ from: priorRange.from, to: priorRange.to }),
    queryFn: () => fetchSummary({ from: priorRange.from, to: priorRange.to }),
  });
  // Inbox = drafts awaiting review. Capped fetch; the count only feeds the
  // quick-row label so "50" reads as "lots" without a dedicated endpoint.
  const { data: drafts = [] } = useQuery({
    queryKey: qk.transactions.recent({ limit: 50, status: 'draft' }),
    queryFn: () => fetchTransactions({ limit: 50, status: 'draft' }),
  });
  const { data: lastBatches = [] } = useQuery({
    queryKey: ['batches', 'latest'],
    queryFn: async () => (await listBatches({ limit: 1 })).items ?? [],
  });
  const loading = txLoading || sumLoading;

  const { total: totalSpent, count: totalCount } = useMemo(
    () => spendingTotals(summary),
    [summary],
  );
  const { total: priorSpent } = useMemo(() => spendingTotals(priorSummary), [priorSummary]);

  return (
    <div className="space-y-6">
      <GreetingRow now={monthRange.now} />

      <MonthCard
        now={monthRange.now}
        amount={totalSpent}
        count={totalCount}
        priorAmount={priorSpent}
        loading={loading}
      />

      <CaptureCTA />

      <QuickRow draftCount={drafts.length} lastBatchAt={lastBatches[0]?.created_at ?? null} />

      <SectionTitle
        title="recent"
        // Always offer the Ledger entry point — this is the only path from the
        // home view to /transactions besides the tab bar. Show the count when
        // we have one, plain "all →" else.
        more={totalCount > 0 ? `all ${totalCount} →` : 'all →'}
        onMore={onViewAllTransactions}
      />
      <ProcessingCardList
        items={processingItems}
        onDismiss={(batchId) => onDismissProcessing?.(batchId)}
        onSelectTransaction={onSelectReceipt}
      />
      <RecentList items={transactions} loading={loading} />
    </div>
  );
}

/* ── Greeting ─────────────────────────────────────────────────── */

function GreetingRow({ now }: { now: Date }) {
  const hour = now.getHours();
  const daypart = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const dateLine = now
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .replace(/,/g, ' ·');
  return (
    <div>
      <h1 className="font-display text-[2rem] leading-[1.08] tracking-tight">
        Good {daypart},
        <br />
        <em className="italic text-[var(--color-accent)]">Daniel.</em>
      </h1>
      <div className="mt-2 flex items-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          {dateLine} · {now.getFullYear()}
        </p>
        {/* Settings is the stack behind the Home gear (v2 IA, board lane VI). */}
        <Link
          to="/settings"
          aria-label="Settings"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-[15px] text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
        >
          <span aria-hidden="true">⚙</span>
        </Link>
      </div>
    </div>
  );
}

/* ── Month card (ink-dark, board screen 01) ───────────────────── */

function MonthCard({
  now,
  amount,
  count,
  priorAmount,
  loading,
}: {
  now: Date;
  amount: number;
  count: number;
  priorAmount: number;
  loading: boolean;
}) {
  const month = now.toLocaleString('en-US', { month: 'long' });
  const priorMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString('en-US', {
    month: 'long',
  });
  const { whole, cents } = splitAmount(amount);
  // Pace, not raw total: compare against the same number of days into the
  // prior month so mid-month the delta isn't trivially "down".
  const dayOfMonth = now.getDate();
  const daysInPrior = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const pacedPrior = priorAmount * Math.min(1, dayOfMonth / daysInPrior);
  const delta = pacedPrior > 0 ? Math.round(((amount - pacedPrior) / pacedPrior) * 100) : null;

  return (
    <section className="relative overflow-hidden rounded-[18px] bg-[var(--color-ink)] px-6 py-5 text-[var(--color-paper)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(181,52,26,0.45), transparent 70%)' }}
      />
      <p className="relative font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--color-paper-fold)]">
        Your {month} · so far
      </p>
      {loading ? (
        <p className="relative mt-2 font-display text-3xl text-[var(--color-paper-fold)]">…</p>
      ) : (
        <p className="relative mt-1.5 font-display text-[clamp(2.6rem,10vw,3.4rem)] font-light leading-none tracking-tight tnum">
          ${whole.toLocaleString()}
          <span className="text-[0.5em] text-[var(--color-paper-fold)]">.{cents}</span>
        </p>
      )}
      <p className="relative mt-2.5 text-[12px] text-[color:rgba(221,211,190,0.85)]">
        {loading ? (
          ' '
        ) : count === 0 ? (
          'No entries yet — snap your first receipt below.'
        ) : (
          <>
            {delta !== null && (
              <span className={delta <= 0 ? 'text-[#8FA468]' : 'text-[#D08770]'}>
                {delta <= 0 ? '↓' : '↑'} {Math.abs(delta)}% vs {priorMonth} pace ·{' '}
              </span>
            )}
            <strong className="font-medium text-[var(--color-paper)]">{count}</strong>{' '}
            {count === 1 ? 'transaction' : 'transactions'}
          </>
        )}
      </p>
    </section>
  );
}

/* ── Capture CTA (board screen 01) ────────────────────────────── */

function CaptureCTA() {
  return (
    <Link
      to="/add"
      className={cn(
        'flex items-center gap-4 rounded-[18px] px-5 py-4',
        'border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)]',
        'transition-shadow hover:shadow-[0_6px_20px_-10px_rgba(26,22,18,0.18)]',
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[var(--color-accent)] text-[18px] text-white"
      >
        📷
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[17px] font-medium leading-tight">
          Snap a receipt
        </span>
        <span className="mt-0.5 block text-[11.5px] text-[var(--color-ink-muted)]">
          or upload a photo, PDF, or email
        </span>
      </span>
      <span aria-hidden="true" className="ml-auto text-[15px] text-[var(--color-ink-faint)]">
        ›
      </span>
    </Link>
  );
}

/* ── Quick row: Inbox drafts + Uploads (board screen 01) ──────── */

function QuickRow({
  draftCount,
  lastBatchAt,
}: {
  draftCount: number;
  lastBatchAt: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Link
        to="/transactions"
        search={{ status: 'draft' as const }}
        className="rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[var(--color-rule)]"
      >
        <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          ⚡ Inbox
        </p>
        <p className="mt-1 font-display text-[15px] font-medium">
          {draftCount >= 50 ? '50+' : draftCount} {draftCount === 1 ? 'draft' : 'drafts'}
        </p>
      </Link>
      <Link
        to="/batches"
        className="rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[var(--color-rule)]"
      >
        <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          ⇪ Uploads · last
        </p>
        <p className="mt-1 font-display text-[15px] font-medium">
          {lastBatchAt ? relativeTime(lastBatchAt) : '—'}
        </p>
      </Link>
    </div>
  );
}

/* ── Section title ────────────────────────────────────────────── */

function SectionTitle({
  title,
  more,
  onMore,
}: {
  title: string;
  more?: string;
  onMore?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between pt-1">
      <h2 className="font-display italic text-[1.35rem] font-medium leading-none tracking-tight">
        {title}
      </h2>
      {more && (
        <button
          type="button"
          onClick={onMore}
          disabled={!onMore}
          className={cn(
            'font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]',
            'leading-none',
            !onMore && 'cursor-default opacity-50',
            onMore && 'hover:text-[var(--color-accent-deep)]',
          )}
        >
          {more}
        </button>
      )}
    </div>
  );
}

/* ── Recent list ──────────────────────────────────────────────── */

function RecentList({
  items,
  loading,
}: {
  items: Transaction[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-[16px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-5 py-6">
        <p className="font-display italic text-[var(--color-ink-muted)]">loading…</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-[16px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-5 py-6 text-center">
        <p className="font-display italic text-[var(--color-ink-muted)]">Nothing here yet.</p>
      </div>
    );
  }
  return (
    <ul className="rounded-[16px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-5">
      {items.map((tx, idx) => {
        const isProcessing = txIsProcessing(tx.rawStatus);
        const dateLabel = formatRelativeDate(tx.date);
        const isToday = dateLabel === 'Today';
        const categoryLine = tx.category
          ? prettyCategory(tx.category)
          : tx.transactionType !== 'spending'
            ? prettyCategory(tx.transactionType)
            : '';
        // Apple-Wallet style: location wins over payment method when
        // the receipt has a geocoded place. Payment method only shows
        // for online/no-location entries; category is the last resort.
        const subtitle =
          tx.placeCity ?? tx.paymentMethod?.trim() ?? categoryLine;
        return (
          <li
            key={tx.id}
            className={cn(
              'grid grid-cols-[44px_1fr_auto] items-center gap-3 py-3',
              idx > 0 && 'border-t border-[var(--color-rule-soft)]',
            )}
          >
            <MerchantIcon
              brandId={tx.merchantBrandId}
              category={tx.category}
              transactionType={tx.transactionType}
              size={44}
            />
            {/* Body — a real <Link> (renders <a href>) so right-click → Open
                in New Tab, Cmd-click, and hover URL preview all work. While the
                row is still processing there's no receipt to open yet, so it
                falls back to a non-interactive div. */}
            {(() => {
              const body = (
                <>
                  <p className="font-display text-[14.5px] font-medium leading-snug truncate">
                    {tx.description}
                  </p>
                  {subtitle && (
                    <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] truncate">{subtitle}</p>
                  )}
                  <p
                    className={cn(
                      'mt-0.5 font-mono text-[10px] tnum truncate',
                      isToday
                        ? 'font-medium text-[var(--color-accent)]'
                        : 'text-[var(--color-ink-muted)]',
                    )}
                  >
                    {dateLabel}
                  </p>
                </>
              );
              return isProcessing ? (
                <div className="block text-left min-w-0 cursor-default opacity-60">{body}</div>
              ) : (
                <Link {...receiptLink(tx.id)} className="block text-left min-w-0 cursor-pointer">
                  {body}
                </Link>
              );
            })()}
            <span className="font-mono text-[14px] font-semibold tracking-tight tnum">
              ${Math.abs(tx.amount).toFixed(2)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function spendingTotals(
  summary: Array<{ category: string; total_spent: string | number; count: number }>,
): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const item of summary) {
    const { transactionType } = classifyBackendCategory(item.category);
    if (transactionType !== 'spending') continue;
    total += Math.abs(Number(item.total_spent));
    count += item.count;
  }
  return { total, count };
}

function currentMonthRange(now: Date): { from: string; to: string; now: Date } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  return { from: isoDay(first), to: isoDay(last), now };
}

function priorMonthRange(now: Date): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  return { from: isoDay(first), to: isoDay(last) };
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRelativeDate(isoDate: string): string {
  // Parse components directly so a "YYYY-MM-DD" string is interpreted in
  // local time, not UTC (which would shift the day for negative offsets).
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  if (!y || !m || !d) return isoDate;
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return target.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return `${m}/${d}/${String(y).slice(2)}`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} d ago`;
}

function splitAmount(amount: number): { whole: number; cents: string } {
  const abs = Math.abs(amount);
  const whole = Math.floor(abs);
  const cents = abs.toFixed(2).split('.')[1] ?? '00';
  return { whole, cents };
}

function prettyCategory(c: string): string {
  if (!c) return 'Other';
  // Backend keys are sometimes lower-case slugs ("groceries"), the Transaction
  // type uses Title Case ("Dining"). Normalize either way to display.
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}
