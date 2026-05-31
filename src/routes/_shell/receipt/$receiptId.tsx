import { createFileRoute, useNavigate } from '@tanstack/react-router';
import ReceiptDetail from '../../../components/ReceiptDetail';
import { useBack } from '../../../lib/useBack';
import { useAppCtx } from '../../../lib/appContext';

export const Route = createFileRoute('/_shell/receipt/$receiptId')({
  component: ReceiptRoute,
});

function ReceiptRoute() {
  const { receiptId } = Route.useParams();
  const navigate = useNavigate();
  const back = useBack('/transactions');
  const { bumpRefresh } = useAppCtx();
  return (
    <ReceiptDetail
      receiptId={receiptId}
      onBack={back}
      onSelectMerchant={(id) => navigate({ to: '/merchant/$merchantId', params: { merchantId: id } })}
      onSelectBrand={(id) => navigate({ to: '/brand/$brandId', params: { brandId: id } })}
      onAfterMutation={bumpRefresh}
    />
  );
}
