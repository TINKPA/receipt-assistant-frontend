import { createFileRoute, useNavigate } from '@tanstack/react-router';
import AddManually from '../components/AddManually';

/**
 * `/add-manual` — the no-receipt sibling of `/add`. Like `/add` it is a
 * child of the root route rather than `_shell`, so it renders full-bleed
 * with no floating dock.
 *
 * A flat sibling path, not `/add/manual`: TanStack's flat routing would
 * turn the existing `add.tsx` into a layout owing an `<Outlet />`, which
 * would break the camera surface for the sake of a prettier URL.
 */
export const Route = createFileRoute('/add-manual')({
  component: AddManualRoute,
});

function AddManualRoute() {
  const navigate = useNavigate();
  return (
    <AddManually
      onCancel={() => navigate({ to: '/add' })}
      onComplete={(result) => {
        // Land on the thing that was just created — the same "see the
        // result immediately" ending the camera path gets from the live
        // extraction trace. There is no batch to watch here; the finished
        // transaction is the whole story.
        navigate({ to: '/receipt/$receiptId', params: { receiptId: result.transactionId } });
      }}
    />
  );
}
