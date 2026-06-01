import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Capture from '../components/Capture';
import { useAppCtx } from '../lib/appContext';
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
        // Drop back to Books so the user sees their entry processing.
        navigate({ to: '/' });
      }}
    />
  );
}
