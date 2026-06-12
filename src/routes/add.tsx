import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Capture from '../components/Capture';
import { useAppCtx } from '../lib/appCtx';
import { invalidateLedgerSurfaces } from '../lib/queryClient';

/**
 * `/add` is a full-screen capture surface. It is intentionally a child of the
 * root route, NOT the `_shell` layout route, so it renders full-bleed with no
 * floating dock (matching the old `dockHidden` behaviour).
 */
export const Route = createFileRoute('/add')({
  component: AddRoute,
});

function AddRoute() {
  const navigate = useNavigate();
  const { addJob } = useAppCtx();
  return (
    <Capture
      onCancel={() => navigate({ to: '/' })}
      onComplete={(job) => {
        addJob(job);
        invalidateLedgerSurfaces();
        // Board screen 16: land on the live extraction trace (BatchDetail's
        // SSE stage view) instead of dropping back to Home — every stage
        // visible. The inline processing card still covers Home/Ledger for
        // anyone who navigates away mid-extraction.
        navigate({ to: '/batches/$batchId', params: { batchId: job.batchId } });
      }}
    />
  );
}
