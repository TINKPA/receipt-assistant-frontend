import React from 'react';
import { useProcessingJobs } from '../components/useProcessingJobs';
import { invalidateLedgerSurfaces } from './queryClient';

/**
 * Cross-route application context — now scoped to just the upload-job
 * machinery (the post-mutation refresh moved entirely to TanStack Query cache
 * invalidation in #90, so the old `refreshKey`/`bumpRefresh` counter is gone).
 *
 * - `jobs/addJob/removeJob` come from useProcessingJobs (localStorage-backed,
 *   so outstanding uploads survive a full page reload). The root-level
 *   floating `ProcessingToast` consumes these.
 * - `items/dismiss` are the same jobs projected to polled, render-ready state.
 *   The inline `ProcessingCardList` (top of the ledger / dashboard) consumes
 *   these. Polling lives in the hook; when an upload completes the hook's
 *   `onRefresh` fires `invalidateLedgerSurfaces()` and every list query
 *   (ledger / month summary / batches) refetches in place.
 */
interface AppCtxValue {
  jobs: ReturnType<typeof useProcessingJobs>['jobs'];
  addJob: ReturnType<typeof useProcessingJobs>['addJob'];
  removeJob: ReturnType<typeof useProcessingJobs>['removeJob'];
  items: ReturnType<typeof useProcessingJobs>['items'];
  dismiss: ReturnType<typeof useProcessingJobs>['dismiss'];
}

const AppCtx = React.createContext<AppCtxValue | null>(null);

/** Provider — mounted once in __root.tsx. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  // A completed upload (non-dedup) calls onRefresh; invalidate every list
  // surface so the inline card's real row appears in place without a reload.
  const { jobs, addJob, removeJob, items, dismiss } = useProcessingJobs({
    onRefresh: invalidateLedgerSurfaces,
  });

  const value = React.useMemo<AppCtxValue>(
    () => ({ jobs, addJob, removeJob, items, dismiss }),
    [jobs, addJob, removeJob, items, dismiss],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useAppCtx(): AppCtxValue {
  const ctx = React.useContext(AppCtx);
  if (!ctx) throw new Error('useAppCtx must be used within <AppProvider>');
  return ctx;
}
