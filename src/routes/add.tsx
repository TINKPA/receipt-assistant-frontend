import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Capture from '../components/Capture';
import { useAppCtx } from '../lib/appContext';

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
  const { addJob, bumpRefresh } = useAppCtx();
  return (
    <Capture
      onCancel={() => navigate({ to: '/' })}
      onComplete={(job) => {
        addJob(job);
        bumpRefresh();
        // Drop back to Books so the user sees their entry processing.
        navigate({ to: '/' });
      }}
    />
  );
}
