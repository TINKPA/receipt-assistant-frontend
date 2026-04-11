export type Category = 'Dining' | 'Transport' | 'Utilities' | 'Fun' | 'Income' | 'Shopping' | 'Housing' | 'Investments' | 'Travel' | 'Entertainment' | 'Real Estate';

export interface Transaction {
  id: string;
  description: string;
  category: Category;
  date: string;
  paymentMethod: string;
  amount: number;
  status: 'Verified' | 'Pending' | 'New Charge' | 'Surplus' | 'Peak';
  icon: string;
  color: string;
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
