import { Transaction, Metric, Achievement, CategoryBreakdown, YearlySummary } from './types';

export const TRANSACTIONS: Transaction[] = [
  {
    id: '1',
    description: 'The Gilded Fork',
    category: 'Dining',
    date: 'Oct 24, 2023',
    paymentMethod: 'Amex Platinum',
    amount: -1240.00,
    status: 'Verified',
    icon: 'restaurant',
    color: 'primary'
  },
  {
    id: '2',
    description: 'Delta Airlines',
    category: 'Transport',
    date: 'Oct 22, 2023',
    paymentMethod: 'Bank Transfer',
    amount: -4850.30,
    status: 'Pending',
    icon: 'flight',
    color: 'tertiary'
  },
  {
    id: '3',
    description: 'Grid Solutions LLC',
    category: 'Utilities',
    date: 'Oct 20, 2023',
    paymentMethod: 'Visa Signature',
    amount: -315.45,
    status: 'Verified',
    icon: 'bolt',
    color: 'secondary'
  },
  {
    id: '4',
    description: 'Grand Cinema Premiere',
    category: 'Fun',
    date: 'Oct 18, 2023',
    paymentMethod: 'Amex Platinum',
    amount: -85.00,
    status: 'Verified',
    icon: 'theaters',
    color: 'error'
  },
  {
    id: '5',
    description: 'Dividends Payout',
    category: 'Income',
    date: 'Oct 15, 2023',
    paymentMethod: 'Investment Portfolio',
    amount: 12400.00,
    status: 'Verified',
    icon: 'account_balance',
    color: 'primary'
  }
];

export const DASHBOARD_METRICS: Metric[] = [
  {
    label: 'Total Wealth',
    value: '$2,481,209.50',
    change: '+12.4%',
    trend: 'up',
    subText: 'Since last month',
    icon: 'account_balance_wallet'
  }
];

export const ASSET_METRICS = [
  { label: 'Liquid Assets', value: '$412,000' },
  { label: 'Investments', value: '$1,890,209' },
  { label: 'Liability', value: '-$121,000', isNegative: true }
];

export const YEARLY_GROWTH_DATA = [
  { month: 'Jan', assets: 30 },
  { month: 'Feb', assets: 35 },
  { month: 'Mar', assets: 42 },
  { month: 'Apr', assets: 38 },
  { month: 'May', assets: 50 },
  { month: 'Jun', assets: 55 },
  { month: 'Jul', assets: 62 },
  { month: 'Aug', assets: 70 },
  { month: 'Sep', assets: 78 },
  { month: 'Oct', assets: 85 },
  { month: 'Nov', assets: 92 },
  { month: 'Dec', assets: 100 }
];

export const CATEGORY_BREAKDOWN: CategoryBreakdown[] = [
  { name: 'Real Estate', amount: 124000, percentage: 45, color: 'primary', icon: 'real_estate_agent' },
  { name: 'Lifestyle & Travel', amount: 82500, percentage: 30, color: 'secondary', icon: 'flight_takeoff' },
  { name: 'Investments', amount: 68200, percentage: 25, color: 'tertiary', icon: 'monitoring' }
];

export const ACHIEVEMENTS: Achievement[] = [
  {
    title: 'Saved $10k this year!',
    description: 'Personal liquidity milestone reached ahead of schedule.',
    date: 'AUGUST 2025',
    icon: 'workspace_premium',
    color: 'primary'
  },
  {
    title: 'Investment Growth',
    description: 'Portfolio outperformed S&P 500 by a margin of 4.2%.',
    date: 'OCTOBER 2025',
    icon: 'trending_up',
    color: 'tertiary'
  },
  {
    title: 'Mortgage Reduced',
    description: 'Lump-sum payment reduced total interest by $12,400.',
    date: 'DECEMBER 2025',
    icon: 'home',
    color: 'secondary'
  }
];

export const YEARLY_SUMMARY: YearlySummary[] = [
  { quarter: 'Q1 2025', inflow: 112050, outflow: 84120, netSavings: 27930, status: 'SURPLUS' },
  { quarter: 'Q2 2025', inflow: 118400, outflow: 81300, netSavings: 37100, status: 'SURPLUS' },
  { quarter: 'Q3 2025', inflow: 125200, outflow: 89700, netSavings: 35500, status: 'SURPLUS' },
  { quarter: 'Q4 2025', inflow: 126450, outflow: 84400, netSavings: 42050, status: 'PEAK' }
];
