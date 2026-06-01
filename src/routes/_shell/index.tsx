import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Dashboard from '../../components/Dashboard';
import { useAppCtx } from '../../lib/appContext';

export const Route = createFileRoute('/_shell/')({
  component: DashboardRoute,
});

function DashboardRoute() {
  const navigate = useNavigate();
  const { items: processingItems, dismiss: dismissProcessing } = useAppCtx();
  return (
    // No key={refreshKey}: Dashboard now reads via useQuery and refetches on
    // cache invalidation (upload-complete / mutation → invalidateLedgerSurfaces),
    // so it stays mounted instead of remounting.
    <Dashboard
      onSelectReceipt={(id) => navigate({ to: '/receipt/$receiptId', params: { receiptId: id } })}
      onViewAllTransactions={() => navigate({ to: '/transactions' })}
      // Inline upload status (#85), mirrored on the home view: the in-flight
      // receipt shows as a card above "recent" and resolves in place once the
      // completed upload invalidates the recent-list query.
      processingItems={processingItems}
      onDismissProcessing={dismissProcessing}
    />
  );
}
