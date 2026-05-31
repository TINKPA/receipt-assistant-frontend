import React from 'react';
import { useProcessingJobs } from '../components/useProcessingJobs';

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
 *   so outstanding uploads survive a full page reload).
 * - `refreshKey/bumpRefresh` drive the `key={refreshKey}` remount pattern the
 *   list screens use to refetch after a mutation.
 */
interface AppCtxValue {
  jobs: ReturnType<typeof useProcessingJobs>['jobs'];
  addJob: ReturnType<typeof useProcessingJobs>['addJob'];
  removeJob: ReturnType<typeof useProcessingJobs>['removeJob'];
  refreshKey: number;
  bumpRefresh: () => void;
}

const AppCtx = React.createContext<AppCtxValue | null>(null);

/** Provider — mounted once in __root.tsx. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const { jobs, addJob, removeJob } = useProcessingJobs();
  const [refreshKey, setRefreshKey] = React.useState(0);
  const bumpRefresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

  const value = React.useMemo<AppCtxValue>(
    () => ({ jobs, addJob, removeJob, refreshKey, bumpRefresh }),
    [jobs, addJob, removeJob, refreshKey, bumpRefresh],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useAppCtx(): AppCtxValue {
  const ctx = React.useContext(AppCtx);
  if (!ctx) throw new Error('useAppCtx must be used within <AppProvider>');
  return ctx;
}
