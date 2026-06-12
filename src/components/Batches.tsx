import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, FileStack, CheckCircle2, AlertCircle, Clock, Cog, ShieldAlert, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import {
  listBatches,
  listTransactions,
  dismissNearDupFlag,
  extractProblemMessage,
  type BatchStatus,
} from '../lib/api';
import { cn } from '../lib/utils';
import { qk } from '../lib/queryKeys';
import { receiptLink } from '../lib/navLinks';

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
  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: qk.batches.list({ limit: 50 }),
    queryFn: () => listBatches({ limit: 50 }),
  });
  const items = data?.items ?? [];
  const error = queryError ? extractProblemMessage(queryError) : null;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h2 className="text-4xl font-extrabold text-white font-headline tracking-tight">Upload Batches</h2>
        <p className="text-on-surface-variant mt-2 font-inter">
          Every receipt you upload is ingested as a batch. Open one to watch extraction + reconciliation progress in real time.
        </p>
      </div>

      <NeedsReviewSection />

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
                const { done, error: errored, dedup, near_dup: nearDup, total } = b.counts;
                const pct =
                  total > 0 ? Math.round(((done + dedup + nearDup + errored) / total) * 100) : 0;
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
                        <span className="text-[11px] text-on-surface-variant font-mono w-28 text-right">
                          {done}/{total}
                          {dedup + nearDup > 0 && (
                            <span className="text-sky-300"> · {dedup + nearDup} deduped</span>
                          )}
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

/**
 * #134 branch-4 review queue: transactions the extraction agent
 * inserted but flagged (a same-amount/date candidate existed and
 * neither side carried a strong tiebreaker). Hidden entirely when
 * empty — most sessions never see it. Dismiss = "I checked; they are
 * distinct purchases"; merging instead is the reconcile-apply flow.
 */
function NeedsReviewSection() {
  const queryClient = useQueryClient();
  const flaggedKey = ['transactions', 'flagged', 'near_dup'] as const;
  const { data } = useQuery({
    queryKey: flaggedKey,
    queryFn: () => listTransactions({ flagged: 'near_dup', limit: 50 }),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissNearDupFlag(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: flaggedKey }),
  });
  const flagged = data?.items ?? [];
  if (flagged.length === 0) return null;
  return (
    <div className="glass-panel border border-amber-400/20 rounded-xl overflow-hidden">
      <div className="px-8 py-4 flex items-center gap-3 border-b border-amber-400/10 bg-amber-400/5">
        <ShieldAlert size={18} className="text-amber-300" />
        <div>
          <p className="font-headline font-bold text-amber-200">
            Needs review · {flagged.length} possible duplicate{flagged.length === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Each was saved alongside a same-amount, same-day transaction without a
            receipt/order number to tell them apart. Open both, then dismiss if they are
            genuinely separate purchases.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-outline-variant/5">
        {flagged.map((t) => {
          const check = (t.metadata as Record<string, any> | null)?.near_dup_check ?? {};
          const candidate: string | undefined = check.candidate_transaction_id;
          return (
            <li key={t.id} className="px-8 py-4 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <Link
                  {...receiptLink(t.id)}
                  className="text-sm font-bold text-white hover:text-primary transition-colors"
                >
                  {t.payee ?? 'Unknown payee'}
                </Link>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {t.occurred_on}
                  {check.reason ? ` · ${String(check.reason).slice(0, 90)}` : ''}
                </p>
              </div>
              {candidate && (
                <Link
                  {...receiptLink(candidate)}
                  className="text-xs text-amber-300 hover:text-amber-200 underline underline-offset-2 shrink-0"
                >
                  view candidate
                </Link>
              )}
              <button
                onClick={() => dismiss.mutate(t.id)}
                disabled={dismiss.isPending}
                className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-white border border-outline-variant/20 hover:border-outline-variant/50 rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                <X size={12} />
                Not a duplicate
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
