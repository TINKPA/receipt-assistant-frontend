import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBatch, extractProblemMessage } from '../lib/api';

const STORAGE_KEY = 'receipt-processing-batches-v1';
const LEGACY_STORAGE_KEY = 'receipt-processing-jobs';

/** One outstanding upload. We always upload N=1 file per batch from the
 *  UI, so a job maps 1:1 to a batch + its single ingest item. */
export interface ProcessingJob {
  batchId: string;
  ingestId: string;
  filename: string;
}

export type ProcessingStatus = 'processing' | 'done' | 'duplicate' | 'error';

/** A job projected to its live, user-visible state. This is what the
 *  inline list cards render (design "方案 4" — the processing receipt
 *  appears in-context at the top of the ledger, not as a corner toast). */
export interface ProcessingItem {
  batchId: string;
  ingestId: string;
  filename: string;
  status: ProcessingStatus;
  /** Produced (or, for a dedup hit, pre-existing) transaction to jump to. */
  transactionId?: string;
  error?: string;
}

/** Per-batch terminal override. `jobs` is the persistent record of
 *  outstanding uploads; this map layers terminal state on top, so items
 *  stay *derived* from (jobs, statusMap, dismissed) — sidestepping the
 *  react-hooks/set-state-in-effect lint. */
type StatusOverride = {
  status: 'done' | 'duplicate' | 'error';
  transactionId?: string;
  error?: string;
};

const TERMINAL_DONE = new Set(['extracted', 'reconciled']);
const TERMINAL_ERROR = new Set(['failed', 'reconcile_error']);

/**
 * Owns the full lifecycle of in-flight receipt uploads: persistence,
 * polling, and projection to render-ready {@link ProcessingItem}s.
 *
 * Jobs persist to localStorage so an in-flight upload survives a full
 * page reload (extraction can take 10-30s). Polling lives here (rather
 * than in a presentational component) so the *same* status can drive
 * inline cards in any list that wants them.
 *
 * @param onRefresh Called once when a batch produces a new transaction,
 *   so the host can refetch lists and surface the real row.
 */
export function useProcessingJobs({ onRefresh }: { onRefresh?: () => void } = {}) {
  const [jobs, setJobs] = useState<ProcessingJob[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as ProcessingJob[];
      // Clean up the legacy {jobId, receiptId} store once — the shape
      // is incompatible and hitting the old backend will 404.
      if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      return [];
    } catch {
      return [];
    }
  });
  const [statusMap, setStatusMap] = useState<Record<string, StatusOverride>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Keep the latest callback in a ref so the polling interval can use it
  // without re-creating the timer every render.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }, [jobs]);

  const addJob = useCallback((job: ProcessingJob) => {
    setJobs((prev) => [...prev, job]);
  }, []);

  /** Remove a job from view + persistence. Used both by the manual
   *  dismiss control and by the auto-dismiss timers below. */
  const dismiss = useCallback((batchId: string) => {
    setDismissed((prev) => new Set(prev).add(batchId));
    setJobs((prev) => prev.filter((j) => j.batchId !== batchId));
  }, []);

  const items: ProcessingItem[] = useMemo(() => {
    return jobs
      .filter((j) => !dismissed.has(j.batchId))
      .map<ProcessingItem>((j) => {
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

  // Poll batches that are still in a non-terminal state.
  useEffect(() => {
    const active = jobs.filter(
      (j) => !dismissed.has(j.batchId) && !statusMap[j.batchId],
    );
    if (active.length === 0) return;

    let cancelled = false;
    const autoDismiss = (batchId: string, delay: number) => {
      setTimeout(() => {
        setDismissed((prev) => new Set(prev).add(batchId));
        setJobs((prev) => prev.filter((j) => j.batchId !== batchId));
      }, delay);
    };

    const interval = setInterval(async () => {
      for (const job of active) {
        if (cancelled) return;
        try {
          const batch = await getBatch(job.batchId);
          if (TERMINAL_DONE.has(batch.status)) {
            // Per-file outcome: dedup is decided by the *ingest item's*
            // own status, not the batch's. A byte-identical re-upload is
            // born terminal with `status='dedup'` and points at the
            // pre-existing transaction — no new row was written, so we
            // surface a neutral "already in your ledger" state and skip
            // onRefresh (there's nothing new to fetch).
            const item = batch.items.find((i) => i.id === job.ingestId);
            const transactionId = item?.produced?.transaction_ids?.[0];
            if (item?.status === 'dedup') {
              setStatusMap((prev) => ({
                ...prev,
                [job.batchId]: { status: 'duplicate', transactionId },
              }));
              // Intentionally no onRefresh() — dedup adds no new data.
              autoDismiss(job.batchId, 5000);
            } else {
              setStatusMap((prev) => ({
                ...prev,
                [job.batchId]: { status: 'done', transactionId },
              }));
              onRefreshRef.current?.();
              autoDismiss(job.batchId, 3000);
            }
          } else if (TERMINAL_ERROR.has(batch.status)) {
            const ingestErr = batch.items.find((i) => i.id === job.ingestId)?.error ?? null;
            setStatusMap((prev) => ({
              ...prev,
              [job.batchId]: {
                status: 'error',
                error: ingestErr ?? `Batch ${batch.status}`,
              },
            }));
            autoDismiss(job.batchId, 5000);
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

  return { items, addJob, dismiss };
}
