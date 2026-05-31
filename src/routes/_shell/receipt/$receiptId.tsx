import { createFileRoute } from '@tanstack/react-router';
import ReceiptDetail from '../../../components/ReceiptDetail';
import { useBack } from '../../../lib/useBack';
import { useAppCtx } from '../../../lib/appContext';

export const Route = createFileRoute('/_shell/receipt/$receiptId')({
  component: ReceiptRoute,
});

function ReceiptRoute() {
  const { receiptId } = Route.useParams();
  const back = useBack('/transactions');
  const { bumpRefresh } = useAppCtx();
  // Merchant/brand navigation is now handled inside ReceiptDetail via real
  // <Link>s (AmountHero merchant name → brand, LocationCard → merchant), so
  // the route no longer threads onSelectMerchant/onSelectBrand callbacks.
  return (
    <ReceiptDetail
      receiptId={receiptId}
      onBack={back}
      onAfterMutation={bumpRefresh}
    />
  );
}
