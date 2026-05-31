import { createFileRoute } from '@tanstack/react-router';
import Brands from '../../../../components/Brands';
import { useBack } from '../../../../lib/useBack';

export const Route = createFileRoute('/_shell/settings/brands/')({
  component: BrandsRoute,
});

function BrandsRoute() {
  const back = useBack('/settings');
  // Brands keeps its own master-detail (selected) internally for now;
  // promoting brand detail to /settings/brands/$brandId is a deferred
  // follow-up. The screen is fully reachable via routing today.
  return <Brands onBack={back} />;
}
