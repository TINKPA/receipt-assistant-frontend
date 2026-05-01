import React, { useEffect, useState } from 'react';
import { TrendingDown, Filter, Utensils, Plane, Zap, Film, Landmark, ShoppingBag, Car, Loader2, Eye, EyeOff, RotateCcw, FileX } from 'lucide-react';
import {
  fetchTransactions,
  extractProblemMessage,
  getDocument,
  getTransaction,
  hardDeleteTransaction,
  restoreDocument,
  documentContentUrl,
  type BackendDocument,
} from '../lib/api';
import { listTombstones, removeTombstone } from '../lib/tombstones';
import { cn } from '../lib/utils';
import type { Transaction } from '../types';
import TransactionRowMenu from './TransactionRowMenu';
import ConfirmActionDialog from './ConfirmActionDialog';
import UnreconcileDialog from './UnreconcileDialog';
import DeletedBadge from './DeletedBadge';

interface TransactionsProps {
  onSelectReceipt?: (receiptId: string) => void;
}

interface TombstoneRow {
  status: 'loading' | 'present' | 'gone';
  id: string;
  doc?: BackendDocument;
}

export default function Transactions({ onSelectReceipt }: TransactionsProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Row-action dialogs.
  const [hardDeleteTarget, setHardDeleteTarget] = useState<{ id: string; etag: string } | null>(null);
  const [unreconcileTarget, setUnreconcileTarget] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // "Show deleted" panel.
  const [showDeleted, setShowDeleted] = useState(false);
  const [tombstones, setTombstones] = useState<TombstoneRow[]>([]);
  const [tombstoneLoading, setTombstoneLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchTransactions({ limit: 50, has_document: true })
      .then(setTransactions)
      .catch((e: unknown) => setError(extractProblemMessage(e)))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    if (!showDeleted) {
      setTombstones([]);
      return;
    }
    const ids = listTombstones();
    if (ids.length === 0) {
      setTombstones([]);
      return;
    }
    setTombstoneLoading(true);
    setTombstones(ids.map((id) => ({ status: 'loading', id })));
    Promise.allSettled(
      ids.map(async (id): Promise<TombstoneRow> => {
        try {
          const { data } = await getDocument(id, { includeDeleted: true });
          if (!data.deleted_at) {
            // Already restored elsewhere — drop from local cache.
            removeTombstone(id);
            return { status: 'gone', id };
          }
          return { status: 'present', id, doc: data };
        } catch {
          // 404 / network — assume hard-deleted, drop from cache.
          removeTombstone(id);
          return { status: 'gone', id };
        }
      }),
    )
      .then((results) => {
        const next = results
          .map((r) => (r.status === 'fulfilled' ? r.value : null))
          .filter((x): x is TombstoneRow => x !== null && x.status !== 'gone');
        setTombstones(next);
      })
      .finally(() => setTombstoneLoading(false));
  }, [showDeleted, refreshKey]);

  const totalExpenses = transactions
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

  const getIcon = (category: string) => {
    switch (category) {
      case 'Dining': return <Utensils size={18} />;
      case 'Transport': return <Car size={18} />;
      case 'Utilities': return <Zap size={18} />;
      case 'Fun': return <Film size={18} />;
      case 'Income': return <Landmark size={18} />;
      case 'Shopping': return <ShoppingBag size={18} />;
      case 'Travel': return <Plane size={18} />;
      default: return <Landmark size={18} />;
    }
  };

  const getColorClass = (category: string) => {
    switch (category) {
      case 'Dining': return 'text-primary border-primary/20';
      case 'Transport': return 'text-tertiary border-tertiary/20';
      case 'Utilities': return 'text-secondary border-secondary/20';
      case 'Fun': return 'text-error border-error/20';
      case 'Income': return 'text-primary border-primary/40 bg-primary-container';
      case 'Shopping': return 'text-secondary border-secondary/20';
      case 'Travel': return 'text-tertiary border-tertiary/20';
      default: return 'text-on-surface-variant border-outline-variant/20';
    }
  };

  const getBadgeClass = (category: string) => {
    switch (category) {
      case 'Dining': return 'bg-primary/10 text-primary';
      case 'Transport': return 'bg-tertiary/10 text-tertiary';
      case 'Utilities': return 'bg-secondary/10 text-secondary';
      case 'Fun': return 'bg-error/10 text-error';
      case 'Income': return 'bg-primary/20 text-primary';
      case 'Shopping': return 'bg-secondary/10 text-secondary';
      case 'Travel': return 'bg-tertiary/10 text-tertiary';
      default: return 'bg-surface-container-highest text-on-surface-variant';
    }
  };

  const handleHardDeleteRequest = async (txnId: string) => {
    setRowError(null);
    try {
      const fresh = await getTransaction(txnId);
      if (fresh.data.status === 'reconciled') {
        // Reconciled transactions can't be hard-deleted; offer
        // unreconcile instead.
        setUnreconcileTarget(txnId);
        return;
      }
      if (!fresh.etag) throw new Error('Missing ETag — refresh and retry.');
      setHardDeleteTarget({ id: txnId, etag: fresh.etag });
    } catch (err: unknown) {
      setRowError(extractProblemMessage(err));
    }
  };

  const handleHardDeleteConfirm = async () => {
    if (!hardDeleteTarget) return;
    await hardDeleteTransaction(hardDeleteTarget.id, hardDeleteTarget.etag);
    setHardDeleteTarget(null);
    setRefreshKey((k) => k + 1);
  };

  const handleRestoreTombstone = async (id: string) => {
    try {
      await restoreDocument(id);
      removeTombstone(id);
      setTombstones((prev) => prev.filter((t) => t.id !== id));
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setRowError(extractProblemMessage(err));
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-extrabold text-white font-headline tracking-tight">Transaction History</h2>
          <p className="text-on-surface-variant mt-2 font-inter">Manage and monitor your digital private banking activity.</p>
        </div>

        <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 flex items-center gap-6">
          <div className="p-3 bg-error-container/20 rounded-full">
            <TrendingDown className="text-error" size={24} />
          </div>
          <div>
            <p className="text-on-surface-variant text-xs font-medium uppercase tracking-widest mb-1">Total Expenses</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white font-headline">
                {totalExpenses.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </span>
              <span className="text-on-surface-variant text-xs">{transactions.length} transactions</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="bg-surface-container-high px-4 py-2 rounded-xl flex items-center gap-3 border border-outline-variant/15 text-sm font-medium text-white">
          <span className="text-on-surface-variant">Date:</span> All Time
        </div>
        <div className="bg-surface-container-high px-4 py-2 rounded-xl flex items-center gap-3 border border-outline-variant/15 text-sm font-medium text-white">
          <span className="text-on-surface-variant">Category:</span> All
        </div>
        <button
          data-testid="toggle-show-deleted"
          onClick={() => setShowDeleted((s) => !s)}
          className={cn(
            'px-4 py-2 rounded-xl flex items-center gap-2 border text-sm font-medium transition-colors',
            showDeleted
              ? 'bg-error/10 border-error/30 text-error'
              : 'bg-surface-container-high border-outline-variant/15 text-white hover:border-outline-variant/30',
          )}
        >
          {showDeleted ? <EyeOff size={16} /> : <Eye size={16} />}
          {showDeleted ? 'Hide deleted' : 'Show deleted'}
        </button>
        <button className="ml-auto flex items-center gap-2 text-primary font-bold text-sm hover:opacity-80 transition-opacity">
          <Filter size={16} />
          More Filters
        </button>
      </div>

      {rowError && (
        <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-sm text-error flex items-center justify-between">
          <span>{rowError}</span>
          <button onClick={() => setRowError(null)} className="text-error/70 hover:text-error font-bold">
            Dismiss
          </button>
        </div>
      )}

      {showDeleted && (
        <div className="glass-panel border border-outline-variant/10 rounded-xl overflow-hidden">
          <div className="px-8 py-5 border-b border-outline-variant/10 flex items-center gap-3">
            <FileX className="text-error" size={20} />
            <h3 className="font-headline font-bold text-white">Recently Deleted</h3>
            <span className="text-xs text-on-surface-variant ml-auto">
              Tracked locally in this browser. Restore brings the receipt back to the main list.
            </span>
          </div>
          {tombstoneLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-on-surface-variant" size={24} />
            </div>
          ) : tombstones.length === 0 ? (
            <div className="py-12 text-center text-sm text-on-surface-variant">
              No recently deleted receipts in this browser.
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant/5">
              {tombstones.map((t) => (
                <li
                  key={t.id}
                  className="px-8 py-5 flex items-center gap-4"
                  data-testid={`tombstone-${t.id}`}
                >
                  <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center overflow-hidden flex-shrink-0">
                    {t.doc ? (
                      <img
                        src={documentContentUrl(t.id)}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <FileX className="text-on-surface-variant" size={20} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {t.doc?.file_path?.split('/').pop() ?? t.id}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <DeletedBadge deletedAt={t.doc?.deleted_at ?? null} />
                      <code className="text-xs text-on-surface-variant truncate">{t.id}</code>
                    </div>
                  </div>
                  <button
                    data-testid={`tombstone-restore-${t.id}`}
                    onClick={() => handleRestoreTombstone(t.id)}
                    className="px-4 py-2 rounded-xl bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 flex-shrink-0"
                  >
                    <RotateCcw size={16} />
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="glass-panel border border-outline-variant/10 rounded-xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={32} />
            <span className="ml-3 text-on-surface-variant">Loading transactions...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-error">{error}</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">No transactions yet. Upload a receipt to get started.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Description</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Category</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Date</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Payment</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Status</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline text-right">Amount</th>
                <th className="px-2 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  data-testid={`txn-row-${tx.id}`}
                  onClick={() => tx.status !== 'Processing' && onSelectReceipt?.(tx.id)}
                  className={cn(
                    "hover:bg-surface-container-high/30 transition-colors group",
                    tx.status === 'Processing' ? 'cursor-default opacity-70' : 'cursor-pointer'
                  )}
                >
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center border",
                        tx.status === 'Processing' ? 'text-tertiary border-tertiary/20 animate-pulse' : getColorClass(tx.category)
                      )}>
                        {tx.status === 'Processing' ? <Loader2 className="animate-spin" size={18} /> : getIcon(tx.category)}
                      </div>
                      <span className={cn(
                        "font-bold transition-colors",
                        tx.status === 'Processing' ? 'text-on-surface-variant' : 'text-white group-hover:text-primary'
                      )}>
                        {tx.description}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    {tx.status !== 'Processing' && (
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider",
                        getBadgeClass(tx.category)
                      )}>
                        {tx.category}
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-6 text-sm text-on-surface-variant">{tx.status === 'Processing' ? '--' : tx.date}</td>
                  <td className="px-8 py-6 text-sm text-on-surface-variant">{tx.status === 'Processing' ? '--' : tx.paymentMethod}</td>
                  <td className="px-8 py-6">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      tx.status === 'Processing' ? 'bg-tertiary/10 text-tertiary animate-pulse' :
                      tx.status === 'Verified' ? 'bg-primary/10 text-primary' :
                      tx.status === 'Pending' ? 'bg-error/10 text-error' :
                      'bg-tertiary/10 text-tertiary'
                    )}>
                      {tx.status}
                    </span>
                  </td>
                  <td className={cn(
                    "px-8 py-6 text-right font-headline font-bold",
                    tx.status === 'Processing' ? 'text-on-surface-variant' :
                    tx.amount > 0 ? "text-primary neon-glow-primary" : "text-white"
                  )}>
                    {tx.status === 'Processing' ? '--' : (
                      <>{tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</>
                    )}
                  </td>
                  <td className="px-2 py-6 text-right" onClick={(e) => e.stopPropagation()}>
                    {tx.status !== 'Processing' && (
                      <TransactionRowMenu
                        rawStatus={tx.rawStatus}
                        onHardDelete={() => handleHardDeleteRequest(tx.id)}
                        onUnreconcile={() => setUnreconcileTarget(tx.id)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmActionDialog
        isOpen={hardDeleteTarget !== null}
        onClose={() => setHardDeleteTarget(null)}
        title="Permanently delete this transaction?"
        message={
          <>
            <p>
              Removes the transaction, its postings, and any document links. The
              underlying receipt image (if any) is kept — only the transaction is
              destroyed.
            </p>
            <p className="mt-2 text-xs text-on-surface-variant/70">
              This action cannot be undone.
            </p>
          </>
        }
        confirmLabel="Delete forever"
        destructive
        onConfirm={handleHardDeleteConfirm}
      />

      <UnreconcileDialog
        isOpen={unreconcileTarget !== null}
        onClose={() => setUnreconcileTarget(null)}
        transactionId={unreconcileTarget}
        onUnreconciled={() => {
          setUnreconcileTarget(null);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
