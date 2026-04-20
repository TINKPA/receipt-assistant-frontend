import { useEffect, useState } from 'react';
import type { ProcessingJob } from './ProcessingToast';

const STORAGE_KEY = 'receipt-processing-batches-v1';
const LEGACY_STORAGE_KEY = 'receipt-processing-jobs';

/** Persist outstanding batch upload jobs to localStorage so the toast
 *  survives full-page reloads (browser refresh mid-upload is a common
 *  case — extraction can take 10-30s). */
export function useProcessingJobs() {
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }, [jobs]);

  const addJob = (job: ProcessingJob) => {
    setJobs((prev) => [...prev, job]);
  };

  const removeJob = (batchId: string) => {
    setJobs((prev) => prev.filter((j) => j.batchId !== batchId));
  };

  return { jobs, addJob, removeJob };
}
