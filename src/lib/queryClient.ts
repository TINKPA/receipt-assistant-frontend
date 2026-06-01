import { QueryClient } from '@tanstack/react-query';
import { qk } from './queryKeys';

/**
 * Single app-wide QueryClient.
 *
 * Why a module singleton (not `new QueryClient()` inline in main.tsx): the
 * cache must outlive any component, and several non-render call sites need to
 * invalidate it — the `appContext` refresh bridge, mutation handlers in
 * ReceiptDetail / add / useProcessingJobs. Components reach it via
 * `useQueryClient()`; this export is the same instance the provider holds.
 *
 * Defaults chosen to preserve the app's pre-Query behavior:
 * - `staleTime: 30s` — list/detail data is considered fresh for half a minute,
 *   so drilling into a receipt and coming straight back doesn't refetch. This
 *   is the property that lets the Ledger keep its loaded pages on Back (#89).
 * - `gcTime: 5min` — cached pages survive a brief unmount (drill-in → Back)
 *   but don't accumulate forever.
 * - `refetchOnWindowFocus: false` — the legacy useEffect screens never
 *   refetched on focus; keep that to avoid surprise reloads.
 * - `retry: 1` — one retry on transient failure, matching the single-shot
 *   feel of the old fetches without hammering the backend.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Refresh every list/summary surface that a receipt mutation or a completed
 * upload can affect — the Ledger (`['transactions']`), the Dashboard month
 * summary (`['summary']`), and the Batches list (`['batches']`).
 *
 * This is the exact replacement for the old `bumpRefresh()` fan-out: that
 * counter remounted all three list screens at once; this invalidates the same
 * three query namespaces (by prefix, so arg-tails don't have to match). One
 * place to maintain so the call sites (upload-complete, add, receipt mutation,
 * the processing toast) can't drift apart. Replaces the migration bridge.
 */
export function invalidateLedgerSurfaces() {
  queryClient.invalidateQueries({ queryKey: qk.transactions.all });
  queryClient.invalidateQueries({ queryKey: qk.summary.all });
  queryClient.invalidateQueries({ queryKey: qk.batches.all });
}
