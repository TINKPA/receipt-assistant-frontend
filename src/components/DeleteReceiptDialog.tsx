import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Loader2, AlertCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
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

/** Board screen 20's three delete tiers: olive = safe (doc only), amber =
 *  cascade (doc + transaction, reversible), cardinal = hard (permanent). */
const OPTION_DESCRIPTIONS: Record<
  Mode,
  { glyph: string; tier: 'safe' | 'cascade' | 'hard'; tag: string; title: string; help: string }
> = {
  soft: {
    glyph: '▤',
    tier: 'safe',
    tag: 'reversible',
    title: 'Remove document only',
    help: 'Soft-delete the file · the transaction stays posted. Restore any time via "Show deleted".',
  },
  'cascade-soft': {
    glyph: '⛓',
    tier: 'cascade',
    tag: 'reversible',
    title: 'Document + transaction',
    help: 'Cascade soft-delete · voids the linked transaction with a reversing mirror entry (drafts are hard-deleted). A tombstone shows in the Ledger.',
  },
  'cascade-hard': {
    glyph: '✕',
    tier: 'hard',
    tag: 'permanent',
    title: 'Hard delete everything',
    help: 'File, document row, every linked transaction and their postings · gone from the books.',
  },
  'hard-txn': {
    glyph: '✕',
    tier: 'hard',
    tag: 'permanent',
    title: 'Hard delete the transaction',
    help: 'Removes the transaction and its postings. No linked file to soft-delete.',
  },
};

const TIER_ICON_BG: Record<'safe' | 'cascade' | 'hard', string> = {
  safe: 'bg-[var(--color-olive)]',
  cascade: 'bg-[var(--color-amber)]',
  hard: 'bg-[var(--color-accent)]',
};

const TIER_TAG_CLASS: Record<'safe' | 'cascade' | 'hard', string> = {
  safe: 'bg-[color:rgba(92,107,61,0.16)] text-[var(--color-olive)]',
  cascade: 'bg-[color:rgba(188,134,36,0.18)] text-[var(--color-amber)]',
  hard: 'bg-[color:rgba(181,52,26,0.15)] text-[var(--color-accent)]',
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

  const deleteMut = useMutation({
    mutationFn: async (chosen: Mode) => {
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
    },
    onMutate: () => setState({ kind: 'working' }),
    onSuccess: () => onDeleted(),
    onError: (err: unknown) => {
      const problem = parseProblem(err);
      const handled = handleProblem(problem);
      if (!handled) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  const handleConfirm = () => {
    if (mode === 'cascade-hard' && !confirmHardOk) return;
    deleteMut.mutate(mode);
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
          <p className="text-sm font-semibold text-[var(--color-ink)]">Reconciled transactions block this delete</p>
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
          <p className="text-sm font-semibold text-[var(--color-ink)]">This transaction is reconciled</p>
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
          <p className="text-sm font-semibold text-[var(--color-ink)]">Receipt has linked transactions</p>
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
          deleteMut.mutate('cascade-hard');
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
      deleteMut.mutate(mode);
      return;
    }
    if (state.kind === 'block-cascade-reconciled') {
      // Drop the unreconciled txn from the list. If it's now empty,
      // auto-retry; otherwise wait for the user to click Retry.
      const remaining = (state.reconciledTxnIds ?? []).filter(
        (x) => x !== unreconcileTarget,
      );
      if (remaining.length === 0) {
        deleteMut.mutate(mode);
      } else {
        setState({ ...state, reconciledTxnIds: remaining });
      }
    }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[110] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={state.kind === 'working' ? undefined : onClose}
              className="absolute inset-0 bg-[color:rgba(26,22,18,0.38)]"
            />

            {/* Board screen 20: a bottom sheet, not a centered dialog. */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', ease: [0.16, 1, 0.3, 1], duration: 0.32 }}
              className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-[20px] bg-[var(--color-paper)] pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_40px_rgba(26,22,18,0.28)]"
            >
              <div
                aria-hidden="true"
                className="mx-auto mb-2 mt-2.5 h-1 w-9 rounded-full bg-[var(--color-rule)]"
              />
              <div className="flex items-start gap-4 px-5 pb-1">
                <div className="min-w-0">
                  <h2 className="font-display text-[19px] font-medium tracking-tight">
                    Delete this receipt<em className="italic text-[var(--color-accent)]">?</em>
                  </h2>
                  <p className="mt-0.5 truncate font-mono text-[9px] tracking-[0.04em] text-[var(--color-ink-muted)]">
                    {documentId ? `doc_${documentId.slice(0, 8)} · ` : ''}tx_{transactionId.slice(0, 8)} · double-entry
                  </p>
                </div>
                <button
                  onClick={onClose}
                  disabled={state.kind === 'working'}
                  aria-label="Close"
                  className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 pb-6 pt-3">
                {state.kind === 'block-cascade-reconciled' && renderBlockCascadeReconciled()}
                {state.kind === 'block-cannot-delete-reconciled' && renderBlockCannotDeleteReconciled()}
                {state.kind === 'block-document-has-links' && renderBlockDocumentHasLinks()}

                {(state.kind === 'idle' || state.kind === 'working' || state.kind === 'error') && (
                  <>
                    <p className="text-sm text-on-surface-variant">
                      Three tiers — pick how far this goes.
                    </p>

                    {renderOptions()}

                    {state.kind === 'error' && (
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-surface-container-lowest">
                        <AlertCircle className="text-error flex-shrink-0 mt-0.5" size={20} />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-[var(--color-ink)]">Couldn't complete</p>
                          <p className="text-xs text-error mt-1">{state.message}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={onClose}
                        disabled={state.kind === 'working'}
                        className="flex-1 rounded-[var(--radius-pill)] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-paper-deep)] py-3 font-display text-[13.5px] font-medium text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
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
  const { glyph, tier, tag, title, help } = OPTION_DESCRIPTIONS[mode];
  const disabled = disabledReason !== undefined;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded-[13px] border-[0.5px] bg-[var(--color-surface)] px-3 py-3 text-left transition-colors',
        selected
          ? tier === 'hard'
            ? 'border-[color:rgba(181,52,26,0.6)]'
            : 'border-[var(--color-ink-muted)]'
          : tier === 'hard'
            ? 'border-[color:rgba(181,52,26,0.35)] hover:border-[color:rgba(181,52,26,0.6)]'
            : 'border-[var(--color-rule-soft)] hover:border-[var(--color-rule)]',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] text-[14px] text-[var(--color-paper)]',
          TIER_ICON_BG[tier],
        )}
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-display text-[13.5px] font-medium leading-tight">{title}</span>
          <span
            className={cn(
              'ml-auto flex-shrink-0 rounded-full px-2 py-[2px] font-mono text-[7.5px] uppercase tracking-[0.1em]',
              TIER_TAG_CLASS[tier],
            )}
          >
            {tag}
          </span>
        </span>
        <span className="mt-1 block text-[10.5px] leading-snug text-[var(--color-ink-muted)]">
          {help}
        </span>
        {disabled && disabledReason && (
          <span className="mt-1.5 block font-mono text-[9px] text-[var(--color-accent)]">
            ⚿ {disabledReason}
          </span>
        )}
      </span>
    </button>
  );
}
