import React from 'react';
import { X, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ConfirmActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  /** Red button styling for irreversible actions. */
  destructive?: boolean;
  /** If true, show a textarea for the user to enter a reason.
   *  The reason is passed to onConfirm. */
  requireReason?: boolean;
  reasonPlaceholder?: string;
  /** Return a promise; dialog manages loading/error states. */
  onConfirm: (reason: string) => Promise<void>;
}

type DialogState = 'idle' | 'working' | 'error';

export default function ConfirmActionDialog({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel,
  destructive = false,
  requireReason = false,
  reasonPlaceholder = 'Reason (optional)',
  onConfirm,
}: ConfirmActionDialogProps) {
  const [reason, setReason] = React.useState('');
  const [state, setState] = React.useState<DialogState>('idle');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setReason('');
      setState('idle');
      setError(null);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    setState('working');
    setError(null);
    try {
      await onConfirm(reason);
      // Parent closes on success.
    } catch (err: unknown) {
      setState('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={state === 'working' ? undefined : onClose}
            className="absolute inset-0 bg-background/40 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="glass-panel w-full max-w-md rounded-[2rem] overflow-hidden flex flex-col relative border border-outline-variant/20 shadow-2xl"
          >
            <div className="px-8 pt-8 pb-4 flex justify-between items-start gap-4">
              <div className="flex items-start gap-3">
                {destructive && (
                  <AlertTriangle className="text-error flex-shrink-0 mt-1" size={24} />
                )}
                <h2 className="text-xl font-bold tracking-tight text-white font-headline">
                  {title}
                </h2>
              </div>
              <button
                onClick={onClose}
                disabled={state === 'working'}
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-8 pb-8 space-y-5">
              <div className="text-sm text-on-surface-variant">{message}</div>

              {requireReason && (
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder={reasonPlaceholder}
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-lowest text-white placeholder:text-on-surface-variant/40 border border-outline-variant/10 focus:border-primary/40 focus:outline-none transition-colors resize-none"
                />
              )}

              {state === 'error' && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-surface-container-lowest">
                  <AlertCircle className="text-error flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">Couldn't complete</p>
                    <p className="text-xs text-error mt-1">{error}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  disabled={state === 'working'}
                  className="flex-1 py-3 rounded-xl bg-surface-container-high text-on-surface-variant font-bold hover:text-white transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={state === 'working'}
                  className={cn(
                    'flex-1 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2',
                    destructive
                      ? 'bg-error text-on-error hover:scale-[1.02] active:scale-95'
                      : 'bg-primary text-on-primary hover:scale-[1.02] active:scale-95',
                    state === 'working' && 'opacity-60 cursor-wait',
                  )}
                >
                  {state === 'working' ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Working...
                    </>
                  ) : (
                    confirmLabel
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
