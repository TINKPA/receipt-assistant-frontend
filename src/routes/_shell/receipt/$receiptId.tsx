import { createFileRoute } from '@tanstack/react-router';
import ReceiptDetail from '../../../components/ReceiptDetail';
import { useBack } from '../../../lib/useBack';
import { invalidateLedgerSurfaces } from '../../../lib/queryClient';

export const Route = createFileRoute('/_shell/receipt/$receiptId')({
  component: ReceiptRoute,
});

function ReceiptRoute() {
  const { receiptId } = Route.useParams();
  const back = useBack('/transactions');
  // Merchant/brand navigation is now handled inside ReceiptDetail via real
  // <Link>s (AmountHero merchant name → brand, LocationCard → merchant), so
  // the route no longer threads onSelectMerchant/onSelectBrand callbacks.
  // A mutation (void/delete/restore/re-extract) invalidates the ledger, month
  // summary, and batches so every list surface reflects the change.
  return (
    <ReceiptDetail
      receiptId={receiptId}
      onBack={back}
      onAfterMutation={invalidateLedgerSurfaces}
    />
  );
}
