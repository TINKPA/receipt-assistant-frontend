/**
 * Reports resource — summary / trends / net-worth / cashflow, plus the
 * legacy-summary shim the existing Dashboard consumes.
 *
 * Imports shared things from `./core` only.
 */
import { client, unwrap } from './core';
import type {
  BackendSummaryReport,
  BackendTrendsReport,
  BackendNetWorthReport,
  BackendCashflowReport,
} from './core';

export async function getSummaryReport(opts: {
  from?: string;
  to?: string;
  groupBy?: 'category' | 'account' | 'payee';
  currency?: string;
} = {}): Promise<BackendSummaryReport> {
  const { data, error, response } = await client.GET('/v1/reports/summary', {
    params: {
      query: {
        from: opts.from,
        to: opts.to,
        group_by: opts.groupBy,
        currency: opts.currency,
      },
    },
  });
  return unwrap('getSummaryReport', data, error, response.status);
}

export async function getTrendsReport(opts: {
  from?: string;
  to?: string;
  period?: 'month' | 'year';
  groupBy?: 'category' | 'total';
  currency?: string;
} = {}): Promise<BackendTrendsReport> {
  const { data, error, response } = await client.GET('/v1/reports/trends', {
    params: {
      query: {
        from: opts.from,
        to: opts.to,
        period: opts.period,
        group_by: opts.groupBy,
        currency: opts.currency,
      },
    },
  });
  return unwrap('getTrendsReport', data, error, response.status);
}

export async function getNetWorthReport(opts: {
  asOf?: string;
  currency?: string;
} = {}): Promise<BackendNetWorthReport> {
  const { data, error, response } = await client.GET('/v1/reports/net_worth', {
    params: { query: { as_of: opts.asOf, currency: opts.currency } },
  });
  return unwrap('getNetWorthReport', data, error, response.status);
}

export async function getCashflowReport(opts: {
  from?: string;
  to?: string;
  currency?: string;
} = {}): Promise<BackendCashflowReport> {
  const { data, error, response } = await client.GET('/v1/reports/cashflow', {
    params: {
      query: { from: opts.from, to: opts.to, currency: opts.currency },
    },
  });
  return unwrap('getCashflowReport', data, error, response.status);
}

// ── Summary shim for the existing Dashboard ────────────────────
//
// Old `/summary` returned an array of `{ category, count, total_spent }`.
// The new `/v1/reports/summary?group_by=category` returns
// `{ items: [{ key, count, total_minor, ... }], grand_total_minor }`.
// Shape the old consumer expects `Number(s.total_spent)` / `s.category` /
// `s.count`, so we remap.

export interface LegacySummaryItem {
  category: string;
  count: number;
  total_spent: number;
}

export async function fetchSummary(opts: {
  from?: string;
  to?: string;
} = {}): Promise<LegacySummaryItem[]> {
  const rep = await getSummaryReport({
    from: opts.from,
    to: opts.to,
    groupBy: 'category',
  });
  return rep.items.map((it) => ({
    category: it.key || 'other',
    count: it.count,
    total_spent: it.total_minor / 100,
  }));
}
export type SpendingSummary = LegacySummaryItem;
