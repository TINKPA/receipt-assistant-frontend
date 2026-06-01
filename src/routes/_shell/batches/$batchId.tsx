import { createFileRoute } from '@tanstack/react-router';
import BatchDetail from '../../../components/BatchDetail';
import { useBack } from '../../../lib/useBack';

export const Route = createFileRoute('/_shell/batches/$batchId')({
  component: BatchDetailRoute,
});

function BatchDetailRoute() {
  const { batchId } = Route.useParams();
  const back = useBack('/batches');
  // Produced transaction IDs render as real <Link>s inside BatchDetail, so no
  // onSelectTransaction callback is threaded through.
  return <BatchDetail batchId={batchId} onBack={back} />;
}
