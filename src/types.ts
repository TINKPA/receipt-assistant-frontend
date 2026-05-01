export type Category = 'Dining' | 'Transport' | 'Utilities' | 'Fun' | 'Income' | 'Shopping' | 'Housing' | 'Investments' | 'Travel' | 'Entertainment' | 'Real Estate';

export type RawTransactionStatus =
  | 'draft'
  | 'posted'
  | 'voided'
  | 'reconciled'
  | 'error';

export interface Transaction {
  id: string;
  description: string;
  category: Category;
  date: string;
  paymentMethod: string;
  amount: number;
  status: 'Verified' | 'Pending' | 'New Charge' | 'Surplus' | 'Peak' | 'Processing';
  icon: string;
  color: string;
  /** The raw backend status (before UI normalization). Needed for delete /
   *  unreconcile menus that branch on `posted` vs `reconciled` etc. */
  rawStatus?: RawTransactionStatus;
  /** Primary linked document id, if any — needed for tombstone toggle and
   *  delete-receipt cascade flows from the list. */
  documentId?: string | null;
}

export interface Metric {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down';
  subText?: string;
  icon?: string;
}

export interface Achievement {
  title: string;
  description: string;
  date: string;
  icon: string;
  color: string;
}

export interface CategoryBreakdown {
  name: string;
  amount: number;
  percentage: number;
  color: string;
  icon: string;
}

export interface YearlySummary {
  quarter: string;
  inflow: number;
  outflow: number;
  netSavings: number;
  status: 'SURPLUS' | 'PEAK';
}
