import { Loader2, CheckCircle, XCircle, Layers, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { ProcessingItem, ProcessingJob } from './useProcessingJobs';

/**
 * Receipt upload UX (floating toast variant).
 *
 * Purely presentational now: it renders the projected {@link ProcessingItem}s
 * that `useProcessingJobs` owns. The hook does all the work — polling each
 * batch through the shared `['batch',id]` query cache, deriving terminal
 * status, firing the ledger refresh once, and auto-dismissing. This toast and
 * the inline `ProcessingCardList` are two views of that same `items` array, so
 * there is a single poll per batch (the old per-component pollers are gone).
 *
 * `ProcessingJob` lives in ./useProcessingJobs.ts; re-exported for importers.
 */
export type { ProcessingJob };

interface ProcessingToastProps {
  /** Projected upload state from `useProcessingJobs` (shared with the inline
   *  cards). The hook owns polling / terminal transitions / auto-dismiss. */
  items: ProcessingItem[];
  /** Manual dismiss (the X button). The hook auto-dismisses terminal items. */
  onJobDone: (batchId: string) => void;
  /** Tap a terminal toast to jump to the produced transaction. For a dedup
   *  hit this is the *pre-existing* transaction the upload matched. */
  onSelectTransaction?: (transactionId: string) => void;
}

export default function ProcessingToast({
  items,
  onJobDone,
  onSelectTransaction,
}: ProcessingToastProps) {
  const dismiss = (batchId: string) => onJobDone(batchId);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      <AnimatePresence>
        {items.map((toast) => {
          // A terminal toast that produced a transaction is tappable —
          // jump to that transaction. For dedup this is the pre-existing
          // row the upload matched, so the user can confirm it's already
          // tracked rather than wondering where their upload went.
          const tappable =
            (toast.status === 'done' || toast.status === 'duplicate') &&
            !!toast.transactionId &&
            !!onSelectTransaction;
          const goToTransaction = () => {
            if (tappable && toast.transactionId) {
              onSelectTransaction!(toast.transactionId);
              dismiss(toast.batchId);
            }
          };
          return (
          <motion.div
            key={toast.batchId}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            onClick={tappable ? goToTransaction : undefined}
            role={tappable ? 'button' : undefined}
            tabIndex={tappable ? 0 : undefined}
            onKeyDown={
              tappable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      goToTransaction();
                    }
                  }
                : undefined
            }
            className={
              'glass-panel border border-outline-variant/20 rounded-xl px-5 py-4 shadow-2xl flex items-center gap-3 min-w-[280px]' +
              (tappable ? ' cursor-pointer hover:border-outline-variant/40 transition-colors' : '')
            }
          >
            {toast.status === 'processing' && (
              <Loader2 className="animate-spin text-tertiary shrink-0" size={20} />
            )}
            {toast.status === 'done' && (
              <CheckCircle className="text-primary shrink-0" size={20} />
            )}
            {toast.status === 'duplicate' && (
              <Layers className="text-sky-400 shrink-0" size={20} />
            )}
            {toast.status === 'error' && (
              <XCircle className="text-error shrink-0" size={20} />
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">
                {toast.status === 'processing' && 'Processing receipt...'}
                {toast.status === 'done' && 'Receipt added'}
                {toast.status === 'duplicate' && 'Already in your ledger'}
                {toast.status === 'error' && 'Processing failed'}
              </p>
              {toast.status === 'duplicate' && (
                <p className="text-xs text-sky-300/80 mt-0.5 truncate">
                  This receipt was added before
                </p>
              )}
              {toast.status === 'error' && toast.error && (
                <p className="text-xs text-error mt-0.5 truncate">{toast.error}</p>
              )}
              {toast.status !== 'error' && (
                <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">{toast.filename}</p>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                dismiss(toast.batchId);
              }}
              className="text-on-surface-variant hover:text-white transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
