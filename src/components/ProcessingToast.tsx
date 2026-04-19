import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, CheckCircle, XCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getBatch, extractProblemMessage } from '../lib/api';

/**
 * Receipt upload UX.
 *
 * The old backend had per-image jobs queried via `GET /jobs/:id`. The
 * v1 backend uses *ingest batches* — a single upload creates a batch
 * with N ingests (we always use N=1 from the UI), and the batch
 * progresses through `pending → processing → extracted → reconciled`.
 *
 * We could SSE-subscribe via `subscribeToBatch(batchId, …)`, but for
 * minimum diff we keep polling: every 5s fetch the batch and watch for
 * `status=extracted` (or `reconciled`). On completion we extract the
 * first produced `transaction_id` to give callers a stable anchor.
 */
export interface ProcessingJob {
  batchId: string;
  ingestId: string;
  filename: string;
}

interface ToastState {
  batchId: string;
  ingestId: string;
  filename: string;
  status: 'processing' | 'done' | 'error';
  transactionId?: string;
  error?: string;
}

interface ProcessingToastProps {
  jobs: ProcessingJob[];
  onJobDone: (batchId: string) => void;
  onRefresh: () => void;
}

// `useProcessingJobs` hook lives in ./useProcessingJobs.ts (separate
// file so react-refresh/only-export-components stays happy).

const TERMINAL_DONE = new Set(['extracted', 'reconciled']);
const TERMINAL_ERROR = new Set(['failed', 'reconcile_error']);

/** Per-batch status overrides. `jobs` (the source list) is the
 *  persistent record of outstanding uploads; this map stores in-memory
 *  terminal state + error text. Toasts are then *derived* from
 *  (jobs, statusMap, dismissed), which sidesteps the
 *  react-hooks/set-state-in-effect lint. */
type StatusOverride = { status: 'done' | 'error'; transactionId?: string; error?: string };

export default function ProcessingToast({ jobs, onJobDone, onRefresh }: ProcessingToastProps) {
  const [statusMap, setStatusMap] = useState<Record<string, StatusOverride>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Keep the latest callbacks in a ref so the polling interval can use
  // them without re-creating the timer every render.
  const callbacksRef = useRef({ onJobDone, onRefresh });
  useEffect(() => {
    callbacksRef.current = { onJobDone, onRefresh };
  }, [onJobDone, onRefresh]);

  const toasts: ToastState[] = useMemo(() => {
    return jobs
      .filter((j) => !dismissed.has(j.batchId))
      .map<ToastState>((j) => {
        const override = statusMap[j.batchId];
        return {
          batchId: j.batchId,
          ingestId: j.ingestId,
          filename: j.filename,
          status: override?.status ?? 'processing',
          transactionId: override?.transactionId,
          error: override?.error,
        };
      });
  }, [jobs, statusMap, dismissed]);

  // Poll batches that are still in `processing` state.
  useEffect(() => {
    const active = jobs.filter(
      (j) => !dismissed.has(j.batchId) && !statusMap[j.batchId],
    );
    if (active.length === 0) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      for (const job of active) {
        if (cancelled) return;
        try {
          const batch = await getBatch(job.batchId);
          if (TERMINAL_DONE.has(batch.status)) {
            const produced = batch.items.find((i) => i.id === job.ingestId)?.produced;
            const transactionId = produced?.transaction_ids?.[0];
            setStatusMap((prev) => ({
              ...prev,
              [job.batchId]: { status: 'done', transactionId },
            }));
            callbacksRef.current.onRefresh();
            setTimeout(() => {
              setDismissed((prev) => new Set(prev).add(job.batchId));
              callbacksRef.current.onJobDone(job.batchId);
            }, 3000);
          } else if (TERMINAL_ERROR.has(batch.status)) {
            const ingestErr = batch.items.find((i) => i.id === job.ingestId)?.error ?? null;
            setStatusMap((prev) => ({
              ...prev,
              [job.batchId]: {
                status: 'error',
                error: ingestErr ?? `Batch ${batch.status}`,
              },
            }));
            setTimeout(() => {
              setDismissed((prev) => new Set(prev).add(job.batchId));
              callbacksRef.current.onJobDone(job.batchId);
            }, 5000);
          }
        } catch (err: unknown) {
          // Ignore individual poll failures; next tick retries.
          console.debug('batch poll error', job.batchId, extractProblemMessage(err));
        }
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobs, dismissed, statusMap]);

  const dismiss = (batchId: string) => {
    setDismissed((prev) => new Set(prev).add(batchId));
    onJobDone(batchId);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.batchId}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="glass-panel border border-outline-variant/20 rounded-xl px-5 py-4 shadow-2xl flex items-center gap-3 min-w-[280px]"
          >
            {toast.status === 'processing' && (
              <Loader2 className="animate-spin text-tertiary shrink-0" size={20} />
            )}
            {toast.status === 'done' && (
              <CheckCircle className="text-primary shrink-0" size={20} />
            )}
            {toast.status === 'error' && (
              <XCircle className="text-error shrink-0" size={20} />
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">
                {toast.status === 'processing' && 'Processing receipt...'}
                {toast.status === 'done' && 'Receipt ready'}
                {toast.status === 'error' && 'Processing failed'}
              </p>
              {toast.status === 'error' && toast.error && (
                <p className="text-xs text-error mt-0.5 truncate">{toast.error}</p>
              )}
              {toast.status !== 'error' && (
                <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">{toast.filename}</p>
              )}
            </div>

            <button
              onClick={() => dismiss(toast.batchId)}
              className="text-on-surface-variant hover:text-white transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
