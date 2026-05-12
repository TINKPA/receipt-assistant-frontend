import type { Category, RawTransactionStatus, TransactionType } from '../types';

export type DatePreset = 'all' | 'last_30d' | 'last_90d' | 'this_year' | 'custom';

export interface FilterState {
  datePreset: DatePreset;
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
  datePreset: 'all',
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
  all: 'All time',
  last_30d: 'Last 30 days',
  last_90d: 'Last 90 days',
  this_year: 'This year',
  custom: 'Custom range',
};

export const STATUS_OPTIONS: { value: RawTransactionStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'voided', label: 'Voided' },
  { value: 'reconciled', label: 'Reconciled' },
  { value: 'error', label: 'Error' },
];

/** Compute the ISO date range that should be sent to the backend
 *  for a given filter state. Returns undefined values for "no bound". */
export function effectiveDateRange(
  filters: FilterState,
  now: Date = new Date(),
): { occurred_from?: string; occurred_to?: string } {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  switch (filters.datePreset) {
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
    filters.datePreset !== 'all' ||
    filters.categories.length > 0 ||
    filters.transactionTypes.length > 0 ||
    filters.status !== undefined ||
    filters.payeeContains.trim() !== '' ||
    filters.amountMinDollars.trim() !== '' ||
    filters.amountMaxDollars.trim() !== '' ||
    q.trim() !== ''
  );
}
