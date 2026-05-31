import { createFileRoute } from '@tanstack/react-router';
import Products from '../../../../components/Products';
import { useBack } from '../../../../lib/useBack';

export const Route = createFileRoute('/_shell/settings/products/')({
  component: ProductsRoute,
});

function ProductsRoute() {
  const back = useBack('/settings');
  // Products keeps its own master-detail (selectedId) + class filter
  // internally for now; promoting those to /settings/products/$productId
  // and ?class is a deferred follow-up. The screen is fully reachable via
  // routing today.
  return <Products onBack={back} />;
}
