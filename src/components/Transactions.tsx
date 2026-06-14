import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { receiptLink } from '../lib/navLinks';
import {
  fetchTransactionsPage,
  extractProblemMessage,
  getDocument,
  getTransaction,
  hardDeleteTransaction,
  restoreDocument,
  documentContentUrl,
  type BackendDocument,
} from '../lib/api';
import { listTombstones, removeTombstone } from '../lib/tombstones';
import { qk } from '../lib/queryKeys';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { cn } from '../lib/utils';
import type { Transaction } from '../types';
import { isProcessing as txIsProcessing, statusBadge } from '../lib/transactionStatus';
import { MerchantIcon } from './MerchantIcon';
import TransactionRowMenu from './TransactionRowMenu';
import ConfirmActionDialog from './ConfirmActionDialog';
import UnreconcileDialog from './UnreconcileDialog';
import DeletedBadge from './DeletedBadge';
import ProcessingCardList from './ProcessingCard';
import type { ProcessingItem } from './useProcessingJobs';
import TransactionsFilters from './TransactionsFilters';
import {
  DATE_PRESET_LABEL,
  DEFAULT_FILTERS,
  currentMonthYM,
  effectiveDateRange,
  filterStateToSearch,
  isFilterActive,
  resolveSort,
  searchToFilterState,
  type FilterState,
  type TransactionsSearch,
} from '../lib/transactionsFilterState';
import { addMonths, monthLabelLong } from '../lib/month';

interface TransactionsProps {
  onSelectReceipt?: (receiptId: string) => void;
  /** The route's typed URL search params. Source of truth for the
   *  ledger's filter / sort / search / showDeleted view state. */
  search: TransactionsSearch;
  /** Write a new (already-stripped) search object back to the URL.
   *  Every mutation in this component flows through here. */
  onSearchChange: (next: TransactionsSearch) => void;
  /** In-flight uploads, rendered inline at the top of the ledger. */
  processingItems?: ProcessingItem[];
  onDismissProcessing?: (batchId: string) => void;
}

interface TombstoneRow {
  status: 'loading' | 'present' | 'gone';
  id: string;
  doc?: BackendDocument;
}

/**
 * Ledger — the transactions browser in the v2 editorial language (board
 * screen 02, tracking receipt-assistant#149): mono `day-h` banners with
 * daily totals, Fraunces merchant names, mono numerics.
 *
 * Backend wiring is unchanged: server-side filters (date / status / payee /
 * amount / q) re-fetch on debounced change; category filtering stays
 * client-side.
 */
export default function Transactions({
  onSelectReceipt,
  search,
  onSearchChange,
  processingItems = [],
  onDismissProcessing,
}: TransactionsProps) {
  const queryClient = useQueryClient();
  // The infinite-scroll sentinel; the IntersectionObserver below watches it.
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [hardDeleteTarget, setHardDeleteTarget] = useState<{ id: string; etag: string } | null>(null);
  const [unreconcileTarget, setUnreconcileTarget] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  // Board screen 02.5: a lightweight brand quick-filter above the rows.
  // Ephemeral (not URL-persisted) — the structured Category/Type/Sort
  // filters own the URL; this is a one-tap narrowing over what's loaded.
  const [brandFilter, setBrandFilter] = useState<string | null>(null);

  // All view state is derived from the URL — single source of truth.
  const { filters, sortId, q: searchQuery, showDeleted } = useMemo(
    () => searchToFilterState(search),
    [search],
  );

  // Push a partial view-state change back to the URL. We re-stringify
  // from the *current* derived state so callers only specify what changed.
  const pushState = (
    patch: Partial<{ filters: FilterState; sortId: string; q: string; showDeleted: boolean }>,
  ) => {
    onSearchChange(
      filterStateToSearch({
        filters: patch.filters ?? filters,
        sortId: patch.sortId ?? sortId,
        q: patch.q ?? searchQuery,
        showDeleted: patch.showDeleted ?? showDeleted,
      }),
    );
  };

  const setFilters = (next: FilterState) => pushState({ filters: next });
  const setSortId = (id: string) => pushState({ sortId: id });
  const toggleShowDeleted = () => pushState({ showDeleted: !showDeleted });

  // The free-text search input is debounced locally for responsive
  // typing, then settled into the URL — we don't want a history entry
  // per keystroke. `searchInput` tracks the live field; on debounce
  // settle we push it up only if it actually differs from the URL.
  const [searchInput, setSearchInput] = useState(searchQuery);
  // Keep the local input in sync when the URL changes from elsewhere
  // (back/forward, "clear all", a shared link).
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);
  const settledSearch = useDebouncedValue(searchInput, 300);
  useEffect(() => {
    if (settledSearch !== searchQuery) pushState({ q: settledSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledSearch]);

  const activeSort = useMemo(() => resolveSort(sortId), [sortId]);
  // `searchQuery` is already debounced at the input boundary (it only
  // changes once typing settles into the URL), so no extra debounce
  // here. Payee / amount inputs still write to the URL per-keystroke,
  // so those keep their in-fetch debounce.
  const debouncedSearch = searchQuery;
  const debouncedPayee = useDebouncedValue(filters.payeeContains, 300);
  const debouncedAmountMin = useDebouncedValue(filters.amountMinDollars, 300);
  const debouncedAmountMax = useDebouncedValue(filters.amountMaxDollars, 300);

  const dateRange = useMemo(() => effectiveDateRange(filters), [filters]);
  const hasActiveFilter = isFilterActive(filters, searchQuery);

  // The base query (everything except the cursor), shared by the first-page
  // fetch and loadMore so both page the same result set. Week-grouped
  // rendering only applies to the occurred_on sort; other sorts fall back to
  // a flat list (handled in the render path).
  const PAGE_SIZE = 50;
  const queryArgs = useMemo(() => {
    const dollarsToMinor = (s: string): number | undefined => {
      const trimmed = s.trim();
      if (!trimmed) return undefined;
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return undefined;
      return Math.round(n * 100);
    };
    return {
      limit: PAGE_SIZE,
      has_document: true,
      q: debouncedSearch.trim() || undefined,
      status: filters.status,
      payee_contains: debouncedPayee.trim() || undefined,
      amount_min_minor: dollarsToMinor(debouncedAmountMin),
      amount_max_minor: dollarsToMinor(debouncedAmountMax),
      from: dateRange.occurred_from,
      to: dateRange.occurred_to,
      sort: activeSort.sort,
      order: activeSort.order,
    };
  }, [
    debouncedSearch,
    debouncedPayee,
    debouncedAmountMin,
    debouncedAmountMax,
    filters.status,
    dateRange.occurred_from,
    dateRange.occurred_to,
    activeSort.sort,
    activeSort.order,
  ]);

  // Ledger rows via TanStack Query infinite pagination. The cursor-based
  // backend (fetchTransactionsPage → {items, nextCursor}) maps directly onto
  // useInfiniteQuery. Crucially the loaded pages now live in the query cache
  // keyed by queryArgs, so drilling into a receipt and coming back rehydrates
  // every page synchronously instead of refetching only page 1 — the
  // precondition for scroll restoration (#89). Refetch-on-mutation is driven
  // by cache invalidation (invalidateLedgerSurfaces on upload-complete, plus
  // the row handlers below), replacing the old refreshKey-as-effect-dep remount.
  const {
    data,
    isLoading: loading,
    isFetchingNextPage: loadingMore,
    error: listError,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: qk.transactions.list(queryArgs),
    queryFn: ({ pageParam }) =>
      fetchTransactionsPage({ ...queryArgs, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const transactions = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );
  const error = listError ? extractProblemMessage(listError) : null;

  // Auto-load the next page when the bottom sentinel scrolls into view.
  // fetchNextPage self-guards against concurrent calls, so the old in-flight
  // ref is gone.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage();
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, fetchNextPage]);

  // Soft-deleted documents the user chose to keep visible (showDeleted). Their
  // ids are tracked client-side in localStorage; each is re-checked against the
  // backend (stale ones self-prune). Its own query so a restore/hard-delete can
  // invalidate it independently of the main list. Disabled unless showDeleted.
  const { data: tombstones = [], isLoading: tombstoneLoading } = useQuery({
    queryKey: qk.tombstones,
    enabled: showDeleted,
    queryFn: async (): Promise<TombstoneRow[]> => {
      const ids = listTombstones();
      if (ids.length === 0) return [];
      const results = await Promise.allSettled(
        ids.map(async (id): Promise<TombstoneRow> => {
          try {
            const { data: doc } = await getDocument(id, { includeDeleted: true });
            if (!doc.deleted_at) {
              removeTombstone(id);
              return { status: 'gone', id };
            }
            return { status: 'present', id, doc };
          } catch {
            removeTombstone(id);
            return { status: 'gone', id };
          }
        }),
      );
      return results
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((x): x is TombstoneRow => x !== null && x.status !== 'gone');
    },
  });

  // Brand pills derived from what's loaded: rank brands by frequency,
  // keep the top few, label by prettified brand_id. Stays in sync with
  // the visible month — no extra fetch, no stale global brand list.
  const brandPills = useMemo(() => {
    const count = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.merchantBrandId) count.set(tx.merchantBrandId, (count.get(tx.merchantBrandId) ?? 0) + 1);
    }
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, n]) => ({ id, label: prettifyBrandId(id), count: n }));
  }, [transactions]);

  // A brand can scroll out of the visible set (month change, filter); if
  // the active pill no longer exists, fall back to All so rows reappear.
  useEffect(() => {
    if (brandFilter && !brandPills.some((p) => p.id === brandFilter)) setBrandFilter(null);
  }, [brandPills, brandFilter]);

  const filteredTransactions = useMemo(() => {
    let out = transactions;
    if (filters.transactionTypes.length > 0) {
      const typeSet = new Set(filters.transactionTypes);
      out = out.filter((tx) => typeSet.has(tx.transactionType));
    }
    if (filters.categories.length > 0) {
      const catSet = new Set<string>(filters.categories);
      out = out.filter((tx) => tx.category !== null && catSet.has(tx.category));
    }
    if (brandFilter) {
      out = out.filter((tx) => tx.merchantBrandId === brandFilter);
    }
    return out;
  }, [transactions, filters.categories, filters.transactionTypes, brandFilter]);

  const totalExpenses = filteredTransactions
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Group by period: ISO weeks for the recent stretch (this/last week),
  // calendar months for everything older — keeps history calm instead of
  // one "week of … · 1 entry" banner per sparse receipt.
  const groups = useMemo(
    () => groupTransactions(filteredTransactions),
    [filteredTransactions],
  );

  const handleHardDeleteRequest = async (txnId: string) => {
    setRowError(null);
    try {
      const fresh = await getTransaction(txnId);
      if (fresh.data.status === 'reconciled') {
        setUnreconcileTarget(txnId);
        return;
      }
      if (!fresh.etag) throw new Error('Missing ETag — refresh and retry.');
      setHardDeleteTarget({ id: txnId, etag: fresh.etag });
    } catch (err: unknown) {
      setRowError(extractProblemMessage(err));
    }
  };

  const handleHardDeleteConfirm = async () => {
    if (!hardDeleteTarget) return;
    await hardDeleteTransaction(hardDeleteTarget.id, hardDeleteTarget.etag);
    setHardDeleteTarget(null);
    // Hard delete drops the row from the list and creates a tombstone.
    queryClient.invalidateQueries({ queryKey: qk.transactions.all });
    queryClient.invalidateQueries({ queryKey: qk.tombstones });
  };

  const handleRestoreTombstone = async (id: string) => {
    try {
      await restoreDocument(id);
      removeTombstone(id);
      // Restore re-adds the row to the main list and removes the tombstone.
      queryClient.invalidateQueries({ queryKey: qk.transactions.all });
      queryClient.invalidateQueries({ queryKey: qk.tombstones });
    } catch (err: unknown) {
      setRowError(extractProblemMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <Header
        total={Math.abs(totalExpenses)}
        count={filteredTransactions.length}
        filters={filters}
        onMonthChange={(ym) =>
          setFilters({ ...filters, datePreset: 'month', month: ym })
        }
      />

      <SearchSoft
        value={searchInput}
        onChange={setSearchInput}
      />

      <TransactionsFilters
        filters={filters}
        onChange={setFilters}
        hasActiveFilter={hasActiveFilter}
        onClear={() => {
          // "Clear all" resets filters AND the free-text search, but
          // leaves sort (view config) untouched — same semantics as
          // before, now expressed as one URL write.
          setSearchInput('');
          setBrandFilter(null);
          pushState({ filters: DEFAULT_FILTERS, q: '' });
        }}
        showDeleted={showDeleted}
        onToggleShowDeleted={toggleShowDeleted}
        sortId={sortId}
        onSortChange={setSortId}
      />

      <BrandPillBar
        pills={brandPills}
        active={brandFilter}
        onSelect={setBrandFilter}
      />

      {rowError && (
        <div className="rounded-[16px] border border-[var(--color-stamp)]/30 bg-[var(--color-stamp)]/5 px-4 py-3 text-sm text-[var(--color-stamp)] flex items-center justify-between">
          <span>{rowError}</span>
          <button
            onClick={() => setRowError(null)}
            className="font-medium text-[var(--color-stamp)]/80 hover:text-[var(--color-stamp)]"
          >
            Dismiss
          </button>
        </div>
      )}

      {showDeleted && (
        <TombstonePanel
          loading={tombstoneLoading}
          rows={tombstones}
          onRestore={handleRestoreTombstone}
        />
      )}

      <ProcessingCardList
        items={processingItems}
        onDismiss={(batchId) => onDismissProcessing?.(batchId)}
        onSelectTransaction={onSelectReceipt}
      />

      {loading ? (
        <EmptyState>
          <p className="font-display italic text-lg text-[var(--color-ink-muted)]">loading…</p>
        </EmptyState>
      ) : error ? (
        <EmptyState>
          <p className="text-[var(--color-stamp)]">{error}</p>
        </EmptyState>
      ) : filteredTransactions.length === 0 ? (
        <EmptyState>
          <p className="font-display italic text-[var(--color-ink-muted)] text-lg">
            {filters.datePreset === 'month'
              ? `Nothing in ${monthLabelLong(filters.month || currentMonthYM())}.`
              : hasActiveFilter
                ? 'No entries match the current filters.'
                : 'No entries yet — capture your first receipt.'}
          </p>
        </EmptyState>
      ) : activeSort.sort === 'occurred_on' ? (
        <div className="space-y-7">
          {groups.map((g) => (
            <PeriodGroup
              key={g.startIso}
              group={g}
              onHardDelete={handleHardDeleteRequest}
              onUnreconcile={(id) => setUnreconcileTarget(id)}
            />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredTransactions.map((tx) => (
            <li key={tx.id}>
              <LedgerRow
                tx={tx}
                onHardDelete={handleHardDeleteRequest}
                onUnreconcile={(id) => setUnreconcileTarget(id)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Infinite-scroll sentinel: when it scrolls into view (or near it,
          per rootMargin) the next page loads and appends. Only present while
          a next page exists. */}
      {!loading && hasNextPage && (
        <div ref={sentinelRef} aria-hidden="true" className="h-1" />
      )}
      {loadingMore && (
        <p className="py-3 text-center font-display italic text-base text-[var(--color-ink-muted)]">
          loading more…
        </p>
      )}

      <ConfirmActionDialog
        isOpen={hardDeleteTarget !== null}
        onClose={() => setHardDeleteTarget(null)}
        title="Permanently delete this transaction?"
        message={
          <>
            <p>
              Removes the transaction, its postings, and any document links. The
              underlying receipt image (if any) is kept — only the transaction is
              destroyed.
            </p>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              This action cannot be undone.
            </p>
          </>
        }
        confirmLabel="Delete forever"
        destructive
        onConfirm={handleHardDeleteConfirm}
      />

      <UnreconcileDialog
        isOpen={unreconcileTarget !== null}
        onClose={() => setUnreconcileTarget(null)}
        transactionId={unreconcileTarget}
        onUnreconciled={() => {
          setUnreconcileTarget(null);
          queryClient.invalidateQueries({ queryKey: qk.transactions.all });
        }}
      />
    </div>
  );
}

/* ── Brand pill bar (board screen 02.5) ──────────────────────────── */

/** `apple-store` → `Apple Store`. Stable, no fetch; small joiner words stay low. */
function prettifyBrandId(id: string): string {
  const small = new Set(['and', 'or', 'of', 'the', 'a']);
  return id
    .split('-')
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function BrandPillBar({
  pills,
  active,
  onSelect,
}: {
  pills: Array<{ id: string; label: string; count: number }>;
  active: string | null;
  onSelect: (id: string | null) => void;
}) {
  // Below two brands there's nothing to choose between — hide entirely.
  if (pills.length < 2) return null;
  return (
    <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Pill label="All" active={active === null} onClick={() => onSelect(null)} />
      {pills.map((p) => (
        <Pill
          key={p.id}
          label={p.label}
          count={p.count}
          active={active === p.id}
          onClick={() => onSelect(active === p.id ? null : p.id)}
        />
      ))}
    </div>
  );
}

function Pill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[0.5px] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors',
        active
          ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]'
          : 'border-[var(--color-rule-soft)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:border-[var(--color-rule)]',
      )}
    >
      {label}
      {count != null && (
        <span className={cn('tnum text-[8.5px]', active ? 'text-[var(--color-paper-fold)]' : 'text-[var(--color-ink-faint)]')}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ── Header ───────────────────────────────────────────────────── */

function Header({
  total,
  count,
  filters,
  onMonthChange,
}: {
  total: number;
  count: number;
  filters: FilterState;
  onMonthChange: (ym: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display font-medium text-4xl leading-none tracking-tight">
          Ledger
        </h1>
        {filters.datePreset === 'month' ? (
          <MonthSwitcher
            ym={filters.month || currentMonthYM()}
            onChange={onMonthChange}
          />
        ) : (
          <p className="mt-2 font-display italic text-xl text-[var(--color-accent)] leading-none">
            {filters.datePreset === 'custom'
              ? 'custom range'
              : DATE_PRESET_LABEL[filters.datePreset].toLowerCase()}
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-mono text-[9px] font-medium tracking-[0.18em] uppercase text-[var(--color-ink-muted)]">
          TOTAL
        </p>
        <p className="mt-1 font-mono text-xl font-semibold tracking-tight tnum">
          ${Math.round(total).toLocaleString()}
        </p>
        <p className="font-mono text-[10px] text-[var(--color-ink-muted)]">
          {count} {count === 1 ? 'entry' : 'entries'}
        </p>
      </div>
    </div>
  );
}

/**
 * ‹ May 2026 › month stepper — the Ledger's primary navigation. "Next" is
 * capped at the current month (no browsing into empty future months). The
 * month name keeps the handwritten flourish so the header still feels warm.
 */
function MonthSwitcher({
  ym,
  onChange,
}: {
  ym: string;
  onChange: (ym: string) => void;
}) {
  const atCurrent = ym >= currentMonthYM();
  const arrow =
    'flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-muted)] ' +
    'hover:bg-[var(--color-paper-deep)] hover:text-[var(--color-ink)] transition-colors ' +
    'disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--color-ink-muted)]';
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Previous month"
        className={arrow}
        onClick={() => onChange(addMonths(ym, -1))}
      >
        ‹
      </button>
      <span className="font-display italic text-xl text-[var(--color-accent)] leading-none min-w-[7.5rem] text-center">
        {monthLabelLong(ym)}
      </span>
      <button
        type="button"
        aria-label="Next month"
        className={arrow}
        disabled={atCurrent}
        onClick={() => onChange(addMonths(ym, 1))}
      >
        ›
      </button>
    </div>
  );
}

/* ── Search ───────────────────────────────────────────────────── */

function SearchSoft({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 rounded-[16px] border border-[var(--color-rule)]',
        'bg-[var(--color-surface)] px-4 py-3',
        'focus-within:border-[var(--color-terracotta)] transition-colors',
      )}
    >
      <span
        aria-hidden="true"
        className="relative inline-block h-[18px] w-[18px] flex-shrink-0"
      >
        <span className="absolute inset-0 border-2 border-[var(--color-ink-muted)] rounded-full" />
        <span
          className="absolute bottom-[-3px] right-[-4px] h-[2px] w-2 bg-[var(--color-ink-muted)] rounded"
          style={{ transform: 'rotate(45deg)' }}
        />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Find rows, merchants, notes…"
        className={cn(
          'flex-1 bg-transparent outline-none border-none',
          'text-[15px] text-[var(--color-ink)]',
          'placeholder:font-mono placeholder:text-[12px] placeholder:text-[var(--color-ink-faint)]',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-[var(--color-ink-muted)] text-sm font-medium hover:text-[var(--color-ink)]"
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </label>
  );
}

/* ── Period group (recent weeks + older months) ───────────────── */

interface PeriodBucket {
  startIso: string;
  label: string;
  total: number;
  txs: Transaction[];
}

function PeriodGroup({
  group,
  onHardDelete,
  onUnreconcile,
}: {
  group: PeriodBucket;
  onHardDelete: (id: string) => void;
  onUnreconcile: (id: string) => void;
}) {
  return (
    <section>
      {/* Sticky band: while a group is in view its label + running total
          pin to the top so a long month never loses context. The paper
          background lets rows scroll cleanly underneath. */}
      {/* Board `day-h`: mono uppercase day banner with the day's total. */}
      <div className="sticky top-0 z-10 flex items-baseline gap-3 mb-2 bg-[var(--color-paper)] pt-2 pb-1.5">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          {group.label}
        </span>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
          {group.txs.length} {group.txs.length === 1 ? 'entry' : 'entries'}
        </span>
        <span className="ml-auto font-mono text-[11px] font-medium tnum text-[var(--color-ink-soft)]">
          ${Math.round(Math.abs(group.total)).toLocaleString()}
        </span>
      </div>
      <ul className="space-y-2">
        {group.txs.map((tx) => (
          <li key={tx.id}>
            <LedgerRow
              tx={tx}
              onHardDelete={onHardDelete}
              onUnreconcile={onUnreconcile}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Quiet source marker for the ledger row. Only NON-photo sources are
 * marked (email / PDF); a camera/photo receipt is the default and stays
 * unmarked, keeping the list calm (#76). Glyphs are forced to text
 * rendering (no emoji color) to sit in the muted meta line.
 */
function sourceTag(
  kind: string | null | undefined,
): { glyph: string; label: string } | null {
  if (kind === 'receipt_email') return { glyph: '✉︎', label: 'email' };
  if (kind === 'receipt_pdf' || kind === 'statement_pdf')
    return { glyph: '⌗', label: 'pdf' };
  return null;
}

function LedgerRow({
  tx,
  onHardDelete,
  onUnreconcile,
}: {
  tx: Transaction;
  onHardDelete: (id: string) => void;
  onUnreconcile: (id: string) => void;
}) {
  const isProcessing = txIsProcessing(tx.rawStatus);
  const badge = statusBadge(tx.rawStatus);
  const hasDoc = Boolean(tx.documentId);
  return (
    <div
      data-testid={`txn-row-${tx.id}`}
      className={cn(
        'grid grid-cols-[48px_1fr_auto_auto] items-center gap-3',
        'rounded-[16px] border border-[var(--color-rule)] bg-[var(--color-surface)] p-3 pr-2',
      )}
    >
      {/* Row icon cascade (FE#48): MerchantIcon (brand-recognition via
          #101 Phase 2) → CategoryIcon (color tile + glyph fallback).
          The place-map first layer (#96) was retired — the static map
          competed with the brand mark and made rows harder to scan;
          brand identity reads faster than location. */}
      <div className="relative h-12 w-12 flex-shrink-0">
        <MerchantIcon
          brandId={tx.merchantBrandId}
          category={tx.category}
          transactionType={tx.transactionType}
          size={48}
        />
        {hasDoc && (
          <span
            className={cn(
              'absolute -right-1 -top-1 flex h-[18px] w-[18px] items-center justify-center',
              'rounded-full bg-[var(--color-terracotta)] text-white text-[9px] font-medium',
            )}
            title="Has receipt"
          >
            ✦
          </span>
        )}
      </div>

      {/* Body — a real <Link> (renders <a href>) so right-click → Open in
          New Tab / Split View, Cmd-click, and hover URL preview all work.
          While the row is still processing there's no receipt to open yet,
          so it falls back to a non-interactive div. */}
      {(() => {
        const body = (
          <>
            <p className="font-display font-medium text-[15.5px] leading-tight tracking-tight truncate">
              {tx.description}
            </p>
            <p className="mt-0.5 font-mono text-[9.5px] tracking-[0.04em] uppercase text-[var(--color-ink-muted)] truncate">
              {rowLabelPrefix(tx)}{formatDay(tx.date)}
              {badge && (
                <span
                  className={cn(
                    'ml-1',
                    badge.tone === 'red' && 'text-[var(--color-stamp)]',
                    badge.tone === 'green' && 'text-[color:rgb(52,168,83)]',
                  )}
                >
                  · {badge.label}
                </span>
              )}
              {(() => {
                const src = sourceTag(tx.documentKind);
                return src ? (
                  <span className="ml-1" title={`From ${src.label}`}>
                    · <span className="not-italic">{src.glyph}</span> {src.label}
                  </span>
                ) : null;
              })()}
            </p>
          </>
        );
        return isProcessing ? (
          <div className="text-left min-w-0 cursor-default opacity-60">{body}</div>
        ) : (
          <Link
            {...receiptLink(tx.id)}
            className="block text-left min-w-0 cursor-pointer"
          >
            {body}
          </Link>
        );
      })()}

      {/* Amount */}
      <span
        className={cn(
          'font-mono text-[14.5px] font-semibold tracking-tight tnum px-1',
          badge?.strikethrough && 'line-through opacity-60',
        )}
      >
        ${Math.abs(tx.amount).toFixed(2)}
      </span>

      {/* Row menu */}
      <div onClick={(e) => e.stopPropagation()}>
        {!isProcessing && (
          <TransactionRowMenu
            rawStatus={tx.rawStatus}
            onHardDelete={() => onHardDelete(tx.id)}
            onUnreconcile={() => onUnreconcile(tx.id)}
          />
        )}
      </div>
    </div>
  );
}

/* ── Tombstones ───────────────────────────────────────────────── */

function TombstonePanel({
  loading,
  rows,
  onRestore,
}: {
  loading: boolean;
  rows: TombstoneRow[];
  onRestore: (id: string) => void;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-rule)] flex items-center gap-3">
        <h3 className="font-display italic font-medium text-lg">Recently deleted</h3>
        <span className="ml-auto text-xs text-[var(--color-ink-muted)] hidden sm:block">
          Tracked locally — restore brings the receipt back.
        </span>
      </div>
      {loading ? (
        <div className="py-10 text-center">
          <p className="font-display italic text-base text-[var(--color-ink-muted)]">loading…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-[var(--color-ink-muted)]">
          No recently deleted receipts in this browser.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-rule-soft)]">
          {rows.map((t) => (
            <li
              key={t.id}
              className="px-5 py-4 flex items-center gap-3"
              style={{
                background:
                  'repeating-linear-gradient(45deg, transparent 0 7px, rgba(140,130,115,0.07) 7px 9px)',
              }}
              data-testid={`tombstone-${t.id}`}
            >
              <div
                className="h-12 w-12 rounded-[14px] overflow-hidden flex-shrink-0"
                style={{ background: 'var(--color-paper-deep)' }}
              >
                {t.doc && (
                  <img
                    src={documentContentUrl(t.id)}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {t.doc?.file_path?.split('/').pop() ?? t.id}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <DeletedBadge deletedAt={t.doc?.deleted_at ?? null} />
                  <code className="text-[11px] text-[var(--color-ink-muted)] truncate">{t.id}</code>
                </div>
              </div>
              <button
                data-testid={`tombstone-restore-${t.id}`}
                onClick={() => onRestore(t.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2',
                  'bg-[var(--color-ink)] font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-paper)]',
                  'transition-opacity hover:opacity-85 flex-shrink-0',
                )}
              >
                ↺ Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Empty / loading shells ───────────────────────────────────── */

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5 py-12 text-center">
      {children}
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

/**
 * Pick the grouping that fits the visible range. A single calendar month
 * (the default month-scoped browse, or any one-month filter) groups by DAY —
 * the board's ledger (screen 02) reads as a daily journal with a `day-h`
 * banner per day. Anything spanning multiple months (all-time, a wide
 * custom range) groups by month instead, so sparse history stays calm
 * instead of emitting one banner per receipt.
 */
function groupTransactions(txs: Transaction[]): PeriodBucket[] {
  const months = new Set(txs.map((tx) => tx.date.slice(0, 7)));
  return months.size <= 1 ? groupByDay(txs) : groupByMonth(txs);
}

/** Day buckets with board-style labels ("Today" / "Yesterday" / "Thursday ·
 *  Jun 11"). Used when the view is a single month. */
function groupByDay(txs: Transaction[]): PeriodBucket[] {
  const buckets = new Map<string, PeriodBucket>();
  for (const tx of txs) {
    const key = tx.date;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { startIso: key, label: dayLabel(key), total: 0, txs: [] };
      buckets.set(key, bucket);
    }
    bucket.txs.push(tx);
    bucket.total += tx.amount;
  }
  return [...buckets.values()].sort((a, b) => (a.startIso < b.startIso ? 1 : -1));
}

/** "Today" / "Yesterday" / "Thursday · Jun 11" from a YYYY-MM-DD date. */
function dayLabel(isoDate: string): string {
  const today = toIso(new Date());
  if (isoDate === today) return 'Today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (isoDate === toIso(y)) return 'Yesterday';
  const [yy, mm, dd] = isoDate.split('-').map(Number);
  if (!yy || !mm || !dd) return isoDate;
  const dt = new Date(yy, mm - 1, dd);
  return `${dt.toLocaleString('en-US', { weekday: 'long' })} · ${dt.toLocaleString('en-US', { month: 'short' })} ${dd}`;
}

/**
 * Month buckets for multi-month views (all-time, wide custom ranges). The
 * current and previous ISO weeks keep their granular "this week" / "last
 * week" banners; everything older collapses into calendar-month buckets
 * ("April 2026", "December 2025"). This avoids the old failure mode where
 * each sparse historical receipt got its own "week of … · 1 entry" header,
 * and the month labels always carry the year so multi-year history reads in
 * order. All bucket keys are sortable YYYY-MM-DD strings, so the single
 * descending sort below stays monotonic across the week→month boundary.
 */
function groupByMonth(txs: Transaction[]): PeriodBucket[] {
  const today = new Date();
  const thisWeek = isoWeekStart(toIso(today));
  const lastWeek = (() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return isoWeekStart(toIso(d));
  })();

  const buckets = new Map<string, PeriodBucket>();
  for (const tx of txs) {
    const week = isoWeekStart(tx.date);
    if (!week) continue;

    let key: string;
    let label: string;
    if (week === thisWeek) {
      key = week;
      label = 'this week';
    } else if (week === lastWeek) {
      key = week;
      label = 'last week';
    } else {
      // First of the transaction's own month (not the week's Monday, which
      // could land in the prior month).
      const [y, m] = tx.date.split('-');
      key = `${y}-${m}-01`;
      label = monthLabel(key);
    }

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { startIso: key, label, total: 0, txs: [] };
      buckets.set(key, bucket);
    }
    bucket.txs.push(tx);
    bucket.total += tx.amount;
  }
  return [...buckets.values()].sort((a, b) => (a.startIso < b.startIso ? 1 : -1));
}

/** Returns the Monday of the week containing this ISO date, as YYYY-MM-DD. */
function isoWeekStart(isoDate: string): string | null {
  // Parse manually to avoid TZ shifts on bare YYYY-MM-DD.
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [y, m, d] = parts;
  const local = new Date(y, m - 1, d);
  const day = local.getDay(); // 0=Sun … 6=Sat
  const diff = (day + 6) % 7;  // distance back to Monday
  local.setDate(local.getDate() - diff);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** "April 2026" — full month + year, from a YYYY-MM-01 key. */
function monthLabel(startIso: string): string {
  const [y, m] = startIso.split('-').map(Number);
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDay(isoDate: string): string {
  // "Mon · May 5" — short, no year.
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return isoDate;
  const dt = new Date(y, m - 1, d);
  const dow = dt.toLocaleString('en-US', { weekday: 'short' });
  const mo = dt.toLocaleString('en-US', { month: 'short' });
  return `${dow.toUpperCase()} · ${mo} ${d}`;
}

/** Build the leading "<Category> · " (or "<Type> · ") label on a row.
 *  Spending rows with a known category render the category; spending
 *  rows with no category drop the label entirely rather than fall back
 *  to "spending". Non-spending rows show the transactionType (Income /
 *  Transfer / Investment), which IS meaningful for those flows. */
function rowLabelPrefix(tx: Transaction): string {
  if (tx.category) return `${tx.category} · `;
  if (tx.transactionType !== 'spending') {
    return `${tx.transactionType.charAt(0).toUpperCase()}${tx.transactionType.slice(1)} · `;
  }
  return '';
}
