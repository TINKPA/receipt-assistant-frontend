import { createFileRoute, useNavigate } from '@tanstack/react-router';
import BatchDetail from '../../../components/BatchDetail';
import { useBack } from '../../../lib/useBack';

export const Route = createFileRoute('/_shell/batches/$batchId')({
  component: BatchDetailRoute,
});

function BatchDetailRoute() {
  const { batchId } = Route.useParams();
  const navigate = useNavigate();
  const back = useBack('/batches');
  return (
    <BatchDetail
      batchId={batchId}
      onBack={back}
      onSelectTransaction={(id) => navigate({ to: '/receipt/$receiptId', params: { receiptId: id } })}
    />
  );
}
