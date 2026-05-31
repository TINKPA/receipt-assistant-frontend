import { createFileRoute, useNavigate } from '@tanstack/react-router';
import MerchantDetail from '../../../components/MerchantDetail';
import { useBack } from '../../../lib/useBack';

export const Route = createFileRoute('/_shell/merchant/$merchantId')({
  component: MerchantRoute,
});

function MerchantRoute() {
  const { merchantId } = Route.useParams();
  const navigate = useNavigate();
  const back = useBack('/');
  return (
    <MerchantDetail
      key={merchantId}
      merchantId={merchantId}
      onBack={back}
      onSelectReceipt={(id) => navigate({ to: '/receipt/$receiptId', params: { receiptId: id } })}
      onSelectBrand={(id) => navigate({ to: '/brand/$brandId', params: { brandId: id } })}
    />
  );
}
