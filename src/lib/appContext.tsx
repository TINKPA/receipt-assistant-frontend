import React from 'react';
import { useProcessingJobs } from '../components/useProcessingJobs';
import { invalidateLedgerSurfaces } from './queryClient';
import { AppCtx, type AppCtxValue } from './appCtx';

/**
 * Cross-route application context provider — scoped to the upload-job
 * machinery (the post-mutation refresh moved entirely to TanStack Query cache
 * invalidation in #90, so the old `refreshKey`/`bumpRefresh` counter is gone).
 * The context object + `useAppCtx` accessor live in `./appCtx` so this module
 * exports only the component (keeps Fast Refresh happy).
 *
 * - `addJob` comes from useProcessingJobs (localStorage-backed, so outstanding
 *   uploads survive a full page reload); the `add` route enqueues with it.
 * - `items/dismiss` are those jobs projected to polled, render-ready state.
 *   The inline `ProcessingCardList` (top of the ledger / dashboard) consumes
 *   these. Polling lives in the hook; when an upload completes the hook's
 *   `onRefresh` fires `invalidateLedgerSurfaces()` and every list query
 *   (ledger / month summary / batches) refetches in place.
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
  // A completed upload (non-dedup) calls onRefresh; invalidate every list
  // surface so the inline card's real row appears in place without a reload.
  const { addJob, items, dismiss } = useProcessingJobs({
    onRefresh: invalidateLedgerSurfaces,
  });

  const value = React.useMemo<AppCtxValue>(
    () => ({ addJob, items, dismiss }),
    [addJob, items, dismiss],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
