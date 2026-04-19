import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pollJob } from '../lib/api';

interface ProcessingJob {
  jobId: string;
  receiptId: string;
}

interface ToastState {
  jobId: string;
  receiptId: string;
  status: 'processing' | 'done' | 'error';
  error?: string;
}

interface ProcessingToastProps {
  jobs: ProcessingJob[];
  onJobDone: (jobId: string) => void;
  onRefresh: () => void;
}

const STORAGE_KEY = 'receipt-processing-jobs';

export function useProcessingJobs() {
  const [jobs, setJobs] = useState<ProcessingJob[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
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

  const removeJob = (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.jobId !== jobId));
  };

  return { jobs, addJob, removeJob };
}

export default function ProcessingToast({ jobs, onJobDone, onRefresh }: ProcessingToastProps) {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  // Initialize toasts from jobs
  useEffect(() => {
    setToasts((prev) => {
      const existing = new Set(prev.map((t) => t.jobId));
      const newToasts = jobs
        .filter((j) => !existing.has(j.jobId))
        .map((j) => ({ jobId: j.jobId, receiptId: j.receiptId, status: 'processing' as const }));
      return [...prev, ...newToasts];
    });
  }, [jobs]);

  // Poll each processing toast
  useEffect(() => {
    const processing = toasts.filter((t) => t.status === 'processing');
    if (processing.length === 0) return;

    const interval = setInterval(async () => {
      for (const toast of processing) {
        try {
          const result = await pollJob(toast.jobId);
          if (result.status === 'done') {
            setToasts((prev) =>
              prev.map((t) => (t.jobId === toast.jobId ? { ...t, status: 'done' } : t))
            );
            onRefresh();
            // Auto-dismiss after 3 seconds
            setTimeout(() => {
              setToasts((prev) => prev.filter((t) => t.jobId !== toast.jobId));
              onJobDone(toast.jobId);
            }, 3000);
          } else if (result.status === 'error') {
            setToasts((prev) =>
              prev.map((t) =>
                t.jobId === toast.jobId ? { ...t, status: 'error', error: result.error } : t
              )
            );
            // Auto-dismiss errors after 5 seconds
            setTimeout(() => {
              setToasts((prev) => prev.filter((t) => t.jobId !== toast.jobId));
              onJobDone(toast.jobId);
            }, 5000);
          }
        } catch {
          // Ignore poll failures, will retry
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [toasts, onJobDone, onRefresh]);

  const dismiss = (jobId: string) => {
    setToasts((prev) => prev.filter((t) => t.jobId !== jobId));
    onJobDone(jobId);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.jobId}
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
            </div>

            <button
              onClick={() => dismiss(toast.jobId)}
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
