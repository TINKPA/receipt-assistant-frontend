import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Dashboard from '../../components/Dashboard';
import { useAppCtx } from '../../lib/appContext';

export const Route = createFileRoute('/_shell/')({
  component: DashboardRoute,
});

function DashboardRoute() {
  const navigate = useNavigate();
  const { refreshKey } = useAppCtx();
  return (
    <Dashboard
      key={refreshKey}
      onSelectReceipt={(id) => navigate({ to: '/receipt/$receiptId', params: { receiptId: id } })}
      onViewAllTransactions={() => navigate({ to: '/transactions' })}
    />
  );
}
