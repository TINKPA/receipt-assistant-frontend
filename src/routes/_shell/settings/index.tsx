import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Settings from '../../../components/Settings';

export const Route = createFileRoute('/_shell/settings/')({
  component: SettingsRoute,
});

function SettingsRoute() {
  const navigate = useNavigate();
  return (
    <Settings
      onOpenProducts={() => navigate({ to: '/settings/products' })}
      onOpenBrands={() => navigate({ to: '/settings/brands' })}
    />
  );
}
