/**
 * Reports resource — summary / trends / net-worth / cashflow, plus the
 * legacy-summary shim the existing Dashboard consumes.
 *
 * Every report is in the workspace base currency, named by `currency` in
 * the response. None takes a currency parameter: the one these wrappers
 * used to pass only wrote the requested code next to the same
 * base-currency figures. (The type checker does not catch a leftover
 * `currency` in a query object — it only rejects an unknown key when it
 * is the sole one — so do not rely on the build to find it.)
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
} = {}): Promise<BackendSummaryReport> {
  const { data, error, response } = await client.GET('/v1/reports/summary', {
    params: {
      query: {
        from: opts.from,
        to: opts.to,
        group_by: opts.groupBy,
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
} = {}): Promise<BackendTrendsReport> {
  const { data, error, response } = await client.GET('/v1/reports/trends', {
    params: {
      query: {
        from: opts.from,
        to: opts.to,
        period: opts.period,
        group_by: opts.groupBy,
      },
    },
  });
  return unwrap('getTrendsReport', data, error, response.status);
}

export async function getNetWorthReport(opts: {
  asOf?: string;
} = {}): Promise<BackendNetWorthReport> {
  const { data, error, response } = await client.GET('/v1/reports/net_worth', {
    params: { query: { as_of: opts.asOf } },
  });
  return unwrap('getNetWorthReport', data, error, response.status);
}

export async function getCashflowReport(opts: {
  from?: string;
  to?: string;
} = {}): Promise<BackendCashflowReport> {
  const { data, error, response } = await client.GET('/v1/reports/cashflow', {
    params: {
      query: { from: opts.from, to: opts.to },
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
