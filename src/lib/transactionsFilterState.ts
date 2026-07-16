import { z } from 'zod';
import {
  CATEGORIES,
  TRANSACTION_TYPES,
  type Category,
  type RawTransactionStatus,
  type TransactionType,
} from '../types';

export type DatePreset = 'month' | 'all' | 'last_30d' | 'last_90d' | 'this_year' | 'custom';

export interface FilterState {
  datePreset: DatePreset;
  // Only consulted when datePreset === 'month'. YYYY-MM; '' means the
  // current calendar month (resolved against `now` in effectiveDateRange).
  // This is the Ledger's default browse mode — see the month switcher.
  month: string;
  // Only consulted when datePreset === 'custom'.
  customFrom: string;
  customTo: string;
  // Empty array = all categories.
  categories: Category[];
  // Empty array = all transaction types. When set without 'spending',
  // category filter has no effect and the category chip is hidden in UI.
  transactionTypes: TransactionType[];
  status?: RawTransactionStatus;
  payeeContains: string;
  // Dollars as user-entered strings; converted to minor units when querying.
  amountMinDollars: string;
  amountMaxDollars: string;
}

export const DEFAULT_FILTERS: FilterState = {
  datePreset: 'month',
  month: '',
  customFrom: '',
  customTo: '',
  categories: [],
  transactionTypes: [],
  status: undefined,
  payeeContains: '',
  amountMinDollars: '',
  amountMaxDollars: '',
};

export const DATE_PRESET_LABEL: Record<DatePreset, string> = {
  month: 'This month',
  all: 'All time',
  last_30d: 'Last 30 days',
  last_90d: 'Last 90 days',
  this_year: 'This year',
  custom: 'Custom range',
};

export const STATUS_OPTIONS: { value: RawTransactionStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'reconciled', label: 'Reconciled' },
  { value: 'error', label: 'Error' },
];

/* ── Sort ─────────────────────────────────────────────────────── */
// Sort is view config, not a filter, so it lives outside FilterState —
// the "clear all" button doesn't reset it.

export type SortKey = 'occurred_on' | 'amount' | 'created_at';
export type SortOrder = 'asc' | 'desc';

export interface SortOption {
  id: string;
  // Long form used inside the popover.
  label: string;
  // Short form used on the chip itself.
  chipLabel: string;
  sort: SortKey;
  order: SortOrder;
}

// Amount sort key on the backend is MAX(ABS(amount_base_minor)) per
// transaction — the largest leg. Same axis as the amount_min/max
// filters, so filtering and sorting agree on what "amount" means.
export const SORT_OPTIONS: SortOption[] = [
  { id: 'date-desc',    label: 'Date (newest first)',     chipLabel: 'Date ↓',         sort: 'occurred_on', order: 'desc' },
  { id: 'date-asc',     label: 'Date (oldest first)',     chipLabel: 'Date ↑',         sort: 'occurred_on', order: 'asc'  },
  { id: 'amount-desc',  label: 'Amount (largest first)',  chipLabel: 'Amount ↓',       sort: 'amount',      order: 'desc' },
  { id: 'amount-asc',   label: 'Amount (smallest first)', chipLabel: 'Amount ↑',       sort: 'amount',      order: 'asc'  },
  { id: 'created-desc', label: 'Recently added',          chipLabel: 'Recently added', sort: 'created_at',  order: 'desc' },
];

export const DEFAULT_SORT_ID = 'date-desc';

export function resolveSort(id: string): SortOption {
  return SORT_OPTIONS.find((o) => o.id === id) ?? SORT_OPTIONS[0];
}

/** Current calendar month as YYYY-MM, against a reference date. */
export function currentMonthYM(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Compute the ISO date range that should be sent to the backend
 *  for a given filter state. Returns undefined values for "no bound". */
export function effectiveDateRange(
  filters: FilterState,
  now: Date = new Date(),
): { occurred_from?: string; occurred_to?: string } {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  switch (filters.datePreset) {
    case 'month': {
      // Default browse mode: a single calendar month. '' = current month.
      const ym = filters.month || currentMonthYM(now);
      const [y, m] = ym.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month
      return {
        occurred_from: `${ym}-01`,
        occurred_to: `${ym}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    case 'all':
      return {};
    case 'last_30d': {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { occurred_from: ymd(from), occurred_to: ymd(now) };
    }
    case 'last_90d': {
      const from = new Date(now);
      from.setDate(from.getDate() - 90);
      return { occurred_from: ymd(from), occurred_to: ymd(now) };
    }
    case 'this_year': {
      return { occurred_from: `${now.getFullYear()}-01-01`, occurred_to: ymd(now) };
    }
    case 'custom':
      return {
        occurred_from: filters.customFrom || undefined,
        occurred_to: filters.customTo || undefined,
      };
  }
}

export function isFilterActive(filters: FilterState, q: string): boolean {
  return (
    // Month mode (any month) is the default browse mode, not a "filter".
    filters.datePreset !== 'month' ||
    filters.categories.length > 0 ||
    filters.transactionTypes.length > 0 ||
    filters.status !== undefined ||
    filters.payeeContains.trim() !== '' ||
    filters.amountMinDollars.trim() !== '' ||
    filters.amountMaxDollars.trim() !== '' ||
    q.trim() !== ''
  );
}

/* ── URL search params ────────────────────────────────────────── */
// The Ledger's filter / sort / search / showDeleted state lives in the
// URL (shareable, survives refresh). The schema below is the typed
// contract TanStack Router's `validateSearch` enforces, and the two
// helpers convert between that flat search object and the in-component
// {filters, sortId, q, showDeleted} shape.
//
// Every field is optional with `.catch(default)`, so a malformed URL
// (hand-edited, stale link) degrades to the default value instead of
// throwing. To keep URLs clean, `filterStateToSearch` only emits keys
// whose value differs from its default — TanStack drops `undefined`
// keys from the querystring entirely.

const datePresetSchema = z.enum(['month', 'all', 'last_30d', 'last_90d', 'this_year', 'custom']);
const statusSchema = z.enum(['draft', 'posted', 'reconciled', 'error']);
const sortIdSchema = z.enum(SORT_OPTIONS.map((o) => o.id) as [string, ...string[]]);

// Every field is `.optional().catch(default)`: the `.catch` wraps the
// whole optional so ANY parse failure (wrong type, unknown enum member,
// hand-mangled URL) resolves to the default instead of throwing. This
// is what lets `validateSearch` never reject a URL.
export const transactionsSearchSchema = z.object({
  // Date preset + (month-only) month + (custom-only) bounds.
  datePreset: datePresetSchema.optional().catch(DEFAULT_FILTERS.datePreset),
  month: z.string().optional().catch(''),
  from: z.string().optional().catch(''),
  to: z.string().optional().catch(''),
  // Multi-selects. A malformed value (or unknown member) falls to [].
  categories: z.array(z.enum(CATEGORIES)).optional().catch([]),
  types: z.array(z.enum(TRANSACTION_TYPES)).optional().catch([]),
  status: statusSchema.optional().catch(undefined),
  payee: z.string().optional().catch(''),
  amountMin: z.string().optional().catch(''),
  amountMax: z.string().optional().catch(''),
  // View config (survives "clear all").
  sort: sortIdSchema.optional().catch(DEFAULT_SORT_ID),
  // Free-text search (previously lifted to App.tsx; now URL-owned).
  q: z.string().optional().catch(''),
  showDeleted: z.boolean().optional().catch(false),
});

export type TransactionsSearch = z.infer<typeof transactionsSearchSchema>;

/** Decode the URL search object into the shapes the component consumes.
 *  Missing keys fall back to DEFAULT_FILTERS / DEFAULT_SORT_ID. */
export function searchToFilterState(search: TransactionsSearch): {
  filters: FilterState;
  sortId: string;
  q: string;
  showDeleted: boolean;
} {
  const filters: FilterState = {
    datePreset: search.datePreset ?? DEFAULT_FILTERS.datePreset,
    month: search.month ?? DEFAULT_FILTERS.month,
    customFrom: search.from ?? DEFAULT_FILTERS.customFrom,
    customTo: search.to ?? DEFAULT_FILTERS.customTo,
    categories: search.categories ?? DEFAULT_FILTERS.categories,
    transactionTypes: search.types ?? DEFAULT_FILTERS.transactionTypes,
    status: search.status ?? DEFAULT_FILTERS.status,
    payeeContains: search.payee ?? DEFAULT_FILTERS.payeeContains,
    amountMinDollars: search.amountMin ?? DEFAULT_FILTERS.amountMinDollars,
    amountMaxDollars: search.amountMax ?? DEFAULT_FILTERS.amountMaxDollars,
  };
  return {
    filters,
    sortId: search.sort ?? DEFAULT_SORT_ID,
    q: search.q ?? '',
    showDeleted: search.showDeleted ?? false,
  };
}

/** Encode component state back into a clean URL search object —
 *  only non-default keys are emitted, so the URL stays minimal. */
export function filterStateToSearch(args: {
  filters: FilterState;
  sortId: string;
  q: string;
  showDeleted: boolean;
}): TransactionsSearch {
  const { filters, sortId, q, showDeleted } = args;
  const out: TransactionsSearch = {};
  if (filters.datePreset !== DEFAULT_FILTERS.datePreset) out.datePreset = filters.datePreset;
  // A non-current month is the only month worth putting in the URL — the
  // default ('' = current month) stays implicit so the bare URL is clean.
  if (filters.datePreset === 'month' && filters.month) out.month = filters.month;
  // Custom bounds are only meaningful for the 'custom' preset.
  if (filters.datePreset === 'custom') {
    if (filters.customFrom) out.from = filters.customFrom;
    if (filters.customTo) out.to = filters.customTo;
  }
  if (filters.categories.length > 0) out.categories = filters.categories;
  if (filters.transactionTypes.length > 0) out.types = filters.transactionTypes;
  if (filters.status !== undefined) out.status = filters.status;
  if (filters.payeeContains.trim() !== '') out.payee = filters.payeeContains;
  if (filters.amountMinDollars.trim() !== '') out.amountMin = filters.amountMinDollars;
  if (filters.amountMaxDollars.trim() !== '') out.amountMax = filters.amountMaxDollars;
  if (sortId !== DEFAULT_SORT_ID) out.sort = sortId;
  if (q.trim() !== '') out.q = q;
  if (showDeleted) out.showDeleted = true;
  return out;
}
