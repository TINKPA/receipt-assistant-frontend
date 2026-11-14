import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { X, Loader2, AlertCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  softDeleteDocument,
  cascadeDeleteDocument,
  getTransaction,
  hardDeleteTransaction,
  parseProblem,
  type ParsedProblem,
} from '../lib/api';
import { qk } from '../lib/queryKeys';
import { receiptLink } from '../lib/navLinks';
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
  /** One of the transaction's documents is soft-deleted (and so can be
   *  restored). With `documentId` null that means every document is: the
   *  only delete left is the permanent one, and the sheet says so. */
  hasDeletedDocument?: boolean;
  /** Called once the delete completes and the parent should refresh /
   *  navigate away. */
  onDeleted: () => void;
  /** Called when the dialog is dismissed after a cascade that deleted a
   *  document but KEPT the transaction (another document still supports
   *  it). The receipt is not gone, so the parent should stay on it and
   *  refetch rather than navigate away. */
  onKept: () => void;
}

/** What the mutation was asked to do: the option the user picked, or the
 *  follow-up offered after a cascade kept the transaction. `etag`
 *  overrides the page's ETag for the hard-txn delete: after this sheet
 *  unreconciled the transaction, the page's tag is one version behind. */
type Step =
  | { step: 'first'; mode: Mode; etag?: string | null }
  | { step: 'remaining'; hard: boolean };

/**
 * Transactions OTHER than this receipt's that a cascade deleted.
 *
 * A document can be linked to more than one transaction (one order email
 * covering two charges). The cascade deletes every linked transaction the
 * document was the last live evidence of, so deleting "this receipt's
 * file" can take another purchase with it. The report names them; the
 * sheet must too, or the user never learns that a second purchase left
 * the ledger.
 */
interface OthersDeleted {
  /** Soft-deleted: still in the database, marked deleted. */
  soft: string[];
  /** Gone for good (a hard cascade, or a draft/error transaction). */
  hard: string[];
}

const NO_OTHERS: OthersDeleted = { soft: [], hard: [] };

/**
 * A cascade went through and the transaction is still in the ledger.
 *
 * The backend keeps a transaction for as long as another non-deleted
 * document is linked to it (an invoice and a payment confirmation both
 * document one purchase), and says so in `transactions_kept`. Treating
 * that 200 as "deleted" is what made a two-document receipt look
 * undeletable: the sheet closed, the app went back to the ledger, and
 * the receipt was still there.
 */
interface KeptState {
  /** The cascade was a hard one, so the follow-up is too. */
  hard: boolean;
  /** Live documents still on the transaction. Null when the count could
   *  not be read back; the copy then stays generic. */
  remaining: number | null;
}

type Outcome = { kind: 'done' } | ({ kind: 'kept' } & KeptState);

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
    help: 'Cascade soft-delete · soft-deletes the linked transaction (drafts are hard-deleted), unless another document still supports it. A tombstone shows in the Ledger, restorable anytime.',
  },
  'cascade-hard': {
    glyph: '✕',
    tier: 'hard',
    tag: 'permanent',
    title: 'Hard delete everything',
    help: 'File, document row, and every linked transaction no other document supports, with their postings · gone from the books.',
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
  hasDeletedDocument,
  onDeleted,
  onKept,
}: DeleteReceiptDialogProps) {
  const queryClient = useQueryClient();
  const initialMode: Mode = documentId ? 'soft' : 'hard-txn';
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [confirmHardOk, setConfirmHardOk] = React.useState(false);
  const [state, setState] = React.useState<ResultState>({ kind: 'idle' });
  const [kept, setKept] = React.useState<KeptState | null>(null);
  const [unreconcileTarget, setUnreconcileTarget] = React.useState<string | null>(null);
  // The transaction's ETag as this sheet last learned it from a write of
  // its own (an unreconcile). Null: use the page's.
  const [freshEtag, setFreshEtag] = React.useState<string | null>(null);
  // Other transactions the cascades in this sheet have deleted. The ref
  // accumulates across steps for the mutation callbacks (which may close
  // over an older render); the state mirrors it for rendering.
  const othersRef = React.useRef<OthersDeleted>(NO_OTHERS);
  const [others, setOthers] = React.useState<OthersDeleted>(NO_OTHERS);
  // This receipt is gone, but the cascade took other transactions too:
  // say which before leaving.
  const [finished, setFinished] = React.useState(false);

  // Start afresh each time the sheet opens. A refetch while it is open
  // can change which options exist: after a 412 the page reads the
  // receipt again, and a document linked meanwhile turns "Hard delete
  // the transaction" into the three document options. Then follow the
  // options but keep what the sheet is saying, or the explanation of the
  // refused delete vanishes and the options just change under the user.
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    const opened = isOpen && !wasOpen.current;
    wasOpen.current = isOpen;
    if (!isOpen) return;
    setMode(initialMode);
    setConfirmHardOk(false);
    if (!opened) return;
    setState({ kind: 'idle' });
    setKept(null);
    setUnreconcileTarget(null);
    setFreshEtag(null);
    othersRef.current = NO_OTHERS;
    setOthers(NO_OTHERS);
    setFinished(false);
  }, [isOpen, initialMode]);

  // Once a cascade has kept the transaction, the document is already
  // deleted: leaving the sheet is not a cancel, and the parent has to
  // show the receipt as it now is. Once the receipt is gone, leaving is
  // the same as the delete completing.
  const handleClose = () => (finished ? onDeleted() : kept ? onKept() : onClose());

  const recordOthers = (soft: string[], hard: string[]) => {
    if (soft.length === 0 && hard.length === 0) return;
    othersRef.current = {
      soft: [...othersRef.current.soft, ...soft],
      hard: [...othersRef.current.hard, ...hard],
    };
    setOthers(othersRef.current);
  };

  const handleProblem = (problem: ParsedProblem): boolean => {
    const ext = problem.extensions ?? {};
    if (problem.code === 'cascade-blocked-reconciled') {
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
    if (problem.code === 'cannot-delete-reconciled') {
      setState({
        kind: 'block-cannot-delete-reconciled',
        message: problem.detail ?? problem.title,
      });
      return true;
    }
    if (problem.code === 'document-has-links') {
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

  /** The transaction as the server has it now, rather than as the page
   *  had it cached when the sheet opened: whether it is still live, and
   *  which of its documents are. A 404 is an answer (someone hard-deleted
   *  it), not a failure. */
  const readBack = async (): Promise<{ deleted: boolean; live: string[] }> => {
    try {
      const { data } = await getTransaction(transactionId);
      return {
        deleted: data.deleted_at != null,
        live: data.documents.filter((d) => d.deleted_at == null).map((d) => d.id),
      };
    } catch (err) {
      if (parseProblem(err).status === 404) return { deleted: true, live: [] };
      throw err;
    }
  };

  /** The cascade is done and cannot be taken back, so failing to read
   *  the count must not turn into an error: say "kept" without a number.
   *  But a transaction that is no longer live was not kept, whoever
   *  deleted it: another tab's cascade can land between this one and the
   *  read-back, and "still in your ledger" would then be false. */
  const keptOutcome = async (hard: boolean): Promise<Outcome> => {
    const now = await readBack().catch(() => null);
    if (now?.deleted) return { kind: 'done' };
    return { kind: 'kept', hard, remaining: now ? now.live.length : null };
  };

  const cascade = async (docId: string, hard: boolean): Promise<boolean> => {
    const report = await cascadeDeleteDocument(docId, { hard });
    // A hard cascade removes the document row, so there is nothing to
    // restore and no tombstone to remember.
    if (!hard) addTombstone(docId);
    recordOthers(
      report.transactions_soft_deleted.filter((id) => id !== transactionId),
      report.transactions_hard_deleted.filter((id) => id !== transactionId),
    );
    return report.transactions_kept.includes(transactionId);
  };

  const deleteMut = useMutation({
    mutationFn: async (v: Step): Promise<Outcome> => {
      if (v.step === 'remaining') {
        // The follow-up: cascade each document that still supports the
        // transaction. The one that is its last live evidence takes the
        // transaction with it, and the report says when that happened.
        const now = await readBack();
        if (now.deleted) return { kind: 'done' };
        for (const docId of now.live) {
          const stillKept = await cascade(docId, v.hard);
          if (!stillKept) return { kind: 'done' };
        }
        return keptOutcome(v.hard);
      }
      switch (v.mode) {
        case 'soft':
          if (!documentId) throw new Error('No document linked');
          await softDeleteDocument(documentId);
          addTombstone(documentId);
          return { kind: 'done' };
        case 'cascade-soft':
        case 'cascade-hard': {
          if (!documentId) throw new Error('No document linked');
          const hard = v.mode === 'cascade-hard';
          const stillKept = await cascade(documentId, hard);
          return stillKept ? keptOutcome(hard) : { kind: 'done' };
        }
        case 'hard-txn': {
          const etag = v.etag ?? transactionEtag;
          if (!etag) throw new Error('Missing ETag — refresh and retry.');
          await hardDeleteTransaction(transactionId, etag);
          return { kind: 'done' };
        }
      }
    },
    onMutate: () => setState({ kind: 'working' }),
    onSuccess: (outcome) => {
      if (outcome.kind === 'done') {
        const o = othersRef.current;
        if (o.soft.length === 0 && o.hard.length === 0) {
          onDeleted();
          return;
        }
        setFinished(true);
        setState({ kind: 'idle' });
        return;
      }
      setKept({ hard: outcome.hard, remaining: outcome.remaining });
      setState({ kind: 'idle' });
    },
    onError: (err: unknown, v) => {
      // A follow-up that stopped part-way has deleted some of the
      // documents it was counting; drop the number rather than show a
      // stale one.
      if (v.step === 'remaining') setKept((k) => (k ? { ...k, remaining: null } : k));
      const problem = parseProblem(err);
      if (problem.status === 412) {
        // The transaction changed after the page read it (another tab,
        // or an unreconcile whose new tag this sheet never got). Retrying
        // with the same tag can only fail again, so have the page read it
        // afresh; the next attempt sends the new tag.
        setFreshEtag(null);
        queryClient.invalidateQueries({ queryKey: qk.receipt(transactionId) });
        setState({
          kind: 'error',
          message:
            'This receipt changed after the page loaded it. The page has been refreshed; check it, then delete again.',
        });
        return;
      }
      const handled = handleProblem(problem);
      if (!handled) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  /** Run (or re-run) whichever step the sheet is on. `etag` is a tag the
   *  caller has just been handed for this transaction, newer than the
   *  page's. */
  const runDelete = (etag?: string | null) =>
    deleteMut.mutate(
      kept
        ? { step: 'remaining', hard: kept.hard }
        : { step: 'first', mode, etag: etag ?? freshEtag },
    );

  const handleConfirm = () => {
    if (!kept && mode === 'cascade-hard' && !confirmHardOk) return;
    runDelete();
  };

  const renderOptions = () => (
    <div className="space-y-3">
      {documentId === null && hasDeletedDocument && (
        // A live transaction whose documents are all soft-deleted. The
        // app has no reversible delete for a transaction on its own, so
        // the one option below is permanent; Restore document on the
        // receipt is the way back, and the user should see both.
        <p className="text-xs text-on-surface-variant">
          Every document of this receipt is already deleted, so only the transaction is left,
          and deleting it is permanent. To bring the receipt back instead, close this and
          choose Restore document.
        </p>
      )}
      {documentId !== null &&
        (['soft', 'cascade-soft', 'cascade-hard'] as const).map((m) => (
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
            transaction that no other document supports will be permanently destroyed.
          </span>
        </label>
      )}
    </div>
  );

  // After a kept cascade "back" returns to the kept panel: the options
  // are for a document that is already deleted.
  const backLabel = kept ? 'Back' : 'Back to options';

  /** The other transactions a cascade in this sheet took with it, by short
   *  id (the same `tx_` form as the sheet's header). A soft-deleted one
   *  still has a receipt page, opened in a new tab so this sheet and the
   *  page under it stay as they are. */
  const renderOthers = () => {
    const n = others.soft.length + others.hard.length;
    if (n === 0) return null;
    return (
      <div className="flex items-start gap-3 rounded-xl bg-error/10 p-4">
        <AlertTriangle className="mt-0.5 flex-shrink-0 text-error" size={20} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            {n === 1 ? 'Another transaction was' : `${n} other transactions were`} deleted too
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            The deleted file was also the only document of{' '}
            {n === 1 ? 'another purchase' : `${n} other purchases`}, so the cascade removed{' '}
            {n === 1 ? 'it' : 'them'} with it.
          </p>
          <ul className="mt-2 space-y-1" data-testid="delete-others">
            {others.soft.map((id) => (
              <li key={id} className="flex items-center gap-2 text-xs">
                <Link
                  {...receiptLink(id)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-primary underline"
                >
                  tx_{id.slice(0, 8)}
                </Link>
                <span className="text-on-surface-variant">marked deleted</span>
              </li>
            ))}
            {others.hard.map((id) => (
              <li key={id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-on-surface-variant">tx_{id.slice(0, 8)}</span>
                <span className="text-error">permanently deleted</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  const renderKept = (k: KeptState) => {
    const working = state.kind === 'working';
    const n = k.remaining;
    const supporters =
      n === null ? 'another document' : n === 1 ? 'another document' : `${n} other documents`;
    const target =
      n === null
        ? 'the remaining documents'
        : n === 1
          ? 'the other document'
          : `the other ${n} documents`;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-[color:rgba(188,134,36,0.12)] p-4">
          <AlertTriangle className="mt-0.5 flex-shrink-0 text-[var(--color-amber)]" size={20} />
          <div>
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              {k.hard ? 'Document permanently deleted' : 'Document deleted'} · the transaction
              was kept
            </p>
            {n === 0 ? (
              // Reached when the other document went between the cascade
              // and the read-back without the transaction (a plain
              // "Remove document only" elsewhere). What is left to do is
              // permanent, and the sheet must not pass that off as the
              // reversible delete the user picked.
              <p className="mt-1 text-xs text-on-surface-variant">
                The transaction is still in your ledger and has no document left. Removing it
                now is permanent: Delete… on the receipt, then Hard delete the transaction.
                {k.hard
                  ? ''
                  : ' To undo instead, Restore document on the receipt brings the file back.'}
              </p>
            ) : (
              <p className="mt-1 text-xs text-on-surface-variant">
                It is still in your ledger because {supporters} still support
                {n !== null && n > 1 ? '' : 's'} it. Deleting one file never deletes a purchase
                that another file documents. To remove the transaction as well, delete {target}{' '}
                too. A file that is also the only document of another purchase takes that
                purchase with it, and you will see which.
              </p>
            )}
          </div>
        </div>

        {renderOthers()}

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
            onClick={onKept}
            disabled={working}
            data-testid="delete-kept-keep"
            className="flex-1 rounded-[var(--radius-pill)] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-paper-deep)] py-3 font-display text-[13.5px] font-medium text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
          >
            {n === 0 ? 'Done' : 'Keep the transaction'}
          </button>
          {n !== 0 && (
            <button
              onClick={() => runDelete()}
              disabled={working}
              data-testid="delete-kept-remaining"
              className={cn(
                'flex-[1.4] py-3 px-3 rounded-xl text-[13.5px] font-bold leading-tight transition-all flex items-center justify-center gap-2 bg-error text-on-error hover:scale-[1.02] active:scale-95',
                working && 'opacity-50 cursor-not-allowed hover:scale-100',
              )}
            >
              {working ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Deleting...
                </>
              ) : (
                `${k.hard ? 'Permanently delete' : 'Delete'} ${target} too`
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderBlockCascadeReconciled = () => (
    <div className="space-y-4">
      <button
        onClick={() => setState({ kind: 'idle' })}
        className="flex items-center gap-2 text-sm text-primary hover:opacity-80 transition-opacity"
      >
        <ArrowLeft size={16} />
        {backLabel}
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
        {backLabel}
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
        {backLabel}
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
          deleteMut.mutate({ step: 'first', mode: 'cascade-hard' });
        }}
        className="w-full py-3 rounded-xl bg-error text-on-error font-bold hover:scale-[1.02] active:scale-95 transition-all"
      >
        Delete with linked transactions
      </button>
    </div>
  );

  const renderFinished = () => (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        This receipt is deleted.
      </p>
      {renderOthers()}
      <button
        onClick={onDeleted}
        data-testid="delete-finished-done"
        className="w-full rounded-[var(--radius-pill)] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-paper-deep)] py-3 font-display text-[13.5px] font-medium text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
      >
        Done
      </button>
    </div>
  );

  const onUnreconciled = (etag: string | null) => {
    const target = unreconcileTarget;
    setUnreconcileTarget(null);
    // The flip changed that transaction's status and version. Without a
    // refetch the receipt page goes on saying "Reconciled", keeps the
    // cascade options disabled, and holds an ETag one version behind.
    if (target) queryClient.invalidateQueries({ queryKey: qk.receipt(target) });
    queryClient.invalidateQueries({ queryKey: qk.transactions.all });
    // The retry below runs before that refetch lands, so hand it the tag
    // the unreconcile answered with: the page's is now stale, and a hard
    // delete sent with it is a 412 every time.
    const ownEtag = target === transactionId ? etag : null;
    if (ownEtag) setFreshEtag(ownEtag);
    if (state.kind === 'block-cannot-delete-reconciled') {
      // The receipt's own transaction was unreconciled — retry the
      // step that was blocked.
      runDelete(ownEtag);
      return;
    }
    if (state.kind === 'block-cascade-reconciled') {
      // Drop the unreconciled txn from the list. If it's now empty,
      // auto-retry; otherwise wait for the user to click Retry.
      const remaining = (state.reconciledTxnIds ?? []).filter((x) => x !== target);
      if (remaining.length === 0) {
        runDelete(ownEtag);
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
              onClick={state.kind === 'working' ? undefined : handleClose}
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
                    {finished ? (
                      'Receipt deleted'
                    ) : kept ? (
                      'Transaction kept'
                    ) : (
                      <>
                        Delete this receipt<em className="italic text-[var(--color-accent)]">?</em>
                      </>
                    )}
                  </h2>
                  <p className="mt-0.5 truncate font-mono text-[9px] tracking-[0.04em] text-[var(--color-ink-muted)]">
                    {documentId ? `doc_${documentId.slice(0, 8)} · ` : ''}tx_{transactionId.slice(0, 8)} · double-entry
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  disabled={state.kind === 'working'}
                  aria-label="Close"
                  className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 pb-6 pt-3">
                {finished && renderFinished()}

                {!finished && state.kind === 'block-cascade-reconciled' && renderBlockCascadeReconciled()}
                {!finished && state.kind === 'block-cannot-delete-reconciled' && renderBlockCannotDeleteReconciled()}
                {!finished && state.kind === 'block-document-has-links' && renderBlockDocumentHasLinks()}

                {!finished &&
                  kept &&
                  (state.kind === 'idle' || state.kind === 'working' || state.kind === 'error') &&
                  renderKept(kept)}

                {!finished && !kept && (state.kind === 'idle' || state.kind === 'working' || state.kind === 'error') && (
                  <>
                    {documentId !== null && (
                      <p className="text-sm text-on-surface-variant">
                        Three tiers — pick how far this goes.
                      </p>
                    )}

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

/** Border treatment for an option row. The hard tier carries the cardinal
 *  outline at two strengths (rest / selected); every other tier uses the
 *  neutral rule. Kept out of the JSX so the 2x2 reads as two lines. */
function optionBorderClass(tier: 'safe' | 'cascade' | 'hard', selected: boolean): string {
  if (tier === 'hard') {
    return selected
      ? 'border-[color:rgba(181,52,26,0.6)]'
      : 'border-[color:rgba(181,52,26,0.35)] hover:border-[color:rgba(181,52,26,0.6)]';
  }
  return selected
    ? 'border-[var(--color-ink-muted)]'
    : 'border-[var(--color-rule-soft)] hover:border-[var(--color-rule)]';
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
        optionBorderClass(tier, selected),
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
        {disabledReason && (
          <span className="mt-1.5 block font-mono text-[9px] text-[var(--color-accent)]">
            ⚿ {disabledReason}
          </span>
        )}
      </span>
    </button>
  );
}
