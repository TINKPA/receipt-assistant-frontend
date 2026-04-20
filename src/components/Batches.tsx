import React, { useEffect, useState } from 'react';
import { Loader2, FileStack, CheckCircle2, AlertCircle, Clock, Cog } from 'lucide-react';
import {
  listBatches,
  extractProblemMessage,
  type BackendBatchSummary,
  type BatchStatus,
} from '../lib/api';
import { cn } from '../lib/utils';

interface BatchesProps {
  onSelectBatch: (batchId: string) => void;
}

const STATUS_META: Record<
  BatchStatus,
  { label: string; badge: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  pending: { label: 'Pending', badge: 'bg-surface-container-highest text-on-surface-variant', icon: Clock },
  processing: { label: 'Processing', badge: 'bg-tertiary/10 text-tertiary', icon: Cog },
  extracted: { label: 'Extracted', badge: 'bg-primary/10 text-primary', icon: CheckCircle2 },
  reconciling: { label: 'Reconciling', badge: 'bg-tertiary/10 text-tertiary', icon: Cog },
  reconciled: { label: 'Reconciled', badge: 'bg-primary/20 text-primary', icon: CheckCircle2 },
  failed: { label: 'Failed', badge: 'bg-error/10 text-error', icon: AlertCircle },
  reconcile_error: { label: 'Reconcile error', badge: 'bg-error/10 text-error', icon: AlertCircle },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Batches({ onSelectBatch }: BatchesProps) {
  const [items, setItems] = useState<BackendBatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBatches({ limit: 50 })
      .then((r) => setItems(r.items))
      .catch((e) => setError(extractProblemMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h2 className="text-4xl font-extrabold text-white font-headline tracking-tight">Upload Batches</h2>
        <p className="text-on-surface-variant mt-2 font-inter">
          Every receipt you upload is ingested as a batch. Open one to watch extraction + reconciliation progress in real time.
        </p>
      </div>

      <div className="glass-panel border border-outline-variant/10 rounded-xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={32} />
            <span className="ml-3 text-on-surface-variant">Loading batches...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-error">{error}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-3 text-on-surface-variant">
            <FileStack size={40} className="opacity-50" />
            <p>No uploads yet. Drop a receipt from the Add Transaction button to get started.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Uploaded</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Files</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Progress</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Status</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Auto-reconcile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {items.map((b) => {
                const meta = STATUS_META[b.status];
                const Icon = meta.icon;
                const { done, error: errored, total } = b.counts;
                const pct = total > 0 ? Math.round(((done + errored) / total) * 100) : 0;
                return (
                  <tr
                    key={b.id}
                    onClick={() => onSelectBatch(b.id)}
                    className="hover:bg-surface-container-high/30 transition-colors cursor-pointer group"
                  >
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                          {formatDate(b.created_at)}
                        </span>
                        <span className="text-[11px] text-on-surface-variant/70 mt-0.5 font-mono">
                          {b.id.slice(0, 8)}…
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-sm text-on-surface-variant">
                      {b.file_count} {b.file_count === 1 ? 'file' : 'files'}
                    </td>
                    <td className="px-8 py-6">
                      <div className="w-40 flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full transition-all',
                              errored > 0 ? 'bg-error' : 'bg-primary',
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-on-surface-variant font-mono w-16 text-right">
                          {done}/{total}
                          {errored > 0 && <span className="text-error"> · {errored} err</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider',
                          meta.badge,
                        )}
                      >
                        <Icon size={12} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-sm text-on-surface-variant">
                      {b.auto_reconcile ? 'On' : 'Off'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
