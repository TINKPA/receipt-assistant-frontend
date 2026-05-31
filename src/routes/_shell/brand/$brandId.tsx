import { createFileRoute, useNavigate } from '@tanstack/react-router';
import BrandPage from '../../../components/BrandPage';
import { useBack } from '../../../lib/useBack';

export const Route = createFileRoute('/_shell/brand/$brandId')({
  component: BrandRoute,
});

function BrandRoute() {
  const { brandId } = Route.useParams();
  const navigate = useNavigate();
  const back = useBack('/');
  return (
    <BrandPage
      key={brandId}
      brandId={brandId}
      onBack={back}
      onSelectMerchant={(id) => navigate({ to: '/merchant/$merchantId', params: { merchantId: id } })}
      onSelectBrand={(id) => navigate({ to: '/brand/$brandId', params: { brandId: id } })}
      onSelectReceipt={(id) => navigate({ to: '/receipt/$receiptId', params: { receiptId: id } })}
    />
  );
}
