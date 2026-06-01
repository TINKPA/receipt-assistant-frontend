import { createContext, useContext } from 'react';
import type { useProcessingJobs } from '../components/useProcessingJobs';

/**
 * Cross-route app context — the upload-job machinery shared between the root
 * `ProcessingToast` and the inline `ProcessingCardList`. The context object,
 * its value type, and the `useAppCtx` accessor live here (a non-component
 * module) rather than alongside `<AppProvider>` in `appContext.tsx`, so that
 * file can export only its component and keep React Fast Refresh working.
 */
export interface AppCtxValue {
  jobs: ReturnType<typeof useProcessingJobs>['jobs'];
  addJob: ReturnType<typeof useProcessingJobs>['addJob'];
  removeJob: ReturnType<typeof useProcessingJobs>['removeJob'];
  items: ReturnType<typeof useProcessingJobs>['items'];
  dismiss: ReturnType<typeof useProcessingJobs>['dismiss'];
}

export const AppCtx = createContext<AppCtxValue | null>(null);

export function useAppCtx(): AppCtxValue {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useAppCtx must be used within <AppProvider>');
  return ctx;
}
