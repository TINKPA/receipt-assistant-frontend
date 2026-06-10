import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getBatch } from '../lib/api';
import { qk } from '../lib/queryKeys';

/** Stable empty reference so the common (no-uploads) case never churns the
 *  context value / consumers. */
const EMPTY_ITEMS: ProcessingItem[] = [];

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
 * The hook exposes:
 *
 * - `addJob` — enqueue an upload (the `add` route calls this on submit).
 * - `items` + `dismiss` — the *projected*, polled state. The inline
 *   `ProcessingCardList` consumes this; polling happens here so the card
 *   needs no logic of its own.
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

  // Poll each visible (non-dismissed) batch through the SHARED ['batch',id]
  // cache — the same key BatchDetail uses — so there is exactly one network
  // poll per batch no matter how many surfaces are watching. Polling stops
  // automatically once a batch hits a terminal status.
  const visibleJobs = jobs.filter((j) => !dismissed.has(j.batchId));
  const batchQueries = useQueries({
    queries: visibleJobs.map((j) => ({
      queryKey: qk.batch(j.batchId),
      queryFn: () => getBatch(j.batchId),
      refetchInterval: (q: { state: { data?: { status: string } } }) => {
        const s = q.state.data?.status;
        return s && (TERMINAL_DONE.has(s) || TERMINAL_ERROR.has(s)) ? false : 5000;
      },
    })),
  });

  // Project (jobs × live batch snapshots) → render-ready items. Status is
  // DERIVED from the query data — no statusMap state — so there is no
  // setState-in-effect anywhere. Stable EMPTY reference while idle so the
  // context value doesn't churn when there are no uploads.
  const items: ProcessingItem[] =
    visibleJobs.length === 0
      ? EMPTY_ITEMS
      : visibleJobs.map<ProcessingItem>((j, i) => {
          const batch = batchQueries[i]?.data;
          const base = { batchId: j.batchId, ingestId: j.ingestId, filename: j.filename };
          if (!batch) return { ...base, status: 'processing' };
          if (TERMINAL_DONE.has(batch.status)) {
            // Per-file outcome: dedup is decided by the ingest item's own
            // status. A byte-identical re-upload is born terminal with
            // status 'dedup', pointing at the pre-existing transaction.
            const item = batch.items.find((it) => it.id === j.ingestId);
            const transactionId = item?.produced?.transaction_ids?.[0];
            return item?.status === 'dedup' || item?.status === 'near_dup'
              ? { ...base, status: 'duplicate', transactionId }
              : { ...base, status: 'done', transactionId };
          }
          if (TERMINAL_ERROR.has(batch.status)) {
            const ingestErr = batch.items.find((it) => it.id === j.ingestId)?.error ?? null;
            return { ...base, status: 'error', error: ingestErr ?? `Batch ${batch.status}` };
          }
          return { ...base, status: 'processing' };
        });

  // Terminal side-effects, exactly once per batch. A freshly-done upload
  // refreshes the ledger surfaces (dedup/error add nothing new, so they
  // don't); every terminal item auto-dismisses after a beat. `notifiedRef`
  // guarantees once-only. Nothing here setStates synchronously — onRefresh
  // invalidates, dismiss is deferred via setTimeout — so this stays clear of
  // the react-hooks/set-state-in-effect lint.
  const notifiedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const it of items) {
      if (it.status === 'processing' || notifiedRef.current.has(it.batchId)) continue;
      notifiedRef.current.add(it.batchId);
      if (it.status === 'done') onRefreshRef.current?.();
      setTimeout(() => dismiss(it.batchId), it.status === 'done' ? 3000 : 5000);
    }
  }, [items, dismiss]);

  return { addJob, items, dismiss };
}
