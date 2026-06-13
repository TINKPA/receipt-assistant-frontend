import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';
import Layout from '../components/Layout';
import type { TabDestination } from '../components/TabBar';

export const Route = createFileRoute('/_shell')({
  component: ShellComponent,
});

/** Map the current pathname onto the 5-tab highlight (v2 IA).
 *
 *  Per iOS HIG, push-style detail pages keep their owning tab lit:
 *  - Ledger owns its drill-downs: /receipt, /merchant, /brand (board lane III).
 *  - Settings is the stack behind the Home gear, so /settings and /batches
 *    (entered via Settings → Uploads, FE#80) keep Home lit.
 *  - Reviews live in the Insights lane (board screens 22–23).
 */
function tabDestinationFor(pathname: string): TabDestination {
  if (pathname.startsWith('/transactions')) return 'ledger';
  if (pathname.startsWith('/receipt')) return 'ledger';
  if (pathname.startsWith('/merchant')) return 'ledger';
  if (pathname.startsWith('/brand')) return 'ledger';
  if (pathname.startsWith('/product')) return 'ledger';
  if (pathname.startsWith('/insights')) return 'insights';
  if (pathname.startsWith('/review')) return 'insights';
  if (pathname.startsWith('/owned')) return 'things';
  if (pathname.startsWith('/wish')) return 'things';
  // /, /settings, /batches → Home (gear stack)
  return 'home';
}

/**
 * App shell: the cream-paper Layout + bottom tab bar that wraps every
 * non-fullscreen screen. The `/add` Capture route lives OUTSIDE this shell
 * (directly under root) so it renders full-bleed with no tab bar. Tab
 * highlight is derived from the URL rather than threaded as a prop.
 */
function ShellComponent() {
  const pathname = useLocation({ select: (l) => l.pathname });
  return (
    <Layout tab={tabDestinationFor(pathname)}>
      <Outlet />
    </Layout>
  );
}
