import React from 'react';
import { X, Loader2, AlertCircle, AlertTriangle, Trash2, FileMinus, Flame, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  softDeleteDocument,
  cascadeDeleteDocument,
  hardDeleteTransaction,
  parseProblem,
  type ParsedProblem,
} from '../lib/api';
import { addTombstone } from '../lib/tombstones';
import UnreconcileDialog from './UnreconcileDialog';

type Mode = 'soft' | 'cascade-soft' | 'cascade-hard' | 'hard-txn';

interface DeleteReceiptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Document ID linked to this receipt, if any. When null, the soft and
   *  cascade options are hidden and the dialog only offers
   *  hard-delete-of-transaction (rarely needed; usually called from a
   *  detail page where a doc is always present). */
  documentId: string | null;
  /** Underlying transaction ID. Used by the cascade-blocked-reconciled
   *  follow-up to short-circuit to unreconcile, and by the hard-txn
   *  fallback when documentId is null. */
  transactionId: string;
  /** Current ETag of the transaction — required only for the hard-txn
   *  fallback. */
  transactionEtag?: string | null;
  /** Whether the underlying receipt's transaction is reconciled. Used to
   *  preselect "Permanently delete everything" → unreconcile guard. */
  isReconciled?: boolean;
  /** Called once the delete completes and the parent should refresh /
   *  navigate away. */
  onDeleted: () => void;
}

interface ResultState {
  kind: 'idle' | 'working' | 'error' | 'block-cascade-reconciled' | 'block-cannot-delete-reconciled' | 'block-document-has-links';
  message?: string;
  /** For block-cascade-reconciled: the txn IDs to unreconcile first. */
  reconciledTxnIds?: string[];
  /** For block-document-has-links: the link count. */
  linkCount?: number;
}

const OPTION_DESCRIPTIONS: Record<Mode, { icon: React.ReactNode; title: string; help: string }> = {
  soft: {
    icon: <FileMinus size={20} />,
    title: 'Soft delete the receipt',
    help: 'Hides the receipt from the main list. The transaction stays untouched. You can restore it later from the "Recently Deleted" panel.',
  },
  'cascade-soft': {
    icon: <Trash2 size={20} />,
    title: 'Delete receipt and reverse the transaction',
    help: 'Soft-deletes the receipt and voids the linked transaction (creates a reversing mirror entry in the ledger). Drafts are hard-deleted instead. Reconciled transactions block this — unreconcile first.',
  },
  'cascade-hard': {
    icon: <Flame size={20} />,
    title: 'Permanently delete everything',
    help: 'Removes the receipt file, the receipt row, every linked transaction, and all their postings. Cannot be undone. Reconciled transactions block this — unreconcile first.',
  },
  'hard-txn': {
    icon: <Flame size={20} />,
    title: 'Permanently delete the transaction',
    help: 'Removes the transaction and its postings. This receipt has no linked image, so there is nothing to soft-delete.',
  },
};

export default function DeleteReceiptDialog({
  isOpen,
  onClose,
  documentId,
  transactionId,
  transactionEtag,
  isReconciled,
  onDeleted,
}: DeleteReceiptDialogProps) {
  const initialMode: Mode = documentId ? 'soft' : 'hard-txn';
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [confirmHardOk, setConfirmHardOk] = React.useState(false);
  const [state, setState] = React.useState<ResultState>({ kind: 'idle' });
  const [unreconcileTarget, setUnreconcileTarget] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setConfirmHardOk(false);
      setState({ kind: 'idle' });
      setUnreconcileTarget(null);
    }
  }, [isOpen, initialMode]);

  const handleProblem = (problem: ParsedProblem): boolean => {
    const ext = problem.extensions ?? {};
    if (problem.type === 'errors/cascade-blocked-reconciled') {
      const ids = Array.isArray(ext.reconciled_transaction_ids)
        ? (ext.reconciled_transaction_ids as unknown[]).filter(
            (x): x is string => typeof x === 'string',
          )
        : [];
      setState({
        kind: 'block-cascade-reconciled',
        message: problem.detail ?? problem.title,
        reconciledTxnIds: ids,
      });
      return true;
    }
    if (problem.type === 'errors/cannot-delete-reconciled') {
      setState({
        kind: 'block-cannot-delete-reconciled',
        message: problem.detail ?? problem.title,
      });
      return true;
    }
    if (problem.type === 'errors/document-has-links') {
      const linkCount = typeof ext.link_count === 'number' ? ext.link_count : undefined;
      setState({
        kind: 'block-document-has-links',
        message: problem.detail ?? problem.title,
        linkCount,
      });
      return true;
    }
    return false;
  };

  const runDelete = async (chosen: Mode) => {
    setState({ kind: 'working' });
    try {
      switch (chosen) {
        case 'soft':
          if (!documentId) throw new Error('No document linked');
          await softDeleteDocument(documentId);
          addTombstone(documentId);
          break;
        case 'cascade-soft':
          if (!documentId) throw new Error('No document linked');
          await cascadeDeleteDocument(documentId, { hard: false });
          addTombstone(documentId);
          break;
        case 'cascade-hard':
          if (!documentId) throw new Error('No document linked');
          await cascadeDeleteDocument(documentId, { hard: true });
          // Hard cascade kills the doc too, so no tombstone — the row
          // is gone for good.
          break;
        case 'hard-txn':
          if (!transactionEtag) throw new Error('Missing ETag — refresh and retry.');
          await hardDeleteTransaction(transactionId, transactionEtag);
          break;
      }
      onDeleted();
    } catch (err: unknown) {
      const problem = parseProblem(err);
      const handled = handleProblem(problem);
      if (!handled) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const handleConfirm = () => {
    if (mode === 'cascade-hard' && !confirmHardOk) return;
    void runDelete(mode);
  };

  const renderOptions = () => (
    <div className="space-y-3">
      {(['soft', 'cascade-soft', 'cascade-hard'] as const)
        .filter(() => documentId !== null)
        .map((m) => (
          <OptionRow
            key={m}
            mode={m}
            selected={mode === m}
            onSelect={() => {
              setMode(m);
              setConfirmHardOk(false);
            }}
            disabledReason={
              isReconciled && (m === 'cascade-soft' || m === 'cascade-hard')
                ? 'This receipt is reconciled — unreconcile first.'
                : undefined
            }
          />
        ))}
      {documentId === null && (
        <OptionRow mode="hard-txn" selected={mode === 'hard-txn'} onSelect={() => setMode('hard-txn')} />
      )}

      {mode === 'cascade-hard' && (
        <label className="flex items-start gap-3 p-4 rounded-xl bg-error/5 border border-error/20 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmHardOk}
            onChange={(e) => setConfirmHardOk(e.target.checked)}
            className="mt-1 accent-error"
          />
          <span className="text-sm text-error">
            I understand this is irreversible — receipt file, document row, and every linked
            transaction will be permanently destroyed.
          </span>
        </label>
      )}
    </div>
  );

  const renderBlockCascadeReconciled = () => (
    <div className="space-y-4">
      <button
        onClick={() => setState({ kind: 'idle' })}
        className="flex items-center gap-2 text-sm text-primary hover:opacity-80 transition-opacity"
      >
        <ArrowLeft size={16} />
        Back to options
      </button>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-error/10">
        <AlertTriangle className="text-error flex-shrink-0 mt-0.5" size={20} />
        <div>
          <p className="text-sm font-bold text-white">Reconciled transactions block this delete</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {state.message ??
              'One or more linked transactions are reconciled. Unreconcile each one before retrying.'}
          </p>
        </div>
      </div>

      {state.reconciledTxnIds && state.reconciledTxnIds.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            Reconciled transaction{state.reconciledTxnIds.length === 1 ? '' : 's'}
          </p>
          <ul className="space-y-2">
            {state.reconciledTxnIds.map((txnId) => (
              <li
                key={txnId}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-container-lowest border border-outline-variant/10"
              >
                <code className="text-xs text-on-surface-variant truncate">{txnId}</code>
                <button
                  onClick={() => setUnreconcileTarget(txnId)}
                  className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors flex-shrink-0"
                >
                  Unreconcile
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-2">
        <button
          onClick={handleConfirm}
          className="w-full py-3 rounded-xl bg-error text-on-error font-bold hover:scale-[1.02] active:scale-95 transition-all"
        >
          Retry delete
        </button>
      </div>
    </div>
  );

  const renderBlockCannotDeleteReconciled = () => (
    <div className="space-y-4">
      <button
        onClick={() => setState({ kind: 'idle' })}
        className="flex items-center gap-2 text-sm text-primary hover:opacity-80 transition-opacity"
      >
        <ArrowLeft size={16} />
        Back to options
      </button>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-error/10">
        <AlertTriangle className="text-error flex-shrink-0 mt-0.5" size={20} />
        <div>
          <p className="text-sm font-bold text-white">This transaction is reconciled</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {state.message ?? 'Unreconcile this transaction before deleting it.'}
          </p>
        </div>
      </div>

      <button
        onClick={() => setUnreconcileTarget(transactionId)}
        className="w-full py-3 rounded-xl bg-primary text-on-primary font-bold hover:scale-[1.02] active:scale-95 transition-all"
      >
        Unreconcile this transaction
      </button>
    </div>
  );

  const renderBlockDocumentHasLinks = () => (
    <div className="space-y-4">
      <button
        onClick={() => setState({ kind: 'idle' })}
        className="flex items-center gap-2 text-sm text-primary hover:opacity-80 transition-opacity"
      >
        <ArrowLeft size={16} />
        Back to options
      </button>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-error/10">
        <AlertTriangle className="text-error flex-shrink-0 mt-0.5" size={20} />
        <div>
          <p className="text-sm font-bold text-white">Receipt has linked transactions</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {state.linkCount != null
              ? `This receipt is still linked to ${state.linkCount} transaction${state.linkCount === 1 ? '' : 's'}.`
              : 'This receipt is still linked to one or more transactions.'}{' '}
            To purge it permanently, also delete the linked transactions.
          </p>
        </div>
      </div>

      <button
        onClick={() => {
          setMode('cascade-hard');
          setConfirmHardOk(true);
          void runDelete('cascade-hard');
        }}
        className="w-full py-3 rounded-xl bg-error text-on-error font-bold hover:scale-[1.02] active:scale-95 transition-all"
      >
        Delete with linked transactions
      </button>
    </div>
  );

  const onUnreconciled = () => {
    setUnreconcileTarget(null);
    if (state.kind === 'block-cannot-delete-reconciled') {
      // The receipt's own transaction was unreconciled — retry the
      // user's last chosen mode.
      void runDelete(mode);
      return;
    }
    if (state.kind === 'block-cascade-reconciled') {
      // Drop the unreconciled txn from the list. If it's now empty,
      // auto-retry; otherwise wait for the user to click Retry.
      const remaining = (state.reconciledTxnIds ?? []).filter(
        (x) => x !== unreconcileTarget,
      );
      if (remaining.length === 0) {
        void runDelete(mode);
      } else {
        setState({ ...state, reconciledTxnIds: remaining });
      }
    }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={state.kind === 'working' ? undefined : onClose}
              className="absolute inset-0 bg-background/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-panel w-full max-w-lg rounded-[2rem] overflow-hidden flex flex-col relative border border-outline-variant/20 shadow-2xl"
            >
              <div className="px-8 pt-8 pb-4 flex justify-between items-start gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-error flex-shrink-0 mt-1" size={24} />
                  <h2 className="text-xl font-bold tracking-tight text-white font-headline">
                    Delete this receipt?
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  disabled={state.kind === 'working'}
                  className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors disabled:opacity-40"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="px-8 pb-8 space-y-5 max-h-[70vh] overflow-y-auto">
                {state.kind === 'block-cascade-reconciled' && renderBlockCascadeReconciled()}
                {state.kind === 'block-cannot-delete-reconciled' && renderBlockCannotDeleteReconciled()}
                {state.kind === 'block-document-has-links' && renderBlockDocumentHasLinks()}

                {(state.kind === 'idle' || state.kind === 'working' || state.kind === 'error') && (
                  <>
                    <p className="text-sm text-on-surface-variant">
                      Choose how aggressively to remove this receipt.
                    </p>

                    {renderOptions()}

                    {state.kind === 'error' && (
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-surface-container-lowest">
                        <AlertCircle className="text-error flex-shrink-0 mt-0.5" size={20} />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-white">Couldn't complete</p>
                          <p className="text-xs text-error mt-1">{state.message}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={onClose}
                        disabled={state.kind === 'working'}
                        className="flex-1 py-3 rounded-xl bg-surface-container-high text-on-surface-variant font-bold hover:text-white transition-colors disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirm}
                        disabled={
                          state.kind === 'working' ||
                          (mode === 'cascade-hard' && !confirmHardOk) ||
                          (isReconciled && (mode === 'cascade-soft' || mode === 'cascade-hard'))
                        }
                        className={cn(
                          'flex-1 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 bg-error text-on-error hover:scale-[1.02] active:scale-95',
                          (state.kind === 'working' ||
                            (mode === 'cascade-hard' && !confirmHardOk) ||
                            (isReconciled && (mode === 'cascade-soft' || mode === 'cascade-hard'))) &&
                            'opacity-50 cursor-not-allowed hover:scale-100',
                        )}
                      >
                        {state.kind === 'working' ? (
                          <>
                            <Loader2 className="animate-spin" size={18} />
                            Deleting...
                          </>
                        ) : (
                          'Delete'
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <UnreconcileDialog
        isOpen={unreconcileTarget !== null}
        onClose={() => setUnreconcileTarget(null)}
        transactionId={unreconcileTarget}
        onUnreconciled={onUnreconciled}
      />
    </>
  );
}

interface OptionRowProps {
  mode: Mode;
  selected: boolean;
  onSelect: () => void;
  disabledReason?: string;
}

function OptionRow({ mode, selected, onSelect, disabledReason }: OptionRowProps) {
  const { icon, title, help } = OPTION_DESCRIPTIONS[mode];
  const disabled = disabledReason !== undefined;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      className={cn(
        'w-full text-left p-4 rounded-xl border transition-colors flex items-start gap-3',
        selected
          ? 'border-error/40 bg-error/10'
          : 'border-outline-variant/10 bg-surface-container-lowest hover:border-outline-variant/30',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <div className={cn('mt-0.5 flex-shrink-0', selected ? 'text-error' : 'text-on-surface-variant')}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-bold', selected ? 'text-white' : 'text-on-surface')}>{title}</p>
        <p className="text-xs text-on-surface-variant mt-1">{help}</p>
        {disabled && disabledReason && (
          <p className="text-xs text-error mt-2 font-medium">{disabledReason}</p>
        )}
      </div>
    </button>
  );
}
