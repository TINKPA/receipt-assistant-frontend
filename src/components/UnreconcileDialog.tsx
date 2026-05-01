import React from 'react';
import ConfirmActionDialog from './ConfirmActionDialog';
import { getTransaction, unreconcileTransaction } from '../lib/api';

interface UnreconcileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** ID of the reconciled transaction to flip back to `posted`. */
  transactionId: string | null;
  /** Called after successful unreconcile so the parent can refresh. */
  onUnreconciled: () => void;
}

/** Reusable dialog for the `reconciled → posted` flip. Composes
 *  `ConfirmActionDialog` and handles the etag round-trip internally so
 *  callers don't need to fetch the txn first. */
export default function UnreconcileDialog({
  isOpen,
  onClose,
  transactionId,
  onUnreconciled,
}: UnreconcileDialogProps) {
  const handleConfirm = async (reason: string) => {
    if (!transactionId) throw new Error('No transaction selected');
    const { etag } = await getTransaction(transactionId);
    if (!etag) throw new Error('Missing ETag — refresh and retry.');
    await unreconcileTransaction(
      transactionId,
      reason.trim() ? reason.trim() : undefined,
      etag,
    );
    onUnreconciled();
  };

  return (
    <ConfirmActionDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Unreconcile this transaction?"
      message={
        <>
          <p>
            Flips the state from <strong>reconciled</strong> back to{' '}
            <strong>posted</strong>. The bank-line match is not auto-cleared
            on the server side — you'll need to re-match it later if you
            want it reconciled again.
          </p>
          <p className="mt-2 text-xs text-on-surface-variant/70">
            This is the audited escape hatch you must use before hard-deleting
            or cascade-deleting a reconciled row.
          </p>
        </>
      }
      confirmLabel="Unreconcile"
      requireReason
      reasonPlaceholder="Why are you unreconciling? (optional, recorded in audit log)"
      onConfirm={handleConfirm}
    />
  );
}
