import { useState } from 'react';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import Capture from '../components/Capture';
import { useAppCtx } from '../lib/appCtx';
import { invalidateLedgerSurfaces } from '../lib/queryClient';
import { watchCapture } from '../lib/wishSession';

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
  const router = useRouter();
  const qc = useQueryClient();
  const { addJob } = useAppCtx();
  const { mode } = Route.useSearch();
  // The mode the screen was opened in. `/add?mode=want` is linked only from
  // Wanting, so a screen opened that way with history behind it came from
  // the Places list.
  const [openedFor] = useState(mode ?? 'receipt');
  const toPlaces = () =>
    navigate({ to: '/wish', search: { section: 'places' }, replace: true });
  return (
    <Capture
      initialMode={mode ?? 'receipt'}
      onModeChange={(next) =>
        void navigate({
          to: '/add',
          search: { mode: next === 'want' ? 'want' : undefined },
          replace: true,
        })
      }
      // Closing goes back where the screen was opened from, whichever mode
      // it was switched to since (a switch replaces the entry, so Back
      // passes over it). Opened straight from a link, with nothing behind
      // it: Wanting if it was opened for a want, else Home.
      onCancel={() => {
        if (router.history.canGoBack()) router.history.back();
        else if (openedFor === 'want') void toPlaces();
        else void navigate({ to: '/' });
      }}
      // After a want is saved the capture screen is done with: it is
      // replaced, never left in history for Back to land on, empty.
      onWantSaved={({ wish, existing }) => {
        void qc.invalidateQueries({ queryKey: ['wish-items'] });
        // The same image saved before: nothing new was made, so show the
        // wish it made then, and say so.
        if (existing) {
          void navigate({
            to: '/wish/$wishId',
            params: { wishId: wish.id },
            search: { notice: 'already-saved' },
            replace: true,
          });
          return;
        }
        // Watched, so the Places list can say where it went if its reading
        // finds a thing to buy rather than a place.
        watchCapture(wish.id);
        // The new wish is `reading`; the Places list shows it as such and
        // polls until the server has filled it in. Opened from that list,
        // go back to it rather than stack a second copy on top.
        if (openedFor === 'want' && router.history.canGoBack()) {
          router.history.back();
          return;
        }
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
