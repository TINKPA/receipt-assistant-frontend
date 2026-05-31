import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Batches from '../../../components/Batches';
import { useAppCtx } from '../../../lib/appContext';

export const Route = createFileRoute('/_shell/batches/')({
  component: BatchesRoute,
});

function BatchesRoute() {
  const navigate = useNavigate();
  const { refreshKey } = useAppCtx();
  return (
    <Batches
      key={refreshKey}
      onSelectBatch={(id) => navigate({ to: '/batches/$batchId', params: { batchId: id } })}
    />
  );
}
