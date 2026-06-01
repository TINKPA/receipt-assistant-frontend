import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Batches from '../../../components/Batches';

export const Route = createFileRoute('/_shell/batches/')({
  component: BatchesRoute,
});

function BatchesRoute() {
  const navigate = useNavigate();
  // Batches reads via useQuery and refetches on cache invalidation, so it
  // stays mounted — no refreshKey remount needed.
  return (
    <Batches
      onSelectBatch={(id) => navigate({ to: '/batches/$batchId', params: { batchId: id } })}
    />
  );
}
