import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Transactions from '../../components/Transactions';
import {
  transactionsSearchSchema,
  type TransactionsSearch,
} from '../../lib/transactionsFilterState';
import { useAppCtx } from '../../lib/appContext';

/**
 * /transactions — the Ledger.
 *
 * Filter / sort / search / showDeleted state is owned by the URL via
 * `validateSearch` (typed by `transactionsSearchSchema`), so the view is
 * shareable and survives a refresh. `Transactions` is a pure controlled
 * component: it reads the parsed `search` and reports every mutation back
 * through `onSearchChange`, which we turn into a `navigate({ search })`.
 */
export const Route = createFileRoute('/_shell/transactions')({
  validateSearch: transactionsSearchSchema,
  component: TransactionsRoute,
});

function TransactionsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/transactions' });
  const { refreshKey } = useAppCtx();
  return (
    <Transactions
      key={refreshKey}
      search={search}
      onSearchChange={(next: TransactionsSearch) =>
        // `replace` so view-state tweaks (typing in a filter, toggling a
        // chip) don't flood the back-button history with one entry per
        // keystroke — the URL stays shareable and refresh-safe regardless.
        navigate({ search: next, replace: true })
      }
      onSelectReceipt={(id) =>
        navigate({ to: '/receipt/$receiptId', params: { receiptId: id } })
      }
    />
  );
}
