import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import Capture from '../components/Capture';
import { useAppCtx } from '../lib/appCtx';
import { invalidateLedgerSurfaces } from '../lib/queryClient';

/**
 * `/add` is a full-screen capture surface. It is intentionally a child of the
 * root route, NOT the `_shell` layout route, so it renders full-bleed with no
 * floating dock (matching the old `dockHidden` behaviour).
 */
// `/add?mode=want` opens the screen ready to save a want (a screenshot of
// a restaurant) instead of a receipt. Absent means Receipt.
const addSearch = z.object({
  mode: z.enum(['receipt', 'want']).optional().catch(undefined),
});

export const Route = createFileRoute('/add')({
  validateSearch: addSearch,
  component: AddRoute,
});

function AddRoute() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { addJob } = useAppCtx();
  const { mode } = Route.useSearch();
  const toPlaces = () => navigate({ to: '/wish', search: { section: 'places' } });
  return (
    <Capture
      initialMode={mode ?? 'receipt'}
      // Opened from Wanting, the screen closes back to Wanting.
      onCancel={() => (mode === 'want' ? toPlaces() : navigate({ to: '/' }))}
      onWantSaved={() => {
        // The new wish is `reading`; the Places list shows it as such and
        // polls until the server has filled it in.
        void qc.invalidateQueries({ queryKey: ['wish-items'] });
        void toPlaces();
      }}
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
