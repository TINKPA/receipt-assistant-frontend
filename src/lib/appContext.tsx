import React from 'react';
import { useProcessingJobs } from '../components/useProcessingJobs';
import { queryClient } from './queryClient';

/**
 * Cross-route application context.
 *
 * Before TanStack Router, the upload→extraction job list (ProcessingToast)
 * and the post-mutation `refreshKey` lived in App.tsx component state. With
 * routing, the toast must persist across navigation and any route must be
 * able to push a job or bump the refresh counter — so both move into a
 * context provided once at the root route, above the <Outlet/>.
 *
 * - `jobs/addJob/removeJob` come from useProcessingJobs (localStorage-backed,
 *   so outstanding uploads survive a full page reload). The root-level
 *   floating `ProcessingToast` consumes these.
 * - `items/dismiss` are the same jobs projected to polled, render-ready state.
 *   The inline `ProcessingCardList` (top of the ledger / dashboard) consumes
 *   these. Polling lives in the hook, so a completed upload bumps `refreshKey`
 *   via the `onRefresh` wiring below and the list refetches in place.
 * - `refreshKey/bumpRefresh` drive the `key={refreshKey}` remount pattern the
 *   list screens use to refetch after a mutation. During the TanStack Query
 *   migration (#90), `bumpRefresh` is a *bridge*: it bumps the counter AND
 *   invalidates the Query cache, so screens still on the remount pattern and
 *   screens already moved to Query both refresh from the one signal. Both the
 *   counter and this bridge are deleted once every screen is migrated (PR5).
 */
interface AppCtxValue {
  jobs: ReturnType<typeof useProcessingJobs>['jobs'];
  addJob: ReturnType<typeof useProcessingJobs>['addJob'];
  removeJob: ReturnType<typeof useProcessingJobs>['removeJob'];
  items: ReturnType<typeof useProcessingJobs>['items'];
  dismiss: ReturnType<typeof useProcessingJobs>['dismiss'];
  refreshKey: number;
  bumpRefresh: () => void;
}

const AppCtx = React.createContext<AppCtxValue | null>(null);

/** Provider — mounted once in __root.tsx. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  // Bridge (migration #90): one refresh signal must reach both worlds while
  // screens move to TanStack Query one at a time. The counter bump still
  // remounts any screen on the legacy `key={refreshKey}` pattern; the
  // unfiltered `invalidateQueries()` marks every cached query stale so any
  // already-migrated screen refetches too. With zero queries registered today
  // the invalidate is a harmless no-op — each migrated screen starts honoring
  // it the moment it lands. Counter + bridge are removed in PR5.
  const bumpRefresh = React.useCallback(() => {
    setRefreshKey((k) => k + 1);
    queryClient.invalidateQueries();
  }, []);
  // A completed upload (non-dedup) calls onRefresh; route the same single
  // refresh signal the rest of the app uses so the inline card's real row
  // appears in place without a manual reload.
  const { jobs, addJob, removeJob, items, dismiss } = useProcessingJobs({
    onRefresh: bumpRefresh,
  });

  const value = React.useMemo<AppCtxValue>(
    () => ({ jobs, addJob, removeJob, items, dismiss, refreshKey, bumpRefresh }),
    [jobs, addJob, removeJob, items, dismiss, refreshKey, bumpRefresh],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useAppCtx(): AppCtxValue {
  const ctx = React.useContext(AppCtx);
  if (!ctx) throw new Error('useAppCtx must be used within <AppProvider>');
  return ctx;
}
