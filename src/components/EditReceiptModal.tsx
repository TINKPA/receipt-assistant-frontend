import React from 'react';
import { X, Save, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  patchTransaction,
  extractProblemMessage,
  type ReceiptView,
  type BackendTransaction,
  type UpdateTransactionRequest,
} from '../lib/api';
import { cn } from '../lib/utils';

interface EditReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: ReceiptView;
  /** Called after a successful PATCH. Parent should replace local state
   *  (the new ETag is passed alongside the updated transaction). */
  onUpdated: (txn: BackendTransaction, etag: string | null) => void;
  /** Called if the server rejects with 412 version mismatch — parent
   *  should refetch the receipt to capture the latest ETag. */
  onStale: () => void;
}

type SaveState = 'idle' | 'saving' | 'error' | 'stale';

export default function EditReceiptModal({
  isOpen,
  onClose,
  receipt,
  onUpdated,
  onStale,
}: EditReceiptModalProps) {
  const [payee, setPayee] = React.useState(receipt.payee ?? '');
  const [narration, setNarration] = React.useState(receipt.narration ?? '');
  const [occurredOn, setOccurredOn] = React.useState(receipt.occurred_on);
  const [state, setState] = React.useState<SaveState>('idle');
  const [error, setError] = React.useState<string | null>(null);

  // Reset form when the modal reopens for a different receipt.
  React.useEffect(() => {
    if (isOpen) {
      setPayee(receipt.payee ?? '');
      setNarration(receipt.narration ?? '');
      setOccurredOn(receipt.occurred_on);
      setState('idle');
      setError(null);
    }
  }, [isOpen, receipt.id, receipt.payee, receipt.narration, receipt.occurred_on]);

  const handleSave = async () => {
    if (!receipt.etag) {
      setState('error');
      setError('No ETag available — reload the receipt and try again.');
      return;
    }
    setState('saving');
    setError(null);

    // Only send fields that actually changed; PATCH is merge-patch.
    const patch: UpdateTransactionRequest = { metadata: {} };
    if (payee !== (receipt.payee ?? '')) patch.payee = payee || null;
    if (narration !== (receipt.narration ?? '')) patch.narration = narration || null;
    if (occurredOn !== receipt.occurred_on) patch.occurred_on = occurredOn;

    // Nothing to send — bail out as a no-op.
    if (!('payee' in patch) && !('narration' in patch) && !('occurred_on' in patch)) {
      onClose();
      return;
    }

    try {
      const { data, etag } = await patchTransaction(receipt.id, patch, receipt.etag);
      onUpdated(data, etag);
      onClose();
    } catch (err: unknown) {
      const problem = (err as Error & { problem?: { status?: number } })?.problem;
      const status = problem?.status ?? 0;
      // 412 → ETag stale; 409 → some other conflict. Both mean "reload".
      if (status === 412 || status === 409 || /412|409/.test(extractProblemMessage(err))) {
        setState('stale');
        setError(
          'This receipt was modified elsewhere. Reload to see the latest version, then try again.',
        );
      } else {
        setState('error');
        setError(extractProblemMessage(err));
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/40 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="glass-panel w-full max-w-lg rounded-[2rem] overflow-hidden flex flex-col relative border border-primary/20 shadow-2xl"
          >
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <h2 className="text-xl font-bold tracking-tight text-white font-headline">Edit Receipt</h2>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-8 pb-8 space-y-5">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Payee
                </label>
                <input
                  type="text"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="e.g. Costco"
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-lowest text-white placeholder:text-on-surface-variant/40 border border-outline-variant/10 focus:border-primary/40 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-lowest text-white border border-outline-variant/10 focus:border-primary/40 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Notes
                </label>
                <textarea
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  rows={3}
                  placeholder="Optional note"
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-lowest text-white placeholder:text-on-surface-variant/40 border border-outline-variant/10 focus:border-primary/40 focus:outline-none transition-colors resize-none"
                />
              </div>

              {(state === 'error' || state === 'stale') && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-surface-container-lowest">
                  <AlertCircle className="text-error flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">
                      {state === 'stale' ? 'Out of date' : 'Error'}
                    </p>
                    <p className="text-xs text-error mt-1">{error}</p>
                  </div>
                </div>
              )}

              <div className="pt-2 flex gap-3">
                {state === 'stale' ? (
                  <button
                    onClick={() => {
                      onStale();
                      onClose();
                    }}
                    className="w-full py-4 rounded-xl bg-primary text-on-primary font-bold text-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={20} />
                    Reload receipt
                  </button>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={state === 'saving'}
                    className={cn(
                      'w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2',
                      state === 'saving'
                        ? 'bg-primary/50 text-on-primary cursor-wait'
                        : 'bg-primary text-on-primary hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/20',
                    )}
                  >
                    {state === 'saving' ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={20} />
                        Save changes
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
