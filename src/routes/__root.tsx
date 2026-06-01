import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { AppProvider, useAppCtx } from '../lib/appContext';
import { invalidateLedgerSurfaces } from '../lib/queryClient';
import ProcessingToast from '../components/ProcessingToast';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <AppProvider>
      <Outlet />
      <ToastHost />
    </AppProvider>
  );
}

/**
 * The upload-progress toast lives at the root, outside the route Outlet, so
 * it survives navigation between any two screens. It reads the shared job
 * list from AppCtx and jumps to the produced transaction on tap.
 */
function ToastHost() {
  const { jobs, removeJob } = useAppCtx();
  const navigate = useNavigate();
  return (
    <ProcessingToast
      jobs={jobs}
      onJobDone={removeJob}
      onRefresh={invalidateLedgerSurfaces}
      onSelectTransaction={(id) =>
        navigate({ to: '/receipt/$receiptId', params: { receiptId: id } })
      }
    />
  );
}
