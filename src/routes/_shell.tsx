import { createFileRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import Layout from '../components/Layout';
import type { DockDestination } from '../components/FloatingDock';

export const Route = createFileRoute('/_shell')({
  component: ShellComponent,
});

/** Map the current pathname onto the 3-pill dock highlight. */
function dockDestinationFor(pathname: string): DockDestination {
  if (pathname.startsWith('/review')) return 'review';
  if (pathname.startsWith('/settings')) return 'settings';
  // /, /transactions, /batches, /receipt, /merchant, /brand → Books
  return 'books';
}

/**
 * App shell: the cream-paper Layout + floating dock that wraps every
 * non-fullscreen screen. The `/add` Capture route lives OUTSIDE this shell
 * (directly under root) so it renders full-bleed with no dock. Dock
 * highlight is derived from the URL rather than threaded as a prop.
 */
function ShellComponent() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  return (
    <Layout
      dockActive={dockDestinationFor(pathname)}
      onDockNavigate={(dest) => navigate({ to: dest === 'books' ? '/' : '/review/monthly' })}
      onAddTransaction={() => navigate({ to: '/add' })}
      onSettings={() => navigate({ to: '/settings' })}
    >
      <Outlet />
    </Layout>
  );
}
